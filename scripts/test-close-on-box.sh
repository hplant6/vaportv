#!/bin/bash
# Run on the box (copy it over), in Gaming Mode with the Steam screensaver off:
#   scp scripts/test-close-on-box.sh steamos:/tmp/ && ssh steamos systemd-run --user --collect /tmp/test-close-on-box.sh
# For each app: launch through Steam, wait until it's on screen, trigger steamtv's
# Select+Start close path (SIGUSR2), then report whether it closed and steamtv is back.
set -a; . /run/user/1000/gamescope-environment; set +a
export DISPLAY=:0
STEAMTV=$(. ~/.config/steamtv/steam-shortcut.env && echo "$STEAMTV_APPID")
on_screen() { xprop -root GAMESCOPE_FOCUSED_APP_GFX | grep -oE '[0-9]+$'; }
reaper_alive() { pgrep -f "^/home/deck/.local/share/Steam/ubuntu12_32/reaper SteamLaunch AppId=$1 " >/dev/null; }
test_app() {
  local name=$1 gameid=$2 appid=$3
  steam -ifrunning "steam://rungameid/$gameid" >/dev/null 2>&1
  local i
  for i in $(seq 60); do [ "$(on_screen)" = "$appid" ] && break; sleep 1; done
  if [ "$(on_screen)" != "$appid" ]; then echo "$name: NEVER CAME ON SCREEN (on screen: $(on_screen))"; return; fi
  sleep 8
  kill -USR2 "$(pgrep -o -x steamtv)"
  for i in $(seq 20); do reaper_alive "$appid" || break; sleep 1; done
  sleep 3
  local alive=$(reaper_alive "$appid" && echo STILL-RUNNING || echo closed)
  echo "$name: app $alive after ${i}s; on screen now: $(on_screen) $( [ "$(on_screen)" = $STEAMTV ] && echo '(steamtv)')"
  if reaper_alive "$appid"; then
    pkill -f "reaper SteamLaunch AppId=$appid " ; sleep 3
  fi
  sleep 3
}
while read -r name gameid appid; do test_app "$name" "$gameid" "$appid"; done <<'LIST'
Netflix 13684710169613697024 3186219877
Disney+ 10283780744803254272 2394379290
VacuumTube 13367299347566297088 3112316911
Emby 17914140044247957504 4170960757
PrimeVideo 12899721724228009984 3003450512
Doki 17268196694009315328 4020565351
JME 16866702416739827712 3927085180
PinballWicked 595960 595960
LIST
echo ALL DONE
