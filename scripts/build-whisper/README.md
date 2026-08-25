# Building the C++ core (whisper)

NOTE: This document uses the ASD-STE100 (Simplified Technical English) writing
rules. Code identifiers, file names, metric names and command options are
technical names. They stay in their original form.

`build.sh` builds `modules/whisper.js` and `modules/whisper.wasm` from the
SweRV-ISS source. Steps 3 to 8 of `local/optimize-whisper.md` need it.

The module that RISC-V ALE shipped was a prebuilt artifact from an unknown
SDK. Step 3 rebuilds it with the same flags, so that a later step can change
one flag at a time and know what moved the figures.

## Known problem: a rebuild is 12 times slower

**A module from this script is correct but very slow.** It runs at 11 MIPS
where the module that RISC-V ALE shipped runs at 127 MIPS. Do not put a
module from this script into `modules/` until the problem has a solution.

The cause is `Hart::execute`. Its source uses a GNU computed goto over about
500 label addresses. WebAssembly has no indirect branch instruction, so LLVM
must remove the irreducible control flow, and every LLVM available today makes
the function 9 times as large as it is in the shipped module: 694 KB against
about 75 KB. V8 does not apply its optimizing tier to a function of that size,
so the whole interpreter runs in the baseline tier.

The Emscripten version is not the cause. Versions 2.0.34, 3.1.74 and 6.0.8 all
give the same figure. `local/prog.md`, section "Step 3", gives the full
evidence and names the solution: replace the computed goto with a `switch`.

## Commands

```sh
# Step 3: the same flags the GNUmakefile has.
scripts/build-whisper/build.sh

# Step 4: one flag more.
EXTRA_FLAGS=-DFAST_SLOPPY BUILD_TAG=fast-sloppy scripts/build-whisper/build.sh
```

The script writes into `scripts/build-whisper/.build/<BUILD_TAG>/` and then
copies the two files into `modules/`. The `.build` directory is not in the
repository.

## Options

All options come through the environment.

| Name | Default | Function |
| --- | --- | --- |
| `EMSDK_DIR` | `$HOME/emsdk` | The Emscripten SDK |
| `EMSDK_PYTHON` | from `uv`, if present | A Python 3.10 or later |
| `SWERV_DIR` | `crates/riscv-rs/SweRV-ISS-1` | The C++ source |
| `BOOST_DIR` | `crates/riscv-rs/vendor` | The vendored Boost |
| `EXTRA_FLAGS` | empty | More compile flags |
| `BUILD_TAG` | `default` | Name of the build directory |
| `JOBS` | the processor count | Parallel compile jobs |

## Prerequisites

### The Emscripten SDK

```sh
git clone --depth 1 https://github.com/emscripten-core/emsdk.git $HOME/emsdk
uv python install 3.12                       # the SDK needs Python 3.10 or later
export EMSDK_PYTHON=$(uv python find 3.12)   # macOS 26 has Python 3.9.6
cd $HOME/emsdk && ./emsdk install latest && ./emsdk activate latest
```

The version that made the modules in `modules/`:

| Item | Value |
| --- | --- |
| Emscripten | 6.0.8 (`aeb67926e7de656da38bc807d83050af93578758`) |
| Python for the SDK | 3.12.13, from `uv` |
| Operating system | macOS 26.2 (25C56), arm64 |

The SDK that made the module RISC-V ALE shipped is not known. The glue of that
module exports every runtime method without being asked, which an Emscripten
of about 2021 did.

### The C++ source

`crates/riscv-rs/SweRV-ISS-1` is a submodule of the `riscv-rs` crate. This
branch does not track it, so the script takes it from the working tree. The
plan pins the commit `b4a81080604a729db22a23a8a47b7bcafc3db731`, and the
script gives a warning when the source is at a different commit.

```sh
git submodule update --init --recursive
```

### Boost

The SweRV-ISS link line needs `Boost.program_options`. The vendored sources at
`crates/riscv-rs/vendor` build for WebAssembly with `em++` and `emar`, and the
script does this one time into
`scripts/build-whisper/.build/boost-wasm/lib/`.

## Why the flags are here and not in the GNUmakefile

Step 4 of the plan says to add `-DFAST_SLOPPY` to `OFLAGS` in the GNUmakefile.
The GNUmakefile is in the SweRV-ISS source, which is a submodule of another
crate and which this branch does not track. A change there would not be in any
commit of this repository, and a later reader could not know which flags made
a module.

The flags are therefore in this script, which the repository does track. The
compile flags are the flags of line 79 of the GNUmakefile:

```
-O3 -Wno-c++11-narrowing -fno-builtin -D__EMSCRIPTEN__ -DDISABLE_EXCEPTIONS
-s TOTAL_MEMORY=268435456 -s ASYNCIFY
```

`EXTRA_FLAGS` adds to them. Nothing removes from them.

## What the script adds to the 2021 build, and why

The source is from 2021 and the compiler is from 2026. Two groups of options
make the old source build with the new SDK. Neither group changes what the
program does.

1. **Compatibility.** `-include cstdint -include optional -include limits`,
   `-Wno-unknown-warning-option`, `-Wno-invalid-specialization` and
   `-Wno-unused-command-line-argument`. The first three are the same options
   that `crates/riscv-rs/tests/differential_harness.rs` uses to build the
   native oracle. Older headers included these standard headers on their own.

2. **Runtime exports.** `-sEXPORTED_RUNTIME_METHODS` with `FS`, `WORKERFS`,
   `writeArrayToMemory`, `lengthBytesUTF8`, `stringToUTF8` and `callMain`. An
   Emscripten of 2021 put every runtime method on the module. This one exports
   nothing unless it is asked. The RISC-V ALE worker calls `FS` and `WORKERFS`
   in `initFS`, and the `EM_JS` shims of `Syscall.cpp` and `Interactive.cpp`
   call the other three.
