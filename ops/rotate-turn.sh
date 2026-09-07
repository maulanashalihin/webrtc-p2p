#!/bin/bash
# Putar password TURN tanpa restart signaling.
# Server baca password segar tiap request /turn-cred, jadi cukup:
# baru -> /etc/turnserver.conf + file password -> restart coturn.
# Catatan: call yang SEDANG via relay akan gagal auth berikutnya
# (client ice-restart otomatis). Putar di jam sepi.
set -euo pipefail

PASS_FILE="${TURN_PASSWORD_FILE:-/tmp/webrtc-turn-password}"
CONF="${TURN_CONF:-/etc/turnserver.conf}"
USER="${TURN_USER:-webrtc}"

openssl rand -hex 24 > "$PASS_FILE"
chmod 600 "$PASS_FILE"
PASS="$(tr -d '\n' < "$PASS_FILE")"
sudo sed -i "s/^user=${USER}:.*/user=${USER}:${PASS}/" "$CONF"
sudo systemctl restart coturn
echo "TURN password rotated. Verify: curl localhost:8090/metrics"
