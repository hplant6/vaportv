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
# The release notes (what the update window shows): this version's section of CHANGELOG.md.
NOTES=$(awk -v v="## $VERSION" '$0 == v { on = 1; next } on && /^## / { exit } on' CHANGELOG.md | sed '/./,$!d')
[ -n "$NOTES" ] || { echo "CHANGELOG.md has no '## $VERSION' section: rename '## Unreleased' to it (or write one) and commit."; exit 1; }
# The Netflix extension ships packed: the .crx must be from the sources as they are now.
packed=$(node -p "require('./build/netflix/extension.json').source")
current=$(node --input-type=module -e "import { sourceHash } from './scripts/pack-extension.mjs'; console.log(await sourceHash())")
[ "$packed" = "$current" ] || { echo "The Netflix extension changed since it was packed: bump its version in extensions/netflix/manifest.json, run npm run pack:netflix and commit."; exit 1; }

VAPORTV_PUBLIC=1 npm run dist >/tmp/vaportv-release.log 2>&1 || { tail -20 /tmp/vaportv-release.log; exit 1; }
# The public build must not carry the extras.
if grep -q "duckduckgo.com" out/main/index.js; then echo "The build still has the extras in it; not publishing."; exit 1; fi

# The updater installs only what's signed with ~/.config/vaportv/update-key.pem.
node scripts/sign-update.mjs dist/vaporTV.AppImage

gh release create "$TAG" dist/vaporTV.AppImage dist/vaporTV.AppImage.sig -R "$REPO" --target "$(git rev-parse HEAD)" --title "vaporTV $VERSION" --notes "$NOTES"
echo "Published $TAG"
