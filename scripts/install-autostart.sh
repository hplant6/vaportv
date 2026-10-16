#!/bin/bash
# Installs (or with --remove, uninstalls) the service that opens steamtv when the
# box starts Gaming Mode. Everything goes under ~deck; no root needed.
set -euo pipefail
HOST=${STEAMTV_HOST:-steamos}
DIR="$(dirname "$0")/../session"

if [ "${1:-}" = "--remove" ]; then
  ssh "$HOST" 'systemctl --user disable steamtv-autostart.service 2>/dev/null || true
    rm -f ~/.config/systemd/user/steamtv-autostart.service ~/.local/bin/steamtv-autostart
    systemctl --user daemon-reload
    echo "steamtv autostart removed"'
  exit 0
fi

ssh "$HOST" 'mkdir -p ~/.local/bin ~/.config/systemd/user'
scp -q "$DIR/steamtv-autostart.sh" "$HOST:.local/bin/steamtv-autostart"
scp -q "$DIR/steamtv-autostart.service" "$HOST:.config/systemd/user/steamtv-autostart.service"
ssh "$HOST" 'chmod +x ~/.local/bin/steamtv-autostart
  systemctl --user daemon-reload
  systemctl --user enable steamtv-autostart.service
  systemctl --user is-enabled steamtv-autostart.service'
