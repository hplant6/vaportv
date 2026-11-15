#!/bin/bash
# Fetches sherpa-onnx (the engine that runs Kokoro, the Claude app's speaking voice) into
# build/voice/kokoro/, which electron-builder ships beside the app: its Node addon and Linux
# libraries (onnxruntime included), and the worker vaporTV runs it in (scripts/kokoro-worker.cjs).
# Pinned to 1.12.40: from 2.0 on, Kokoro skips any word missing from its dictionary (game
# titles, names), where 1.12 spells it out with eSpeak. The voice model itself (~350 MB)
# downloads on first use (see src/main/speech.ts). Skipped when it's already here.
#
#   scripts/kokoro.sh     (run by npm run dist)
set -euo pipefail
VERSION=1.12.40
NODE_SHA512=xazIjdHXG3T9DdojS2QjTu9yWyLcnXxgRQBNIocvu73l9N8AoS9zse3zaSU0VbQWlyn+lXdcqKUGEicYhbGMpg==
LINUX_SHA512=f8zAj0sdPrci7vvlD2ZJJyYAoLEw1eX7k+1z1ikR5C5AKNAq8m8pVegzA1440+N/mcqfktw/saL16I5K/WJH5Q==
cd "$(dirname "$0")/.."
OUT=build/voice/kokoro
# The worker is ours: always the current one.
mkdir -p "$OUT"
cp scripts/kokoro-worker.cjs "$OUT/worker.cjs"
[ -f "$OUT/node_modules/sherpa-onnx-linux-x64/sherpa-onnx.node" ] && [ -f "$OUT/node_modules/sherpa-onnx-node/.version-$VERSION" ] && exit 0

TMP=$(mktemp -d)
trap 'rm -rf "$TMP"' EXIT
fetch() {
  local name=$1 sha=$2
  curl -fsSL -o "$TMP/$name.tgz" "https://registry.npmjs.org/$name/-/$name-$VERSION.tgz"
  [ "$(openssl dgst -sha512 -binary "$TMP/$name.tgz" | base64 -w0)" = "$sha" ] || { echo "kokoro: $name failed its checksum" >&2; exit 1; }
  rm -rf "$OUT/node_modules/$name"
  mkdir -p "$OUT/node_modules/$name"
  tar -xzf "$TMP/$name.tgz" -C "$OUT/node_modules/$name" --strip-components=1
}
fetch sherpa-onnx-node "$NODE_SHA512"
fetch sherpa-onnx-linux-x64 "$LINUX_SHA512"
touch "$OUT/node_modules/sherpa-onnx-node/.version-$VERSION"
echo "kokoro: fetched sherpa-onnx $VERSION"
