# Building the C++ core (whisper)

NOTE: This document uses the ASD-STE100 (Simplified Technical English) writing
rules. Code identifiers, file names, metric names and command options are
technical names. They stay in their original form.

`build.sh` builds `modules/whisper.js` and `modules/whisper.wasm` from the
SweRV-ISS source. Steps 3 to 8 of `local/optimize-whisper.md` need it.

The module that RISC-V ALE shipped was a prebuilt artifact from an unknown
SDK. Step 3 rebuilds it with the same flags, so that a later step can change
one flag at a time and know what moved the figures.

## The one option that is not in the GNUmakefile

The script adds `-sBINARYEN_EXTRA_PASSES=-ocimfs=1` to the link. **Without it a
rebuild is twelve times slower than the module RISC-V ALE shipped: 11 MIPS
against 127 MIPS.**

`wasm-opt -O3` inlines a function that has one caller, whatever its size,
because the original body then costs nothing. Each of the 482 instruction
handlers (`execAddi`, `execLw` and so on) is called from exactly one place,
the dispatch in `Hart<URV>::execute`. Binaryen therefore puts all of them
inside it and makes one function of about 700 KB.

V8 does not apply its optimizing tier to a function of that size. The whole
interpreter then runs in the baseline tier. A measurement with
`--js-flags=--liftoff-only`, which stops V8 from ever using the optimizing
tier, proves it: the shipped module falls from 119 to 106 MIPS and a module
without this option does not move at all.

`-ocimfs=1` (`one-caller-inline-max-function-size`) sets the size limit of
that rule to 1, so a handler stays a function of its own:

| Measure | Without the option | With it | The shipped module |
| --- | --- | --- | --- |
| Largest function | 694 KB | 234 KB | 231 KB |
| Functions in the module | 2,277 | 5,298 | 5,122 |
| `alu`, MIPS | 11 | 133 | 136 |

With the option, `Hart<unsigned int>::execute` is 7,728 bytes and the largest
function of the module is a different one: `InstTable::setupInstVec()`, which
builds the 482-entry instruction table and is not a template.

The two numbers on the right are close, which shows that the toolchain that
made the shipped module did not have this behaviour. The Emscripten version is
not the cause: 2.0.34, 3.1.74 and 6.0.8 all need the option and all give the
same figures with it. `local/prog.md`, section "Step 3", records the
measurements.

## The linear memory

`TOTAL_MEMORY` sets the size of the WebAssembly linear memory. The default is
160 MB. The GNUmakefile had 256 MB.

The floor is the guest memory of whisper. `whisper.cpp` line 1672 makes it
`1 << 27`, which is 128 MB, and the application puts the guest stack at the top
of it: `so_stack_pointer_value` in `index.html` is `0x7FFFFFC`. A module needs
10.5 to 12 MB more than the guest memory for its own heap, which is mostly the
128K-entry decode cache. Measured: 140 MB runs and 138 MB stops with
`Aborted(OOM)`. 160 MB leaves 32 MB for the heap, which is 2.7 times the
measured need.

**Do not go below 140 MB.** The functional gate finds it: a 138 MB module fails
all three checks with `Aborted(OOM)`.

## The subsystems that RISC-V ALE cannot reach

`TRIM_FLAGS` holds the guards of step 6. Each macro takes one subsystem out of
the module. The guards are in `patches/0002` and `patches/0003`, and none of
them changes what a guest program can do.

| Macro | Subsystem | Why RISC-V ALE cannot reach it |
| --- | --- | --- |
| `ALE_NO_VECTOR` | The V extension | `index.html` has no V checkbox, so `isRvv()` is always false and `decodeVec` already answers with the illegal entry. |
| `ALE_NO_BITMANIP` | The B extension, `zba` to `zbt` | No checkbox either, and every handler already starts with an `isRvzb*` test that traps. |
| `ALE_NO_GDB` | The GDB stub | It needs a socket, which a browser worker does not have, and nothing in the application passes `--gdb`. |
| `ALE_NO_SERVER` | The socket server | Nothing passes `--server`. |
| `ALE_NO_SNAPSHOT` | Save and load a snapshot | Nothing passes `--loadfrom` or `--snapshotperiod`. |

