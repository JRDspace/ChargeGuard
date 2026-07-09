#!/usr/bin/env bash
set -euo pipefail
systemctl --user disable --now chargeguard.service || true
rm -f "$HOME/.config/systemd/user/chargeguard.service"
systemctl --user daemon-reload
echo "Removed chargeguard.service"
