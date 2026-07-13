#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
mkdir -p "$HOME/.config/systemd/user"
cat > "$HOME/.config/systemd/user/chargeguard.service" <<EOF
[Unit]
Description=ChargeGuard laptop charger controller

[Service]
WorkingDirectory=$ROOT
EnvironmentFile=-$ROOT/.env
ExecStart=$(command -v node) $ROOT/src/index.js
ExecStop=$(command -v node) $ROOT/scripts/chargeguard-off.js
Restart=always

[Install]
WantedBy=default.target
EOF
systemctl --user daemon-reload
systemctl --user enable --now chargeguard.service
# enable --now does not restart an already-running service, so force a
# restart to pick up new code and settings on reinstall.
systemctl --user restart chargeguard.service
loginctl enable-linger "$USER" >/dev/null 2>&1 || true
echo "Installed chargeguard.service"
