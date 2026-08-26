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
#   TOTAL_MEMORY the linear memory, in bytes   (default 167772160, 160 MB)
#   SLOPPY_FLAGS -DFAST_SLOPPY                 (step 4; set it empty to undo)
#   TRIM_FLAGS   the -DALE_NO_* guards         (step 6; set it empty to undo)
#   RV32_FLAGS   -DALE_NO_RV64                 (step 7; set it empty to undo)
#   EXTRA_FLAGS  more compile flags            (default empty)
#   LINK_EXTRA   more link flags               (default empty)
#   NO_INSTALL   set it to keep the module out of modules/ (default: install)
#   NO_PATCHES   set it to skip patches/*.patch (default: apply them)
#   BUILD_TAG    name of the build directory   (default "default")
#   JOBS         parallel compile jobs         (default: the processor count)
#
# The default of every option is the module that this branch ships. A step of
# the plan is reproducible with the variables above: each one names the step it
# belongs to.
#
# Usage:
#   scripts/build-whisper/build.sh
#   SLOPPY_FLAGS= TRIM_FLAGS= RV32_FLAGS= TOTAL_MEMORY=268435456 \
#     BUILD_TAG=step-3 scripts/build-whisper/build.sh

set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
EMSDK_DIR="${EMSDK_DIR:-$HOME/emsdk}"
SWERV_DIR="${SWERV_DIR:-$REPO/crates/riscv-rs/SweRV-ISS-1}"
BOOST_DIR="${BOOST_DIR:-$REPO/crates/riscv-rs/vendor}"
EXTRA_FLAGS="${EXTRA_FLAGS:-}"
# 160 MB. The guest memory of whisper is 128 MB (`1 << 27`, whisper.cpp line
# 1672) and the application puts the guest stack at the top of it
# (`so_stack_pointer_value` is 0x7FFFFFC in index.html), so 128 MB is the
# smallest safe guest memory. A module needs 10.5 to 12 MB more than that for
# its own heap: 140 MB runs and 138 MB stops with `Aborted(OOM)`. 160 MB
# leaves 32 MB for the heap, which is 2.7 times the measured need.
# `local/prog.md`, section "Step 5", records the measurements.
TOTAL_MEMORY="${TOTAL_MEMORY:-167772160}"

# Step 4. The flag replaces Hart::load with Hart::fastLoad and takes the
# attribute lookup, the triggers, the load queue, the stack check, the CLINT
# test and the console-io test out of every load and store. It keeps the memory
# bound test and the jsReadMMIO and jsWriteMMIO hooks.
SLOPPY_FLAGS="${SLOPPY_FLAGS--DFAST_SLOPPY}"

# Step 6. Each macro guards one subsystem that RISC-V ALE cannot reach.
# `patches/0002` and `patches/0003` hold the guards, and the README says why
# each subsystem is out of reach. Without a reference, the linker drops the
# code and `librvcore.a` never gives up the object file.
#
#   ALE_NO_VECTOR    the V extension. There is no V checkbox in index.html,
#                    and decodeVec already returns illegal without it.
#   ALE_NO_BITMANIP  the B extension (zba to zbt). No checkbox either, and
#                    every handler already starts with an isRvzb* test.
#   ALE_NO_GDB       the GDB stub. It needs a socket, and nothing passes --gdb.
#   ALE_NO_SERVER    the socket server. Nothing passes --server.
#   ALE_NO_SNAPSHOT  save and load a snapshot. Nothing passes --loadfrom or
#                    --snapshotperiod.
#
# The interactive shell is **not** in this list. The application uses it: the
# "run with debug" button passes --interactive.
TRIM_FLAGS="${TRIM_FLAGS--DALE_NO_VECTOR -DALE_NO_BITMANIP -DALE_NO_GDB -DALE_NO_SERVER -DALE_NO_SNAPSHOT}"

