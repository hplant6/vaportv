#!/bin/bash
# Opens steamtv once Gaming Mode's Steam UI is up, so the box boots into it.
# Run by steamtv-autostart.service; does nothing if steamtv is already open.
set -u

# steamtv's non-Steam shortcut: (appid << 32) | 0x02000000. The appid comes from the
# shortcut's exe and name, so it stays the same unless the shortcut is recreated.
GAME_ID=${STEAMTV_GAME_ID:-17864395694370979840}
STEAM_UI_APPID=769
ATTEMPTS=3

log() { echo "steamtv-autostart: $*"; }

steamtv_running() { pgrep -x steamtv >/dev/null; }

# The shortcut's 32-bit app id (GAME_ID >> 32; too big for bash arithmetic).
STEAMTV_APPID=${STEAMTV_APPID:-4159378748}

# What's drawn on screen. (GAMESCOPE_FOCUSED_APP can stay on Steam's UI while
# steamtv is the app actually showing.)
steamtv_in_front() {
  DISPLAY=${DISPLAY:-:0} xprop -root GAMESCOPE_FOCUSED_APP_GFX 2>/dev/null | grep -qw "$STEAMTV_APPID"
}

# Steam picks which app is in front through this list on the root window. After a
# relaunch (not a fresh boot) it sometimes keeps its own UI on top; putting
# steamtv first brings it forward, and Steam rewrites the list on its next launch.
bring_to_front() {
  for _ in $(seq 15); do
    steamtv_in_front && return 0
    sleep 1
  done
  log "Steam kept its UI on top; bringing steamtv forward"
  # Cleared first: setting the value it already has isn't seen as a change.
  DISPLAY=${DISPLAY:-:0} xprop -root -remove GAMESCOPECTRL_BASELAYER_APPID
  DISPLAY=${DISPLAY:-:0} xprop -root -f GAMESCOPECTRL_BASELAYER_APPID 32c \
    -set GAMESCOPECTRL_BASELAYER_APPID "$STEAMTV_APPID,$STEAM_UI_APPID"
}

# Steam drops launch requests that arrive before its UI has finished starting.
# Gamescope lists the apps it can show; Steam's UI joins that list once it's ready.
steam_ui_ready() {
  DISPLAY=${DISPLAY:-:0} xprop -root GAMESCOPE_FOCUSABLE_APPS 2>/dev/null | grep -qw "$STEAM_UI_APPID"
}

if steamtv_running; then
  log "already running"
  exit 0
fi

for _ in $(seq 120); do
  steam_ui_ready && break
  sleep 1
done
if ! steam_ui_ready; then
  log "Steam UI not ready after 2 minutes; giving up"
  exit 1
fi
# Let the UI settle; a launch in its first moments is sometimes ignored.
sleep 3

for attempt in $(seq "$ATTEMPTS"); do
  log "launching (attempt $attempt)"
  steam -ifrunning "steam://rungameid/$GAME_ID" >/dev/null 2>&1
  for _ in $(seq 30); do
    if steamtv_running; then
      log "started"
      bring_to_front
      exit 0
    fi
    sleep 1
  done
done
log "steamtv did not start"
exit 1