**The interactive shell stays.** The plan of step 6 lists it as unused, and
that is not correct: the "run with debug" button of the application passes
`--interactive` (`assets/js/interface_elements.js` line 405 and
`modules/assistant.js` line 233). The disassembler stays with it, because the
instruction trace of that shell uses it. The functional gate has a check for
the shell from step 6.

Nothing needed a source list edit. `Hart<URV>::execute` dispatches with a
computed goto, and its label array holds the address of every handler, so the
linker could not drop one. When the guard points those array entries at the
`illegal` label, the reference goes and `wasm-ld --gc-sections` takes the
handler and everything behind it. `whisper.wasm` falls from 4,095,232 to
2,393,197 bytes that way.

## RV32 only

`RV32_FLAGS` holds `-DALE_NO_RV64`, which is the guard of step 7.
`patches/0004` puts it around the second instantiation of every template.

Each template of the core is instantiated two times, one for `uint32_t` and
one for `uint64_t`:

```cpp
template class WdRiscv::Hart<uint32_t>;
template class WdRiscv::Hart<uint64_t>;
```

**RISC-V ALE cannot ask for RV64.** The ISA checkboxes of `index.html` make an
RV32 string, the clang of the application builds an RV32 ELF, and nothing
passes `--xlen 64`. `whisper.cpp` chooses the width from the command line, the
configuration file or the class of the ELF file, and all three say 32.

The patch guards 20 instantiations in 18 files, and the `session<uint64_t>`
call in `main` with them. With the guard on, an RV64 ELF gets the answer "This
build has no RV64 support" instead of a simulation. The primary template and
the RV32 instantiation do not change, so no guest program of the application
sees a difference.

## No Asyncify: the budget-and-return run loop

The default build has no `-s ASYNCIFY`. `ASYNCIFY=1` gives the old module back.
`patches/0005` holds the change, and it is the largest patch of this branch.

Asyncify instruments every function that can reach `emscripten_sleep`, and the
core pays that cost on every instruction. The core slept for two reasons:

1. To give the worker its event loop back, so that a message could arrive. The
   run loop slept one time for each period of its interrupt test.
2. To wait: for a character on the standard input, or for a command of the
   interactive shell.

Without Asyncify a wait must be a return to JavaScript. The module therefore
changes shape:

| Item | With Asyncify | Without it |
| --- | --- | --- |
| Where the program runs | Inside `main` | Inside `ale_run_slice`, which the worker calls |
| What `main` does | Everything, and then the module is finished | Sets the session up and returns |
| The wait of the run loop | `emscripten_sleep(int_sleep_duration)` | The slice returns after its budget of instructions |
| The wait for input | A loop around `emscripten_sleep(10)` | The hart backs up to the `ecall` and the slice returns |
| The wait for a shell command | A loop around `emscripten_sleep(100)` | `interactSlice` takes the commands that are ready and returns |

`ale_run_slice(budget)` runs at most `budget` instructions, where 0 means no
limit, and it answers 0 (the program is finished), 1 (instructions ran) or 2
(it waits for the host). The budget goes into the instruction count limit that
both run loops already test, so **the hot loop has no test that it did not have
before.**

The worker chooses the budget, and that choice keeps the simulated frequency of
RISC-V ALE the same:

- Interrupts on: the budget is the period of the interrupt test
  (`simulator_int_inst_delay` + 1) and the delay between two slices is
  `simulator_sleep[0]`. These are the two values that the frequency control of
  the application already set, so the core tests for an interrupt at the same
  instruction count and waits the same time as before.
- Interrupts off: the budget is 0, so the program runs in one slice. This is
  what a benchmark measures.

`modules/simulator_worker.js` and the two `worker_cpp.js` files of
`scripts/perf-core/` drive the slices. Each one tests for
`Module._ale_run_slice` and falls back to the old model when the module has
Asyncify, so one worker drives both modules.

## Commands

