#!/bin/bash
# Puts the development build of vaporTV for Netflix on the box, for Chrome's "Load
# unpacked" (Developer mode): manifest.dev.json as its manifest, which adds debug.js, so
# F8 on Netflix reloads it and F9 dumps the page to ~/.cache/steamtv/netflix-debug/.
# Chrome's packed copy (from the policy) runs too, so turn that off in chrome://extensions
# while developing.
set -euo pipefail
HOST=${STEAMTV_HOST:-steamos}
cd "$(dirname "$0")/../extensions/netflix"
ssh "$HOST" mkdir -p Documents/vaportv-netflix
scp -q netflix.js netflix.css debug.js "$HOST:Documents/vaportv-netflix/"
scp -q manifest.dev.json "$HOST:Documents/vaportv-netflix/manifest.json"
echo "Copied to ~/Documents/vaportv-netflix; press F8 on Netflix to reload it."