# Step 7. Every template of the core is instantiated two times, one for
# `uint32_t` and one for `uint64_t`. RISC-V ALE has no RV64 toolchain and no way
# to ask for one: the ISA checkboxes of index.html make an RV32 string, and the
# clang of the application builds an RV32 ELF. `patches/0004` puts the second
# instantiation of each template behind this macro. The `--xlen 64` path of
# whisper.cpp goes with it, and it then answers "This build has no RV64
# support".
RV32_FLAGS="${RV32_FLAGS--DALE_NO_RV64}"

BUILD_TAG="${BUILD_TAG:-default}"
JOBS="${JOBS:-$(sysctl -n hw.ncpu 2>/dev/null || nproc || echo 4)}"

OUT="$REPO/scripts/build-whisper/.build/$BUILD_TAG"
BOOST_WASM_LIB="$REPO/scripts/build-whisper/.build/boost-wasm/lib"
PATCH_DIR="$REPO/scripts/build-whisper/patches"
# The build works on a copy of the source, so the submodule stays clean and
# the differential harness keeps its oracle.
SRC="$OUT/src"

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

# The SDK is pinned, so a rebuild on another day gives the same module. The
# figures of 2.0.34, 3.1.74 and 6.0.8 agree within a few per cent, so the
# choice is for reproducibility and not for speed.
EMSDK_VERSION="${EMSDK_VERSION:-6.0.8}"
(cd "$EMSDK_DIR" && ./emsdk activate "$EMSDK_VERSION" >/dev/null)

# shellcheck disable=SC1091
source "$EMSDK_DIR/emsdk_env.sh" >/dev/null 2>&1

echo "Emscripten: $(em++ --version | head -1)"
echo "Source:     $SWERV_DIR ($HEAD_COMMIT)"
echo "Flags:      -O3 ... $SLOPPY_FLAGS $TRIM_FLAGS $RV32_FLAGS $EXTRA_FLAGS"
echo "Memory:     $TOTAL_MEMORY bytes ($((TOTAL_MEMORY / 1048576)) MB)"
echo "Build tag:  $BUILD_TAG"
echo ""

# ─── The source copy and the patches ────────────────────────────────────────
#
# The build never writes into the submodule. It copies the source into the
# build directory and patches the copy. `rsync` puts the original files back
# each time, so a patch always applies to a clean tree, and the object files
# in the copy survive between runs.

echo "==> Copying the source"
mkdir -p "$SRC"
# `--checksum` with `--no-times` copies a file only when its content differs,
# and gives the copy the current time. Make then rebuilds exactly the objects
# whose source changed, and a tag can move between patched and unpatched
# without a stale object file.
rsync -a --delete --checksum --no-times \
  --exclude '.git' --exclude 'build-*' --exclude 'opt' --exclude 'dbg' \
  "$SWERV_DIR/" "$SRC/"