```sh
# The module this branch ships: steps 4, 5, 6, 7 and 8 together.
scripts/build-whisper/build.sh

# Step 3: no FAST_SLOPPY, no guards, 256 MB of linear memory.
SLOPPY_FLAGS= TRIM_FLAGS= RV32_FLAGS= TOTAL_MEMORY=268435456 \
  BUILD_TAG=step-3 scripts/build-whisper/build.sh

# Step 4: FAST_SLOPPY, still 256 MB and no guards.
TRIM_FLAGS= RV32_FLAGS= TOTAL_MEMORY=268435456 BUILD_TAG=step-4 \
  scripts/build-whisper/build.sh

# Step 5: the smaller linear memory, still no guards.
TRIM_FLAGS= RV32_FLAGS= BUILD_TAG=step-5 scripts/build-whisper/build.sh

# Step 6: the subsystem guards, and both widths.
ASYNCIFY=1 RV32_FLAGS= BUILD_TAG=step-6 scripts/build-whisper/build.sh

# Step 7: RV32 only, and still Asyncify.
ASYNCIFY=1 BUILD_TAG=step-7 scripts/build-whisper/build.sh
```

The script writes into `scripts/build-whisper/.build/<BUILD_TAG>/` and then
copies the two files into `modules/`. The `.build` directory is not in the
repository.

## Options

All options come through the environment.

| Name | Default | Function |
| --- | --- | --- |
| `EMSDK_DIR` | `$HOME/emsdk` | The Emscripten SDK |
| `EMSDK_VERSION` | `6.0.8` | The SDK version. It is pinned so that a rebuild gives the same module. |
| `EMSDK_PYTHON` | from `uv`, if present | A Python 3.10 or later |
| `NO_PATCHES` | not set | Set it to skip `patches/*.patch` |
| `SWERV_DIR` | `crates/riscv-rs/SweRV-ISS-1` | The C++ source |
| `BOOST_DIR` | `crates/riscv-rs/vendor` | The vendored Boost |
| `TOTAL_MEMORY` | `167772160` | The linear memory, in bytes. See the section above. |
| `SLOPPY_FLAGS` | `-DFAST_SLOPPY` | Step 4. Set it empty to undo. |
| `TRIM_FLAGS` | the five `-DALE_NO_*` guards | Step 6. Set it empty to undo. |
| `RV32_FLAGS` | `-DALE_NO_RV64` | Step 7. Set it empty to undo. |
| `ASYNCIFY` | not set | Step 8. Set it to 1 to build with `-s ASYNCIFY` and without the slice loop. |
| `EXTRA_FLAGS` | empty | More compile flags |
| `LINK_EXTRA` | empty | More link flags. `--emit-symbol-map` writes `whisper.js.symbols`, which `scripts/perf-core/startup/wasm_sizes.cjs` needs. |
| `NO_INSTALL` | not set | Set it to keep the module out of `modules/`. Use it with `LINK_EXTRA`. |
| `BUILD_TAG` | `default` | Name of the build directory |
| `JOBS` | the processor count | Parallel compile jobs |

## What is in the module

A build with the symbol map says how large each subsystem is:

```sh
LINK_EXTRA=--emit-symbol-map NO_INSTALL=1 BUILD_TAG=sym \
  scripts/build-whisper/build.sh
node scripts/perf-core/startup/wasm_sizes.cjs \
  scripts/build-whisper/.build/sym/whisper.wasm --group
```

The `.wasm` file of a symbol-map build has the same size as the module the
branch ships, so the report is a report of the shipped module. `local/prog.md`,
section "Step 7", holds the table.

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

3. **`-sBINARYEN_EXTRA_PASSES=-ocimfs=1`.** This one does change the module:
   it keeps the instruction handlers out of `Hart::execute`. The section above
   explains why it is necessary.

## The source copy and the patches

The build never writes into the SweRV-ISS submodule. It copies the source into
`.build/<BUILD_TAG>/src/` with `rsync` and builds there, so the submodule stays
clean and the differential harness keeps its oracle.

`patches/*.patch` are applied to the copy with `patch -p1` before the build.
Step 8 of the plan (remove Asyncify) will need more of them, and this is where
they go.

| Patch | What it does |
| --- | --- |
| `0001-parameterize-the-link-flags.patch` | The link rule of the GNUmakefile had `-s TOTAL_MEMORY=268435456 -lworkerfs.js -s ASYNCIFY` written into it, after `LINK_LIBS`. An Emscripten setting that comes later on the command line wins, so nothing that `build.sh` passes could change the memory size. The patch moves those three settings into an `EM_LINK_FLAGS` variable with `?=`, so a build that does not set the variable gives the same module as before the patch. |
