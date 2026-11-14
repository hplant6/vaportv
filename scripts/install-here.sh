#!/bin/bash
# Builds vaporTV and installs it on this machine (run on the box itself, from its copy of the
# code at ~/Projects/vaportv; the Claude app runs it after changing the code). The new version
# starts the next time vaporTV starts. From another computer, use scripts/deploy.sh instead.
set -euo pipefail
cd "$(dirname "$0")/.."
export PATH="$HOME/.local/share/vaportv-dev/node/bin:$PATH"
LOG=${TMPDIR:-/tmp}/vaportv-install-here.log

# package.json changed since the last install: bring node_modules in line first.
if [ ! -d node_modules ] || [ package-lock.json -nt node_modules/.package-lock.json ]; then
  npm ci >"$LOG" 2>&1 || { tail -20 "$LOG"; exit 1; }
fi
npm run dist >"$LOG" 2>&1 || { tail -30 "$LOG"; exit 1; }
# Copied beside it, then moved over it: the running one keeps its file until it closes.
cp dist/vaporTV.AppImage ~/Applications/steamtv.AppImage.new
chmod +x ~/Applications/steamtv.AppImage.new
mv ~/Applications/steamtv.AppImage.new ~/Applications/steamtv.AppImage
echo "Installed vaporTV $(node -p "require('./package.json').version") ($(git log -1 --format=%h)). It starts next time vaporTV starts."
