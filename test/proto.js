// Protokol v2: join/nama/lock/full/validasi/target/metrics/rate-limit.
const BASE = "ws://127.0.0.1:8090/ws";
const results = [];
function ok(name, cond) {
  results.push([cond ? "PASS" : "FAIL", name]);
}
function conn() {
  return new Promise((resolve, reject) => {
    const ws = new WebSocket(BASE);
    const got = [];
    ws.onmessage = (ev) => got.push(JSON.parse(String(ev.data)));
    ws.onopen = () => resolve({ ws, got });
    ws.onerror = reject;
  });
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
const last = (got, t) => got.filter((m) => m.t === t).at(-1);

const R = "pv2-" + Math.random().toString(36).slice(2, 8);
// 1. join + nama
const a = await conn();
a.ws.send(JSON.stringify({ t: "join", room: R, name: "Andi" }));
await wait(300);
const ja = last(a.got, "joined");
ok("join initiator + nama", ja && ja.initiator === true && ja.you && ja.peers.length === 1);
// 2. peer kedua
const b = await conn();
b.ws.send(JSON.stringify({ t: "join", room: R, name: "Budi" }));
await wait(300);
const jb = last(b.got, "joined");
ok("join kedua peers=2", jb && jb.initiator === false && jb.peers.length === 2);
const pj = last(a.got, "peer-joined");
ok("peer-joined bawa nama", pj && pj.peer.name === "Budi" && pj.peer.id === jb.you);
// 3. pesan tertarget + from
a.ws.send(JSON.stringify({ t: "offer", to: jb.you, sdp: "X" }));
await wait(300);
const ob = last(b.got, "offer");
ok("offer tertarget + from", ob && ob.sdp === "X" && ob.from === ja.you);
ok("pengirim tak terima gema", !a.got.some((m) => m.t === "offer"));
// 4. room penuh
const c = await conn();
c.ws.send(JSON.stringify({ t: "join", room: R, name: "Cici" }));
await wait(300);
ok("ketiga ditolak full", !!last(c.got, "full"));
// 5. nama room jelek
const d = await conn();
d.ws.send(JSON.stringify({ t: "join", room: "SALAH!!", name: "D" }));
await wait(300);
ok("room invalid ditolak", last(d.got, "error")?.code === "bad-room");
// 6. lock PIN (room baru)
const R2 = "pl-" + Math.random().toString(36).slice(2, 8);
const e = await conn();
e.ws.send(JSON.stringify({ t: "join", room: R2, name: "Eko" }));
await wait(300);
e.ws.send(JSON.stringify({ t: "lock", pin: "1234" }));
await wait(300);
ok("lock-state tersiar", last(e.got, "lock-state")?.locked === true);
const f = await conn();
f.ws.send(JSON.stringify({ t: "join", room: R2, name: "Fajar" }));
await wait(300);
ok("tanpa PIN ditolak locked", !!last(f.got, "locked"));
const g = await conn();
g.ws.send(JSON.stringify({ t: "join", room: R2, name: "Gita", pin: "1234" }));
await wait(300);
ok("dengan PIN boleh masuk", !!last(g.got, "joined"));
// non-initiator tak bisa lock
b.ws.send(JSON.stringify({ t: "lock", pin: "999" }));
await wait(200);
ok("non-initiator tak bisa lock", !b.got.some((m) => m.t === "lock-state" && m.locked === true));
// 7. metrics
const met = await (await fetch("http://127.0.0.1:8090/metrics")).json();
ok("metrics masuk akal", met.joins >= 4 && met.rooms >= 1 && met.uptime >= 0);
// 8. rate-limit (TERAKHIR: menghabiskan kuota IP ini)
let limited = 0;
for (let i = 0; i < 25; i++) {
  const t = await conn();
  t.ws.send(JSON.stringify({ t: "join", room: `rl-${Date.now().toString(36)}-${i}`, name: "S" }));
  await wait(60);
  if (t.got.some((m) => m.t === "rate-limited")) limited++;
  t.ws.close();
}
ok("rate-limit menendang", limited >= 1);

for (const [s, n] of results) console.log(s, "-", n);
const fails = results.filter(([s]) => s === "FAIL").length;
console.log(fails ? "PROTO_FAIL" : "PROTO_OK");
process.exit(fails ? 1 : 0);
