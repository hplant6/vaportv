#!/bin/bash
# Publishes the public release: builds the AppImage without the author's extras
# (VAPORTV_PUBLIC=1) and puts it on GitHub as release v<package.json version>.
# Run from a clean main that's already pushed; the release is tagged at that commit.
set -euo pipefail
cd "$(dirname "$0")/.."
REPO=hplant6/vaportv
VERSION=$(node -p "require('./package.json').version")
TAG="v$VERSION"

[ -z "$(git status --porcelain)" ] || { echo "Uncommitted changes; commit first."; exit 1; }
[ "$(git branch --show-current)" = main ] || { echo "Not on main."; exit 1; }
git fetch -q origin main
[ "$(git rev-parse HEAD)" = "$(git rev-parse origin/main)" ] || { echo "main isn't pushed (or is behind); push first."; exit 1; }
if gh release view "$TAG" -R "$REPO" >/dev/null 2>&1; then echo "$TAG already exists; bump the version in package.json."; exit 1; fi

VAPORTV_PUBLIC=1 npm run dist >/tmp/vaportv-release.log 2>&1 || { tail -20 /tmp/vaportv-release.log; exit 1; }
# The public build must not carry the extras.
if grep -q "duckduckgo.com" out/main/index.js; then echo "The build still has the extras in it; not publishing."; exit 1; fi

gh release create "$TAG" dist/vaporTV.AppImage -R "$REPO" --target "$(git rev-parse HEAD)" --title "vaporTV $VERSION" --notes "$(cat <<NOTES
Download **vaporTV.AppImage** below, open it in Desktop Mode, and follow the setup window. See the [README](https://github.com/$REPO#install) for the steps.
NOTES
)"
echo "Published $TAG"
