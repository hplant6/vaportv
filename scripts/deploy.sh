#!/bin/bash
# Builds the AppImage, installs it on the box and restarts steamtv there so the
# new version is what's on screen. Also refreshes the auto-start script.
set -euo pipefail
HOST=${STEAMTV_HOST:-steamos}
cd "$(dirname "$0")/.."

npm run dist >/tmp/steamtv-dist.log 2>&1 || { tail -20 /tmp/steamtv-dist.log; exit 1; }
scp -q dist/steamtv.AppImage "$HOST:Applications/steamtv.AppImage.new"
scp -q session/steamtv-autostart.sh "$HOST:.local/bin/steamtv-autostart"
ssh "$HOST" bash -s <<'EOF'
set -euo pipefail
mv ~/Applications/steamtv.AppImage.new ~/Applications/steamtv.AppImage
chmod +x ~/Applications/steamtv.AppImage ~/.local/bin/steamtv-autostart
if ! pgrep -x gamescope-wl >/dev/null; then
  echo "Installed. Not in Gaming Mode, so steamtv wasn't restarted."
  exit 0
fi
# Don't pull steamtv out from under someone: restart only if it's what's on screen
# and it hasn't launched an emulator (which runs inside steamtv's Steam session).
reaper=$(pgrep -f '^/home/deck/.local/share/Steam/ubuntu12_32/reaper SteamLaunch AppId=4159378748' || true)
if [ -n "$reaper" ] && pgrep -P "$reaper" | xargs -r ps -o comm= -p | grep -qv steamtv; then
  echo "Installed. An emulator is running inside steamtv; the update applies next time steamtv starts."
  exit 0
fi
# On screen is fine as steamtv (4159378748) or Steam's own UI (769); anything else is
# a game or app in use.
if pgrep -x steamtv >/dev/null && ! DISPLAY=:0 xprop -root GAMESCOPE_FOCUSED_APP_GFX | grep -qwE '4159378748|769'; then
  echo "Installed. A game or app is on screen; the update applies next time steamtv starts."
  exit 0
fi
if pgrep -x steamtv >/dev/null; then
  kill "$(pgrep -o -x steamtv)"
  if ! timeout 20 bash -c 'while pgrep -x steamtv >/dev/null; do sleep 1; done'; then
    echo "steamtv didn't close in 20s; forcing it"
    pkill -9 -x steamtv || true
    sleep 2
  fi
  sleep 2
fi
systemctl --user start steamtv-autostart.service
journalctl --user -u steamtv-autostart --since -1min -o cat --no-pager | grep steamtv-autostart: | tail -3
sleep 2
DISPLAY=:0 xprop -root GAMESCOPE_FOCUSED_APP_GFX | grep -qw 4159378748 && echo "steamtv is on screen" || echo "WARNING: steamtv is not on screen"
EOF
