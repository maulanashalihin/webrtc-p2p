# webrtc-p2p-call

Video call + chat **peer-to-peer** untuk 2 orang. Server hanya untuk signaling (kenalan); video dan chat jalan langsung browser-ke-browser, terenkripsi DTLS.

Live: `https://webrtc.maulanabuilds.com` — buka di 2 browser (mis. Brave + Chrome), masuk room yang sama, atau kirim link invite.

## Cara pakai

1. Buka halaman → **📹 Join + kamera** (atau 💬 chat saja).
2. Klik **🔗 Salin link invite** → buka di browser/HP lain.
3. `🟢 P2P TERHUBUNG` = media sudah langsung antar browser.

Halaman `/loopback.html` = mode belajar 1-halaman (offer/answer/ICE step-by-step).

## Jalan lokal

```bash
bun server.ts            # http://localhost:8090
PORT=8080 bun server.ts  # port lain
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

Client otomatis ambil kredensial dari `/turn-cred`, coba jalur langsung dulu, lalu `ice-restart` via TURN kalau gagal. Tombol **📋 Debug** menyalin info kandidat (host/srflx = langsung, relay = via TURN).

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

## Uji E2E (2 browser headless beneran)

```bash
npm i
npx playwright install chromium
npm run test:e2e                              # lokal
E2E_URL=http://localhost:8090/?relay=1 npm run test:e2e   # paksa semua media via TURN
```

## Arsitektur

```
Browser A  ←─signaling (WS /ws: join, offer, answer, ice)─→  Server (Bun)
   ↕                                                              ↕
   ╰─── media P2P: DTLS-SCTP (chat) + DTLS-SRTP (video) ───╮
                                                           ╰→ Browser B
                                    (via TURN relay kalau direct gagal)
```

* Maks 2 peer per room (dibatasi server; WebRTC-nya sendiri tidak peduli).
* Rame-rame butuh SFU (LiveKit/Janus/mediasoup), bukan mesh — lihat diskusi di README tidak ada, tanya maintainer.
* Kredensial TURN di endpoint itu statis: putar berkala. Untuk produksi, ganti ke TURN REST API (`use-auth-secret` di coturn + password HMAC ber-TTL di `/turn-cred`).

## Batasan

* Butuh HTTPS (atau localhost) untuk `getUserMedia`.
* NAT simetris di kedua sisi tanpa TURN = gagal tersambung (status merah jujur, bukan loading selamanya).

MIT.
