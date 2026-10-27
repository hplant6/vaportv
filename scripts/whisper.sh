#!/bin/bash
# Builds whisper.cpp's whisper-cli (speech to text, for voice search) into build/voice/,
# which electron-builder ships beside the app. SteamOS has no compiler, so it's built
# here: a CPU build (AVX2) with whisper.cpp linked in, needing only the C++ runtime and
# OpenMP that SteamOS has. Skipped when it's already built.
#
#   scripts/whisper.sh     (run by npm run dist; needs git, a C++ compiler and cmake or uvx)
set -euo pipefail
VERSION=v1.8.2
cd "$(dirname "$0")/.."
OUT=build/voice/whisper-cli
[ -x "$OUT" ] && exit 0

SRC=${WHISPER_SRC:-$HOME/.cache/vaportv/whisper.cpp-$VERSION}
[ -d "$SRC" ] || git clone -q --depth 1 --branch "$VERSION" https://github.com/ggml-org/whisper.cpp "$SRC"
if command -v cmake >/dev/null; then CMAKE=(cmake); else CMAKE=(uvx --from cmake cmake); fi
"${CMAKE[@]}" -S "$SRC" -B "$SRC/build" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DGGML_NATIVE=OFF \
  -DGGML_AVX2=ON -DGGML_FMA=ON -DGGML_F16C=ON -DWHISPER_BUILD_TESTS=OFF >/dev/null
"${CMAKE[@]}" --build "$SRC/build" -j "$(nproc)" --target whisper-cli >/dev/null
mkdir -p build/voice
cp "$SRC/build/bin/whisper-cli" "$OUT"
cp "$SRC/LICENSE" build/voice/LICENSE-whisper.cpp
echo "whisper: built $VERSION"
