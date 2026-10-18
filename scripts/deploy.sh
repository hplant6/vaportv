#!/bin/bash
# Builds the AppImage, installs it on the box and restarts steamtv there so the
# new version is what's on screen. Also refreshes the auto-start script.
set -euo pipefail
HOST=${STEAMTV_HOST:-steamos}
cd "$(dirname "$0")/.."

npm run dist >/tmp/steamtv-dist.log 2>&1 || { tail -20 /tmp/steamtv-dist.log; exit 1; }
# The box keeps its original file name: its Steam shortcut points there.
scp -q dist/vaporTV.AppImage "$HOST:Applications/steamtv.AppImage.new"
scp -q session/steamtv-autostart.sh "$HOST:.local/bin/steamtv-autostart"
ssh "$HOST" bash -s <<'EOF'
set -euo pipefail
# vaporTV's Steam shortcut id, which it records each time Steam starts it.
APPID=$(. ~/.config/steamtv/steam-shortcut.env 2>/dev/null && echo "${STEAMTV_APPID:-}")
mv ~/Applications/steamtv.AppImage.new ~/Applications/steamtv.AppImage
chmod +x ~/Applications/steamtv.AppImage ~/.local/bin/steamtv-autostart
if ! pgrep -x gamescope-wl >/dev/null; then
  echo "Installed. Not in Gaming Mode, so steamtv wasn't restarted."
  exit 0
fi
# Don't pull steamtv out from under someone: restart only if it's what's on screen
# (its own processes are steamtv / vaportv and the AppImage launcher, steamtv.AppImag)
# and it hasn't launched an emulator (which runs inside steamtv's Steam session).
reaper=$( [ -n "$APPID" ] && pgrep -f "^$HOME/.local/share/Steam/ubuntu12_32/reaper SteamLaunch AppId=$APPID" || true)
if [ -n "$reaper" ] && pgrep -P "$reaper" | xargs -r ps -o comm= -p | grep -qviE '^(steamtv|vaportv)'; then
  echo "Installed. An emulator is running inside steamtv; the update applies next time steamtv starts."
  exit 0
fi
# On screen is fine as steamtv ($APPID) or Steam's own UI (769); anything else is
# a game or app in use.
if pgrep '^(steamtv|vaportv)$' >/dev/null && ! DISPLAY=:0 xprop -root GAMESCOPE_FOCUSED_APP_GFX | grep -qwE "${APPID:-none}|769"; then
  echo "Installed. A game or app is on screen; the update applies next time steamtv starts."
  exit 0
fi
if pgrep '^(steamtv|vaportv)$' >/dev/null; then
  kill "$(pgrep -o '^(steamtv|vaportv)$')"
  if ! timeout 20 bash -c 'while pgrep "^(steamtv|vaportv)$" >/dev/null; do sleep 1; done'; then
    echo "steamtv didn't close in 20s; forcing it"
    pkill -9 '^(steamtv|vaportv)$' || true
    sleep 2
  fi
  sleep 2
fi
systemctl --user start steamtv-autostart.service
journalctl --user -u steamtv-autostart --since -1min -o cat --no-pager | grep steamtv-autostart: | tail -3
sleep 2
DISPLAY=:0 xprop -root GAMESCOPE_FOCUSED_APP_GFX | grep -qw "${APPID:-none}" && echo "steamtv is on screen" || echo "WARNING: steamtv is not on screen"
EOF
