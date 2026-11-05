#!/usr/bin/env bash
# mk9-nx 1.0.4: builds wasm/uam.mjs, uam (mk9-nx's app/thirdparty/uam) for the page, which compiles the deko3d shader
# cache (deko3d_shaders.bin) from the player's own GLSL (lib/deko3d_cache.js). uam's own CMakeLists.txt (uamlib) with
# Emscripten, plus uam_web.cpp.
#
#   MK9_NX  the mk9-nx checkout  (default: ../mk9-nx next to the installer)
#   OUT     output folder        (default: the installer's wasm/)
#   usage (em++ on PATH, for example in the emscripten/emsdk:4.0.10 image): wasm/src/uam/build_wasm_uam.sh
set -eu
HERE=$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)
INSTALLER=$(cd "$HERE/../../.." && pwd)
MK9_NX=$(cd "${MK9_NX:-$INSTALLER/../mk9-nx}" && pwd)
OUT=${OUT:-$INSTALLER/wasm}
BUILD=${BUILD:-$MK9_NX/out/uam-wasm}
UAM=$MK9_NX/app/thirdparty/uam
echo "em++: $(em++ --version | head -1)"

# Mesa's p_config.h knows no wasm32: it is little-endian
emcmake cmake -S "$UAM" -B "$BUILD" -G "Unix Makefiles" -DCMAKE_BUILD_TYPE=Release \
  -DCMAKE_C_FLAGS=-DPIPE_ARCH_LITTLE_ENDIAN -DCMAKE_CXX_FLAGS=-DPIPE_ARCH_LITTLE_ENDIAN
cmake --build "$BUILD" --target uamlib -j"$(nproc)"
em++ -std=c++11 -O2 -I"$UAM" "$HERE/uam_web.cpp" "$BUILD/libuamlib.a" -o "$OUT/uam.mjs" \
  -sEXPORT_NAME=createUamModule -sEXPORT_ES6=1 -sMODULARIZE=1 -sALLOW_MEMORY_GROWTH=1 -sINITIAL_MEMORY=64MB \
  -sSTACK_SIZE=8MB -sENVIRONMENT=web,worker,node \
  -sEXPORTED_FUNCTIONS=_uam_web_init,_uam_web_compile,_uam_web_data,_uam_web_log,_malloc,_free \
  -sEXPORTED_RUNTIME_METHODS=HEAPU8,UTF8ToString,stringToUTF8,lengthBytesUTF8
echo "done: $OUT/uam.mjs"
