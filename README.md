# webrtc-p2p-call

Video call + chat **peer-to-peer** hingga 4 orang (mesh). Server hanya untuk signaling (kenalan); video dan chat jalan langsung antar browser, terenkripsi DTLS.

Live: `https://webrtc.maulanabuilds.com` — buka di beberapa browser, masuk room yang sama, atau kirim link invite.

## Cara pakai

1. Isi nama → **📹 Lanjut + kamera** (atau 💬 chat saja) → cek kamera/mic/speaker di pre-join → **Masuk room**.
2. Klik **🔗 Invite** → buka di browser/HP lain (maks 4 per room).
3. Indikator hijau `bagus • langsung` = media langsung antar browser; `via relay` = via TURN.
4. Pembuat room bisa **🔒 Kunci** dengan PIN.

Halaman `/loopback.html` = mode belajar 1-halaman (offer/answer/ICE step-by-step).

## Jalan lokal

```bash
bun server.ts                              # http://localhost:8090
PORT=8080 ROOM_MAX=4 bun server.ts         # port + kapasitas room lain
```

Tanpa TURN pun jalan di jaringan longgar (host/srflx candidates). Untuk NAT ketat, pasang TURN:

```bash
sudo apt install coturn
```

`/etc/turnserver.conf` minimal:

```
listening-port=3478
min-port=49160
max-port=49200
realm=example.com
server-name=example.com
lt-cred-mech
user=webrtc:GANTI_PASSWORD_ACAK
no-tls
no-dtls
no-cli
```

```bash
TURN_HOST=IP_PUBLIK_MESIN TURN_USER=webrtc TURN_PASSWORD=GANTI_PASSWORD_ACAK bun server.ts
```

Client otomatis ambil kredensial dari `/turn-cred`, coba jalur langsung dulu, lalu `ice-restart` via TURN kalau gagal. Tombol **📋 Debug** menyalin info kandidat per peer.

### Rotasi kredensial TURN

Password dibaca segar tiap request ke `/turn-cred`, jadi rotasi tanpa restart signaling
(call yang sedang via relay akan dinegosiasi ulang — putar di jam sepi):

```bash
./ops/rotate-turn.sh   # butuh sudo untuk /etc/turnserver.conf + systemctl
```

### Monitoring

* `GET /metrics` → uptime, rooms, peers, joins, pesan signaling, penolakan (full/locked/rate-limit).
* Log JSON per baris (`join`/`leave`/`lock`) — cocok untuk jq/Loki.
* Rate-limit: 20 join/IP/menit; room `[a-z0-9-]{1,32}`; pesan signaling maks 64KB.

## Uji E2E (browser headless beneran)

```bash
npm i
npx playwright install chromium
npm run test:e2e                                # 2 orang, alur UI penuh
npm run test:mesh                               # 3 orang mesh + chat broadcast
npm run test:proto                              # protokol signaling (butuh bun atau node 22+)
E2E_URL=http://localhost:8090/?relay=1 npm run test:e2e   # paksa semua media via TURN
```

## Arsitektur

```
Browser A  ←─signaling (WS /ws: join, offer, answer, ice)─→  Server (Bun)
   ↕                                                              ↕
   ╰─── mesh P2P: DTLS-SCTP (chat) + DTLS-SRTP (video), N−1 koneksi per browser
                                    (via TURN relay kalau direct gagal)
```

* Maks 4 peer per room (mesh; `ROOM_MAX` di server). Tiap browser buka 1 `RTCPeerConnection` per lawan; offer/answer/ICE diroute tertarget via `to`/`from`. Tabrakan offer dimenangkan id terkecil (deterministik di kedua sisi).
* Rame-rame lebih besar butuh SFU (LiveKit/Janus/mediasoup), bukan mesh.
* Kredensial TURN di endpoint itu statis: putar berkala (`ops/rotate-turn.sh`). Untuk produksi, ganti ke TURN REST API (`use-auth-secret` di coturn + password HMAC ber-TTL di `/turn-cred`).

## Batasan

* Butuh HTTPS (atau localhost) untuk `getUserMedia`.
* NAT simetris di kedua sisi tanpa TURN = gagal tersambung (status merah jujur + ice-restart otomatis).
* Mesh 4 orang ≈ tiap browser upload 3x video — laptop/HP modern masih nyaman; di atas itu pakai SFU.

MIT.