if [ -z "${NO_PATCHES:-}" ] && compgen -G "$PATCH_DIR/*.patch" >/dev/null; then
  for p in "$PATCH_DIR"/*.patch; do
    echo "==> Applying $(basename "$p")"
    patch -p1 -d "$SRC" --forward --silent <"$p"
  done
fi

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
OFLAGS="$OFLAGS -DDISABLE_EXCEPTIONS -s TOTAL_MEMORY=$TOTAL_MEMORY -s ASYNCIFY"
OFLAGS="$OFLAGS $SLOPPY_FLAGS $TRIM_FLAGS $RV32_FLAGS $EXTRA_FLAGS"

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

# Stop Binaryen from putting every instruction handler inside Hart::execute.
#
# `wasm-opt -O3` inlines a function that has one caller, whatever its size,
# because the original body then costs nothing. Each of the 482 handlers
# (execAddi, execLw and so on) is called from exactly one place: the dispatch
# in Hart<URV>::execute. Binaryen therefore puts all of them inside it and
# makes one function of about 700 KB.
#
# V8 does not apply its optimizing tier to a function of that size. The whole
# interpreter then runs in the baseline tier, and the module is twelve times
# slower: 11 MIPS against the 127 MIPS of the module the fork shipped. A
# measurement with `--js-flags=--liftoff-only` proves it: the shipped module
# falls from 119 to 106 MIPS and the module without this option does not move.
#
# `-ocimfs=1` (one-caller-inline-max-function-size) sets the size limit for
# that rule to 1, so a handler stays a function of its own. The largest
# function falls from 694 KB to 261 KB, the module gets 5,507 functions
# instead of 2,277, and the figures rise from 11 to 133 MIPS. Both numbers
# are close to the shipped module (5,122 functions, largest 231 KB), which
# shows that the toolchain that made it did not have this behaviour.
#
# `local/prog.md` records the measurements.
BINARYEN_ARGS="-sBINARYEN_EXTRA_PASSES=-ocimfs=1"

# The link rule of the GNUmakefile does not use OFLAGS, and it takes the Boost
# libraries from LINK_LIBS. The extra link settings go there for that reason.
LINK_LIBS="$BOOST_WASM_LIB/libboost_program_options.a"
LINK_LIBS="$LINK_LIBS -sEXPORTED_RUNTIME_METHODS=$EXPORTS"
LINK_LIBS="$LINK_LIBS -sALLOW_MEMORY_GROWTH=0"
LINK_LIBS="$LINK_LIBS $BINARYEN_ARGS"
# LINK_EXTRA is for a measurement and not for a step. `--emit-symbol-map`
# writes `whisper.js.symbols`, which `scripts/perf-core/startup/wasm_sizes.cjs`
# needs to say how large each subsystem is. Use it with NO_INSTALL, because a
# module for a measurement must not become the module that the branch ships.
LINK_LIBS="$LINK_LIBS ${LINK_EXTRA:-}"

# The link rule had `-s TOTAL_MEMORY=268435456 -lworkerfs.js -s ASYNCIFY`
# written into it, after LINK_LIBS. An Emscripten setting that comes later on
# the command line wins, so nothing in LINK_LIBS can change the memory size.
# `patches/0001-parameterize-the-link-flags.patch` puts those three settings
# into EM_LINK_FLAGS, which this line then sets.
EM_LINK_FLAGS="-s TOTAL_MEMORY=$TOTAL_MEMORY -lworkerfs.js -s ASYNCIFY"

BUILD_DIR="build-wasm"

echo "==> Building whisper"
make -C "$SRC" -j"$JOBS" \
  BUILD_DIR="$BUILD_DIR" \
  BOOST_ROOT="$BOOST_DIR" \
  BOOST_LIB_DIR="$BOOST_WASM_LIB" \
  LINK_DIRS="" \
  LINK_LIBS="$LINK_LIBS" \
  EM_LINK_FLAGS="$EM_LINK_FLAGS" \
  OFLAGS="$OFLAGS" \
  CXXFLAGS="$COMPAT" \
  CFLAGS="$COMPAT" \
  "$BUILD_DIR/whisper"

mkdir -p "$OUT"
cp "$SRC/$BUILD_DIR/whisper.js" "$OUT/whisper.js"
cp "$SRC/$BUILD_DIR/whisper.wasm" "$OUT/whisper.wasm"
[ -f "$SRC/$BUILD_DIR/whisper.js.symbols" ] &&
  cp "$SRC/$BUILD_DIR/whisper.js.symbols" "$OUT/whisper.js.symbols"

echo ""
echo "==> Done"
if [ -n "${NO_INSTALL:-}" ]; then
  echo "NO_INSTALL is set, so modules/ does not change."
  ls -l "$OUT/whisper.js" "$OUT/whisper.wasm"
else
  cp "$OUT/whisper.js" "$REPO/modules/whisper.js"
  cp "$OUT/whisper.wasm" "$REPO/modules/whisper.wasm"
  ls -l "$REPO/modules/whisper.js" "$REPO/modules/whisper.wasm"
fi
