// Signaling server WebRTC v2: static file + WebSocket relay per-room.
// Fitur: id member, nama, lock PIN, pesan tertarget (mesh), validasi,
// rate-limit join per IP, metrics, log terstruktur. Bun, tanpa dependency.
// Konfig via env (lihat README); kredensial tak pernah hardcode.

type WSD = { room: string | null; id: string; ip: string };
type Member = { ws: any; name: string };
type Room = { members: Map<string, Member>; pin: string | null };

const ROOT = import.meta.dir;
const PORT = Number(process.env.PORT ?? 8090);
const ROOM_MAX = Number(process.env.ROOM_MAX ?? 2); // 4 saat client mesh mendarat
const JOIN_LIMIT = 20; // join per IP per menit
const MSG_MAX = 65536; // 64KB per pesan signaling

const rooms = new Map<string, Room>();
const joinsByIp = new Map<string, { n: number; reset: number }>();
const stats = { started: Date.now(), joins: 0, relayed: 0, rejected: 0, rateHits: 0 };

// TURN opsional (tapi dianjurkan untuk NAT ketat). Env dulu, lalu file (untuk mesin sendiri).
let TURN_PASS = process.env.TURN_PASSWORD ?? "";
if (!TURN_PASS && process.env.TURN_PASSWORD_FILE) {
  try {
    TURN_PASS = (await Bun.file(process.env.TURN_PASSWORD_FILE).text()).trim();
  } catch {}
}
const TURN_HOST = process.env.TURN_HOST ?? "";
const TURN_USER = process.env.TURN_USER ?? "webrtc";
const TURN_URIS = TURN_HOST
  ? [`turn:${TURN_HOST}:3478?transport=udp`, `turn:${TURN_HOST}:3478?transport=tcp`]
  : [];

const log = (ev: string, d: Record<string, unknown> = {}) =>
  console.log(JSON.stringify({ t: new Date().toISOString(), ev, ...d }));

function roomOf(ws: any): string | null {
  return (ws.data as WSD).room;
}

function allowJoin(ip: string): boolean {
  const now = Date.now();
  let e = joinsByIp.get(ip);
  if (!e || now > e.reset) {
    e = { n: 0, reset: now + 60000 };
    joinsByIp.set(ip, e);
  }
  e.n++;
  return e.n <= JOIN_LIMIT;
}

function peersOf(room: Room): Array<{ id: string; name: string }> {
  return [...room.members].map(([id, m]) => ({ id, name: m.name }));
}

Bun.serve<WSD>({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      const ip = server.requestIP(req)?.address ?? "unknown";
      if (server.upgrade(req, { data: { room: null, id: crypto.randomUUID(), ip } })) return;
      return new Response("websocket upgrade gagal", { status: 500 });
    }
    if (url.pathname === "/turn-cred") {
      if (!TURN_PASS || !TURN_URIS.length) return new Response("turn off", { status: 503 });
      return Response.json({ username: TURN_USER, password: TURN_PASS, uris: TURN_URIS });
    }
    if (url.pathname === "/metrics") {
      let peers = 0;
      for (const r of rooms.values()) peers += r.members.size;
      return Response.json({
        uptime: Math.floor((Date.now() - stats.started) / 1000),
        rooms: rooms.size,
        peers,
        ...stats,
      });
    }
    const path = url.pathname === "/" ? "/index.html" : url.pathname;
    if (path.includes("..")) return new Response("bad path", { status: 400 });
    const file = Bun.file(ROOT + path);
    if (!(await file.exists())) return new Response("404", { status: 404 });
    const ct = path.endsWith(".html")
      ? "text/html; charset=utf-8"
      : path.endsWith(".js")
        ? "text/javascript; charset=utf-8"
        : path.endsWith(".css")
          ? "text/css; charset=utf-8"
          : "application/octet-stream";
    return new Response(file, { headers: { "content-type": ct, "cache-control": "no-cache" } });
  },
  websocket: {
    open() {},
    message(ws: any, raw) {
      if (String(raw).length > MSG_MAX) return;
      let m: any;
      try {
        m = JSON.parse(String(raw));
      } catch {
        return;
      }
      const me = ws.data as WSD;

      if (m.t === "join") {
        if (!allowJoin(me.ip)) {
          stats.rateHits++;
          ws.send(JSON.stringify({ t: "rate-limited" }));
          return;
        }
        const room = String(m.room || "").slice(0, 32);
        if (!/^[a-z0-9-]{1,32}$/.test(room)) {
          ws.send(JSON.stringify({ t: "error", code: "bad-room" }));
          return;
        }
        const name = String(m.name || "Tamu").slice(0, 24) || "Tamu";
        let r = rooms.get(room);
        if (!r) {
          r = { members: new Map(), pin: null };
          rooms.set(room, r);
        }
        if (me.room === room) return; // sudah join
        if (r.pin && String(m.pin ?? "") !== r.pin) {
          stats.rejected++;
          ws.send(JSON.stringify({ t: "locked" }));
          return;
        }
        if (r.members.size >= ROOM_MAX) {
          stats.rejected++;
          ws.send(JSON.stringify({ t: "full", peers: peersOf(r) }));
          return;
        }
        me.room = room;
        r.members.set(me.id, { ws, name });
        stats.joins++;
        log("join", { room, name, ip: me.ip, peers: r.members.size });
        ws.send(
          JSON.stringify({ t: "joined", you: me.id, initiator: r.members.size === 1, peers: peersOf(r) }),
        );
        for (const [id, p] of r.members)
          if (id !== me.id)
            p.ws.send(JSON.stringify({ t: "peer-joined", peer: { id: me.id, name } }));
        return;
      }

      if (m.t === "lock" || m.t === "unlock") {
        const r = rooms.get(roomOf(ws) ?? "");
        if (!r) return;
        const first = r.members.keys().next().value; // hanya pembuat room
        if (first !== me.id) return;
        r.pin = m.t === "lock" ? String(m.pin || "").slice(0, 16) || null : null;
        if (m.t === "lock" && !r.pin) return;
        log("lock", { room: me.room, locked: !!r.pin });
        for (const [, p] of r.members) p.ws.send(JSON.stringify({ t: "lock-state", locked: !!r.pin }));
        return;
      }

      if (m.t === "offer" || m.t === "answer" || m.t === "ice") {
        const r = rooms.get(roomOf(ws) ?? "");
        if (!r) return;
        stats.relayed++;
        const out = JSON.stringify({ ...m, from: me.id });
        if (m.to && r.members.has(m.to)) {
          r.members.get(m.to)!.ws.send(out); // mesh: tertarget
        } else {
          for (const [id, p] of r.members) if (id !== me.id) p.ws.send(out);
        }
        return;
      }
    },
    close(ws: any) {
      const name = roomOf(ws);
      if (!name) return;
      const r = rooms.get(name);
      if (!r) return;
      const m = r.members.get((ws.data as WSD).id);
      r.members.delete((ws.data as WSD).id);
      log("leave", { room: name, name: m?.name, peers: r.members.size });
      for (const [, p] of r.members)
        p.ws.send(JSON.stringify({ t: "peer-left", peer: { id: (ws.data as WSD).id, name: m?.name } }));
      if (r.members.size === 0) rooms.delete(name);
    },
  },
});

console.log(`webrtc-p2p v2 serving ${ROOT} on :${PORT}`);
