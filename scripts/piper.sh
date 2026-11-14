#!/bin/bash
# Fetches Piper (text to speech, for the Claude app's spoken replies) into build/voice/piper/,
# which electron-builder ships beside the app. Piper's Linux release is self-contained (its
# own onnxruntime, espeak-ng and phoneme data), so it runs on SteamOS as it is. The voice
# itself downloads on first use (see src/main/speech.ts). Skipped when it's already here.
#
#   scripts/piper.sh     (run by npm run dist)
set -euo pipefail
VERSION=2023.11.14-2
SHA256=a50cb45f355b7af1f6d758c1b360717877ba0a398cc8cbe6d2a7a3a26e225992
cd "$(dirname "$0")/.."
OUT=build/voice/piper
[ -x "$OUT/piper" ] && exit 0

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
curl -fsSL -o "$TMP/piper.tgz" "https://github.com/rhasspy/piper/releases/download/$VERSION/piper_linux_x86_64.tar.gz"
echo "$SHA256  $TMP/piper.tgz" | sha256sum -c --quiet
mkdir -p build/voice
rm -rf "$OUT"
tar -xzf "$TMP/piper.tgz" -C build/voice
echo "piper: fetched $VERSION"
