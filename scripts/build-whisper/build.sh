#!/usr/bin/env bash
#
# Build modules/whisper.js and modules/whisper.wasm from the SweRV-ISS source.
#
# The plan (local/optimize-whisper.md, steps 3 to 8) needs a rebuild that a
# later step can change one flag at a time. The shipped module was a prebuilt
# artifact from an unknown SDK, so step 3 exists to control for the toolchain.
#
# The compile flags are the flags of line 79 of the SweRV-ISS GNUmakefile:
#
#   -O3 -Wno-c++11-narrowing -fno-builtin -D__EMSCRIPTEN__ -DDISABLE_EXCEPTIONS
#   -s TOTAL_MEMORY=268435456 -s ASYNCIFY
#
# A step adds to them with EXTRA_FLAGS. The flags live here and not in the
# GNUmakefile, because the SweRV-ISS source is a submodule of the riscv-rs
# crate and this branch does not track it. A change there would not be in any
# commit of this repository.
#
# Options, all through the environment:
#
#   EMSDK_DIR    the Emscripten SDK            (default $HOME/emsdk)
#   EMSDK_VERSION the SDK version to activate  (default: the active one)
#   EMSDK_PYTHON a Python 3.10 or later        (default: from uv, if present)
#   SWERV_DIR    the SweRV-ISS source          (default crates/riscv-rs/SweRV-ISS-1)
#   BOOST_DIR    the vendored Boost            (default crates/riscv-rs/vendor)
#   EXTRA_FLAGS  more compile flags            (default empty)
#   BUILD_TAG    name of the build directory   (default "default")
#   JOBS         parallel compile jobs         (default: the processor count)
#
# Usage:
#   scripts/build-whisper/build.sh
#   EXTRA_FLAGS=-DFAST_SLOPPY BUILD_TAG=fast-sloppy scripts/build-whisper/build.sh

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EMSDK_DIR="${EMSDK_DIR:-$HOME/emsdk}"
SWERV_DIR="${SWERV_DIR:-$REPO/crates/riscv-rs/SweRV-ISS-1}"
BOOST_DIR="${BOOST_DIR:-$REPO/crates/riscv-rs/vendor}"
EXTRA_FLAGS="${EXTRA_FLAGS:-}"
BUILD_TAG="${BUILD_TAG:-default}"
JOBS="${JOBS:-$(sysctl -n hw.ncpu 2>/dev/null || nproc || echo 4)}"

OUT="$REPO/scripts/build-whisper/.build/$BUILD_TAG"
BOOST_WASM_LIB="$REPO/scripts/build-whisper/.build/boost-wasm/lib"

# The commit of the SweRV-ISS source that this plan pins.
PINNED_COMMIT="b4a81080604a729db22a23a8a47b7bcafc3db731"

# ─── Checks ─────────────────────────────────────────────────────────────────

if [ ! -f "$SWERV_DIR/GNUmakefile" ]; then
  echo "error: no SweRV-ISS source at $SWERV_DIR" >&2
  echo "Get it with: git submodule update --init --recursive, or clone" >&2
  echo "https://github.com/antoniocgj/SweRV-ISS-1.git at $PINNED_COMMIT" >&2
  exit 1
fi

if [ ! -d "$BOOST_DIR/boost" ]; then
  echo "error: no vendored Boost headers at $BOOST_DIR/boost" >&2
  exit 1
fi

HEAD_COMMIT="$(git -C "$SWERV_DIR" rev-parse HEAD 2>/dev/null || echo unknown)"
if [ "$HEAD_COMMIT" != "$PINNED_COMMIT" ]; then
  echo "warning: the SweRV-ISS source is at $HEAD_COMMIT," >&2
  echo "         and the plan pins $PINNED_COMMIT" >&2
fi

if [ ! -f "$EMSDK_DIR/emsdk_env.sh" ]; then
  echo "error: no Emscripten SDK at $EMSDK_DIR" >&2
  exit 1
fi

# The SDK needs Python 3.10 or later. macOS 26 has 3.9.6.
if [ -z "${EMSDK_PYTHON:-}" ] && command -v uv >/dev/null 2>&1; then
  EMSDK_PYTHON="$(uv python find 3.12 2>/dev/null || true)"
  [ -n "$EMSDK_PYTHON" ] && export EMSDK_PYTHON
fi

if [ -n "${EMSDK_VERSION:-}" ]; then
  (cd "$EMSDK_DIR" && ./emsdk activate "$EMSDK_VERSION" >/dev/null)
fi

# shellcheck disable=SC1091
source "$EMSDK_DIR/emsdk_env.sh" >/dev/null 2>&1

