#!/bin/bash
# Copies the SteamOS box's Steam data (config, manifests, and art for recently
# played games) into fixtures/box/Steam, laid out like the real Steam folder, so
# the library scanners can run on the dev PC: STEAMTV_STEAM_ROOT=fixtures/box/Steam.
set -euo pipefail
HOST=${STEAMTV_HOST:-steamos}
DAYS=${DAYS:-60}
OUT="$(dirname "$0")/../fixtures/box"

rm -rf "$OUT" && mkdir -p "$OUT"
ssh "$HOST" DAYS="$DAYS" bash -s <<'EOF' | tar -xzf - -C "$OUT"
set -euo pipefail
cd ~/.local/share
S=Steam
# App ids played in the last $DAYS days, from every user's localconfig.vdf.
cutoff=$(( $(date +%s) - DAYS * 86400 ))
ids=$(cat $S/userdata/*/config/localconfig.vdf | python3 -c "
import re, sys
text = sys.stdin.read()
print(' '.join(sorted({a for a, t in re.findall(r'\"(\d+)\"\s*\{[^{}]*?\"LastPlayed\"\s*\"(\d+)\"', text) if int(t) >= $cutoff})))
")
art=()
for id in $ids; do [ -d "$S/appcache/librarycache/$id" ] && art+=("$S/appcache/librarycache/$id"); done
tar -czf - \
  $S/config/loginusers.vdf \
  $S/userdata/*/config/localconfig.vdf \
  $S/userdata/*/config/shortcuts.vdf \
  $S/userdata/*/config/grid \
  $S/userdata/*/config/cloudstorage/cloud-storage-namespace-1.json \
  $S/steamapps/libraryfolders.vdf \
  $S/steamapps/appmanifest_*.acf \
  "${art[@]}"
EOF
# PS3 game metadata (PARAM.SFO + ICON0.PNG), laid out like the box's NZB drive.
ssh "$HOST" bash -s <<'EOF' | tar -xzf - -C "$OUT"
cd /run/media/deck/NZB 2>/dev/null || exit 0
ls -d RPCS3/game/*/PARAM.SFO RPCS3/game/*/ICON0.PNG ps3/*/PS3_GAME/PARAM.SFO ps3/*/PS3_GAME/ICON0.PNG ps3/*/*/PS3_GAME/PARAM.SFO ps3/*/*/PS3_GAME/ICON0.PNG 2>/dev/null | tar -czf - -T -
EOF
du -sh "$OUT"
