// Signaling server WebRTC: static file + WebSocket relay per-room (maks 2 peer).
// Bun, tanpa dependency. Kredensial TURN via env, tak pernah hardcode.


type WSD = { room: string | null; id: string };

const ROOT = import.meta.dir;
const PORT = Number(process.env.PORT ?? 8090);
const rooms = new Map<string, Set<any>>();

// TURN (opsional tapi dianjurkan untuk NAT ketat). Tanpa ini client tetap jalan jalur langsung.
const TURN_HOST = process.env.TURN_HOST ?? "";
const TURN_USER = process.env.TURN_USER ?? "webrtc";
const TURN_PASS = process.env.TURN_PASSWORD ?? "";
const TURN_TTL = 3600;

function turnCred() {
  // Kredensial statis (sama persis dengan `user=` di turnserver.conf).
  // Putar berkala via env; untuk hardening lihat README (TURN REST API).
  if (!TURN_PASS || !TURN_HOST) return null;
  return {
    username: TURN_USER,
    password: TURN_PASS,
    uris: [`turn:${TURN_HOST}:3478?transport=udp`, `turn:${TURN_HOST}:3478?transport=tcp`],
  };
}

function roomOf(ws: any): string | null {
  return (ws.data as WSD).room;
}

Bun.serve<WSD>({
  port: PORT,
  async fetch(req, server) {
    const url = new URL(req.url);
    if (url.pathname === "/ws") {
      if (server.upgrade(req, { data: { room: null, id: crypto.randomUUID() } })) return;
      return new Response("websocket upgrade gagal", { status: 500 });
    }
    if (url.pathname === "/turn-cred") {
      const c = turnCred();
      if (!c) return new Response("turn off", { status: 503 });
      return Response.json(c);
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
      let m: any;
      try {
        m = JSON.parse(String(raw));
      } catch {
        return;
      }
      if (m.t === "join") {
        const room = String(m.room || "").slice(0, 32);
        if (!room) return;
        let set = rooms.get(room);
        if (!set) {
          set = new Set();
          rooms.set(room, set);
        }
        if ((ws.data as WSD).room === room) return; // sudah join
        if (set.size >= 2) {
          ws.send(JSON.stringify({ t: "full" }));
          return;
        }
        (ws.data as WSD).room = room;
        set.add(ws);
        const initiator = set.size === 1;
        ws.send(JSON.stringify({ t: "joined", initiator, peers: set.size }));
        for (const p of set) if (p !== ws) p.send(JSON.stringify({ t: "peer-joined", peers: set.size }));
        return;
      }
      if (m.t === "offer" || m.t === "answer" || m.t === "ice") {
        const room = roomOf(ws);
        if (!room) return;
        const set = rooms.get(room);
        if (!set) return;
        const out = JSON.stringify(m);
        for (const p of set) if (p !== ws) p.send(out);
        return;
      }
    },
    close(ws: any) {
      const room = roomOf(ws);
      if (!room) return;
      const set = rooms.get(room);
      if (!set) return;
      set.delete(ws);
      for (const p of set) p.send(JSON.stringify({ t: "peer-left" }));
      if (set.size === 0) rooms.delete(room);
    },
  },
});

console.log(`webrtc-p2p serving ${ROOT} on :${PORT}`);