echo "Emscripten: $(em++ --version | head -1)"
echo "Source:     $SWERV_DIR ($HEAD_COMMIT)"
echo "Flags:      -O3 ... $EXTRA_FLAGS"
echo "Build tag:  $BUILD_TAG"
echo ""

# ─── Boost.program_options for WebAssembly ──────────────────────────────────
#
# The vendored makefile builds the library for the host. The same sources
# build for WebAssembly with em++ and emar.

if [ ! -f "$BOOST_WASM_LIB/libboost_program_options.a" ]; then
  echo "==> Building Boost.program_options for WebAssembly"
  BOOST_OBJ="$REPO/scripts/build-whisper/.build/boost-wasm/obj"
  mkdir -p "$BOOST_OBJ" "$BOOST_WASM_LIB"
  for src in "$BOOST_DIR"/boost_program_options/src/*.cpp; do
    obj="$BOOST_OBJ/$(basename "${src%.cpp}").o"
    [ -f "$obj" ] && continue
    em++ -include cstdint -include optional -include limits \
      -I"$BOOST_DIR" -I"$BOOST_DIR/boost" -I"$BOOST_DIR/boost_program_options" \
      -std=c++17 -O3 -fPIC -Wno-unknown-warning-option \
      -c -o "$obj" "$src"
  done
  emar cr "$BOOST_WASM_LIB/libboost_program_options.a" "$BOOST_OBJ"/*.o
  emranlib "$BOOST_WASM_LIB/libboost_program_options.a"
fi

# ─── whisper ────────────────────────────────────────────────────────────────

# Line 79 of the GNUmakefile, and nothing else, plus what a step adds.
OFLAGS="-O3 -Wno-c++11-narrowing -fno-builtin -D__EMSCRIPTEN__"
OFLAGS="$OFLAGS -DDISABLE_EXCEPTIONS -s TOTAL_MEMORY=268435456 -s ASYNCIFY"
OFLAGS="$OFLAGS $EXTRA_FLAGS"

# The source is from 2021 and the compiler is from 2026. These force-includes
# are the ones that the differential harness already uses for the native
# oracle (crates/riscv-rs/tests/differential_harness.rs).
COMPAT="-include cstdint -include optional -include limits"
COMPAT="$COMPAT -Wno-unknown-warning-option -Wno-invalid-specialization"
COMPAT="$COMPAT -Wno-unused-command-line-argument"

# The runtime methods the RISC-V ALE worker and the EM_JS shims need.
# An Emscripten of 2021 exported them without being asked. This one does not.
#   FS, WORKERFS          modules/simulator_worker.js initFS
#   writeArrayToMemory    Syscall.cpp readFromStdin
#   lengthBytesUTF8       Interactive.cpp readInteractiveCommand
#   stringToUTF8          Interactive.cpp readInteractiveCommand
EXPORTS="FS,WORKERFS,writeArrayToMemory,lengthBytesUTF8,stringToUTF8,callMain"

# The link rule of the GNUmakefile does not use OFLAGS, and it takes the Boost
# libraries from LINK_LIBS. The extra link settings go there for that reason.
LINK_LIBS="$BOOST_WASM_LIB/libboost_program_options.a"
LINK_LIBS="$LINK_LIBS -sEXPORTED_RUNTIME_METHODS=$EXPORTS"
LINK_LIBS="$LINK_LIBS -sALLOW_MEMORY_GROWTH=0"

BUILD_DIR="build-wasm-$BUILD_TAG"

echo "==> Building whisper"
make -C "$SWERV_DIR" -j"$JOBS" \
  BUILD_DIR="$BUILD_DIR" \
  BOOST_ROOT="$BOOST_DIR" \
  BOOST_LIB_DIR="$BOOST_WASM_LIB" \
  LINK_DIRS="" \
  LINK_LIBS="$LINK_LIBS" \
  OFLAGS="$OFLAGS" \
  CXXFLAGS="$COMPAT" \
  CFLAGS="$COMPAT" \
  "$BUILD_DIR/whisper"

mkdir -p "$OUT"
cp "$SWERV_DIR/$BUILD_DIR/whisper.js" "$OUT/whisper.js"
cp "$SWERV_DIR/$BUILD_DIR/whisper.wasm" "$OUT/whisper.wasm"

cp "$OUT/whisper.js" "$REPO/modules/whisper.js"
cp "$OUT/whisper.wasm" "$REPO/modules/whisper.wasm"

echo ""
echo "==> Done"
ls -l "$REPO/modules/whisper.js" "$REPO/modules/whisper.wasm"
