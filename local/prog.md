# Progress: Optimize The C++ Core (whisper)

NOTE: This document uses the ASD-STE100 (Simplified Technical English) writing
rules. Code identifiers, file names, metric names and command options are
technical names. They stay in their original form.

This document records the work of `local/optimize-whisper.md`. It gives the
result of each step, the comparison against the estimate of that step, and
each finding that a later step must know.

## Status

| Step | State | Result |
| --- | --- | --- |
| 1. Add the benchmark harness | Complete | Baseline measured. Four of the six cells of gate 2 agree with the report. |
| 2. Change the ISA string | Complete | 3.80x / 2.81x / 5.11x against an estimate of 3.46x / 2.07x / 6.17x |
| 3. Rebuild with unchanged flags | Complete | 0.98x / 0.86x / 0.79x. `mixed` regresses by 21% and the step accepts it in writing. The figures of step 3 are the new baseline. |
| 4. Add `-DFAST_SLOPPY` | Complete | 1.00x / 1.57x / 0.99x. The `memcpy` figure is below half of the plan estimate, and the cause is an error in the estimate. |
| 5. Size the linear memory | Complete | 256 MB to 160 MB. The 64 MB target of the plan is not reachable: the stack pointer of the application pins the guest memory at 128 MB. |
| 6. Trim the source list | Complete | `whisper.wasm` from 4,095,232 to 2,393,197 bytes (−41.6%). No source list edit was necessary. The interactive shell stays: the application uses it. |
| 7. RV32-only build | Complete | `whisper.wasm` from 2,393,197 to 1,757,149 bytes (−26.6%). The 1 to 1.5 MB target of steps 6 and 7 is not reached: 909 KB of the module does not depend on the register width. |
| 8. Remove Asyncify | Complete | 1.82x / 1.80x / 1.60x against an estimate of 1.12x to 1.39x. The C++ core reaches 110% / 112% / 90% of the Rust control, and `whisper.wasm` falls below 1 MB. |

**The plan is complete.** The section "Where the plan ends" holds the summary.

A rebuild needed one link option that the GNUmakefile does not have. Without
it a rebuild is twelve times slower than the module the fork shipped. The
step 3 section holds the whole investigation.

## Environment

All figures in this document come from one machine and one browser build.

| Item | Value |
| --- | --- |
| Operating system | macOS 26.2 (25C56), arm64 |
| Node.js | v26.7.0 |
| Playwright | 1.62.1 (`chromium-1234`) |
| Chromium | Google Chrome for Testing 151.0.7922.34 |
| Native C++ compiler | Apple clang 21.0.0 (clang-2100.1.1.101) |
| Emscripten SDK | 6.0.8 (`aeb67926e7de656da38bc807d83050af93578758`) |
| Branch | `optimize-whisper`, from `645aa31` |

The machine was not idle during the measurements. Other applications used
between 1 and 4 processors. Rule 7 of the plan makes the Rust core the live
control for this reason, and all comparisons between steps use the figures of
one session.

## Prerequisites

The Emscripten SDK was not on the machine. The installation needs Python 3.10
or later, and the Python of the operating system is 3.9.6. A Python 3.12.13
from `uv` solved this:

```sh
uv python install 3.12
export EMSDK_PYTHON=$(uv python find 3.12)
cd $HOME/emsdk && ./emsdk install 6.0.8 && ./emsdk activate 6.0.8
```

`build.sh` pins the SDK version, so a rebuild on another day gives the same
module. The versions 2.0.34, 3.1.74 and 6.0.8 were all measured and they agree
within a few per cent.

The native oracle (`crates/riscv-rs/SweRV-ISS-1/opt/whisper`) and the vendored
Boost library were already built in the working tree.

## Step 1: Add the benchmark harness

**State: complete.**

### What the step added

`scripts/perf-core/` contains the harness. `scripts/perf-core/README.md`
describes each file. The harness follows the properties of section 5 of the
plan, which come from sections 3 and 13 of `local/rs-cpp.md`.

The report does not contain the harness code, so step 1 rebuilt it from the
description. Three parts of the reconstruction needed a decision:

1. **The workload programs.** The report gives the shapes, the encoders
   (`crates/riscv-rs/benches/throughput_benchmarks.rs`) and the exact retired
   counts. The counts are a strong test of the reconstruction, because a
   different setup sequence gives a different count. The generator matches all
   three counts exactly:

   | Workload | Iterations | Setup | Body | Exit | Retired |
   | --- | --- | --- | --- | --- | --- |
   | `alu` | 4,000,000 | 2 | 5 | 3 | 20,000,005 |
   | `memcpy` | 2,500,000 | 6 | 8 | 3 | 20,000,009 |
   | `mixed` | 3,333,333 | 2 | 6 | 3 | 20,000,003 |

   The `memcpy` setup is 6 instructions and not the 8 of the Rust benchmark,
   because `SRC_BASE` (`0x100000`) and `DST_BASE` (`0x200000`) are exact `lui`
   immediates. Only this form gives 20,000,009.

2. **The ELF container.** Each program goes into a minimal ELF32 executable
   with one `PT_LOAD` segment and no sections. Both cores read the segment
   table.

3. **The two workers.** The globals that each worker must define come from
   section 13 of the report and from the `EM_JS` shims in `Hart.cpp`,
   `Syscall.cpp` and `Interactive.cpp` for the C++ core, and from
   `crates/riscv-rs/src/host_imports.rs` for the Rust core.

### Validation gate 1: the retired counts

**PASS.** The native oracle, the C++ core in the browser and the Rust core in
the browser all retire the exact counts, on all three workloads and with both
ISA strings.

```
PASS  --isa acdfimsu  alu     retired 20000005   99.5 MIPS native
PASS  --isa acdfimsu  memcpy  retired 20000009   66.7 MIPS native
PASS  --isa acdfimsu  mixed   retired 20000003  102.6 MIPS native
PASS  --isa acdfim    alu     retired 20000005  351.6 MIPS native
PASS  --isa acdfim    memcpy  retired 20000009  155.1 MIPS native
PASS  --isa acdfim    mixed   retired 20000003  247.4 MIPS native
```

### The baseline

Median of 5, MIPS. Headless Chromium. Full data in
`scripts/perf-core/results/step-1-baseline.json`.

| Configuration | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Rust (the control) | 202.2 | 201.6 | 261.1 |
| C++ `--isa acdfimsu` (as shipped) | 35.8 | 31.6 | 35.3 |
| C++ `--isa acdfim` | 136.1 | 90.5 | 178.6 |

Best of 5, MIPS.

| Configuration | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Rust (the control) | 205.8 | 202.8 | 263.5 |
| C++ `--isa acdfimsu` (as shipped) | 35.8 | 32.4 | 35.6 |
| C++ `--isa acdfim` | 137.0 | 90.5 | 180.2 |

### Validation gate 2: agreement with section 4.1 of the report

The gate compares the Rust control and the C++ `--isa acdfimsu` figures
against the report. The tolerance is 15% (section 8 of the plan).

| Cell | Measured | Report | Difference | Result |
| --- | --- | --- | --- | --- |
| Rust `alu` | 202.2 | 222.5 | −9.1% | PASS |
| Rust `memcpy` | 201.6 | 188.5 | +7.0% | PASS |
| Rust `mixed` | 261.1 | 244.5 | +6.8% | PASS |
| C++ `acdfimsu` `alu` | 35.8 | 35.0 | +2.3% | PASS |
| C++ `acdfimsu` `memcpy` | 31.6 | 25.0 | +26.4% | FAIL |
| C++ `acdfimsu` `mixed` | 35.3 | 28.2 | +25.2% | FAIL |

**Four of the six cells pass. Two do not.** Both failures are in the
direction that makes the C++ core look better than the report says, so they
raise the baseline and make the estimated speedup of step 2 more difficult to
reach. They do not flatter the plan.

The cause is not the same for the two cells:

- **`memcpy`.** The difference is also in the native figures, where the binary
  is the same binary the report used: 155.1 MIPS against 98.6 MIPS with
  `--isa acdfim`, and 66.7 against 58.8 with `--isa acdfimsu`. A difference
  that is present natively cannot come from the browser or from the workers.
  The `memcpy` program of this harness is therefore not byte-for-byte the
  `memcpy` program of the report, although it retires the exact count that the
  report records. The most probable difference is the address pattern of the
  loads and the stores.
- **`mixed`.** The native figures agree (102.6 against 101.1 with
  `--isa acdfimsu`), and the browser `--isa acdfim` figures agree (178.6
  against 173.9). Only the browser `--isa acdfimsu` cell differs. Section 12
  of the report records that the C++ browser samples spread by up to 33%, so
  one noisy sample in the report is a sufficient explanation.

**Decision.** The harness is fit for the plan. Every comparison in the plan is
between two steps of one session, and the Rust control agrees with the report
in all three workloads. The two cells that differ are recorded here so that a
later reader does not compare a figure of this document against the report
without this note.

### Finding: the two cores do not tier up in the same way

This finding changes how the harness must run, and any future measurement of
either core must know it.

V8 compiles a WebAssembly function with the baseline tier (Liftoff) on the
first call, and with the optimizing tier after that. It does not replace the
code of a call that is already in progress.

- The Rust core does all of its work inside one large `run_slice` function.
  The first call runs in the baseline tier from start to end. Measured, on
  `alu`: 133.2 MIPS on the first call, then 224.2, 225.5, 225.5, 225.2 and
  224.2 MIPS on the calls after it. The optimized figure is the figure the
  application delivers, because the application calls `run_slice` one time for
  each slice of a `setTimeout` chain.
- The C++ core runs its whole program inside one `main` call, and its module
  is one-shot. Its inner loop calls many small functions millions of times, so
  V8 optimizes those callees while the outer loop runs. Measured with
  `--js-flags=--liftoff-only`: 106.4 / 45.4 / 106.4 MIPS, against 119.0 / 86.2
  / 180.2 MIPS with the default flags. The C++ core therefore reaches its
  optimized speed inside one run.

A first version of this harness made a new worker for each Rust repetition and
reported 129.8 / 122.0 / 161.7 MIPS, which is about 40% below the report. The
harness now keeps one Rust worker for the whole session and makes a new C++
worker for each repetition. Section 13 of the report describes the same
arrangement ("The C++ module is one-shot ... Start a new worker for each
repetition"), and it is what each core does in the application.

### Functional checks

| Check | Result |
| --- | --- |
| 1. Retired counts | PASS. Exact on all three workloads, both cores, both ISA strings. |
| 2. The application | Not applicable. Step 1 adds new files only and changes no application file. |
| 3. MMIO | Not applicable. No application file changed. |
| 4. Interrupts | Not applicable. No application file changed. |

### Commit

`perf(whisper): add the core benchmark harness`

## The functional gate harness

**State: complete.** Commit `test(whisper): add the functional gate harness`.

Checks 2, 3 and 4 of section 7 of the plan need the application. They are now
automatic. `scripts/perf-core/checks/run_checks.cjs` serves the repository,
opens a page in headless Chromium and drives the real application worker
(`modules/simulator_worker.js`) with the real module, through the same message
protocol that `modules/simulator.js` uses.

| Program | What it proves |
| --- | --- |
| `hello.elf` | The `--newlib` write syscall reaches the terminal |
| `mmio.elf` | `jsWriteMMIO` and `jsReadMMIO` work |
| `stdin.elf` | The `--newlib` read syscall works with interrupts on, which is the `emscripten_sleep` path |

The gate does not compile a program with clang and lld in the browser. The
three programs are prebuilt ELF32 files from the same generator that makes the
benchmark workloads. Check 2 of the plan says "compiles, runs and writes to
the terminal"; this harness covers "runs and writes to the terminal", which is
the part that the steps of this plan can break. No step in the range 1 to 4
touches the compiler.

## Step 2: Change the ISA string

**State: complete.**

### Finding: the plan changes the wrong line

The plan says to change one line, `modules/simulator_worker.js` line 297. That
line is **not** where the application takes its ISA string from.

- `modules/simulator_worker.js` line 297 sets `Module.arguments` as a default.
- The `start` message replaces it: `case "start": Module.arguments =
  e.data.args`.
- The application always sends a `start` message.
  `assets/js/interface_elements.js` line 406 and `modules/assistant.js` line
  234 both push `--isa` with the result of `get_checked_ISAs()`.
- `get_checked_ISAs()` reads eight checkboxes in `index.html`. The `S` box
  (`config_isaS`) and the `U` box (`config_isaU`) had `checked=""`, so the
  application always used `--isa acdfimsu`.

Section 3.4 of `local/rs-cpp.md` names `Module.arguments` as the source of the
shipped ISA string. That identification is not correct, although the ISA
string it reports is.

The step therefore changed three lines and not one:

1. `modules/simulator_worker.js` line 297: `acdfimsu` to `acdfim`. This makes
   the fallback agree with the application.
2. `index.html`: the `config_isaS` checkbox is no longer checked.
3. `index.html`: the `config_isaU` checkbox is no longer checked.

The two checkboxes stay in the interface. A user who needs supervisor mode or
user mode can turn them on and gets the old behaviour, with the old speed.

The functional gate reads the ISA string from `index.html` for the same
reason, and it reported `--isa acdfimsu` before the change and `--isa acdfim`
after it. This is the proof that the change reaches the application.

### Results

Session `step-2-isa-acdfim`, median of 5, MIPS:

| Configuration | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Rust (the control) | 201.0 | 202.0 | 262.8 |
| C++ `--isa acdfimsu` (before the step) | 35.8 | 32.1 | 35.3 |
| C++ `--isa acdfim` (after the step) | 136.1 | 90.1 | 180.2 |

The harness measures both ISA strings in every session, so the speedup of this
step comes from two rows of one session. This removes all drift between the
two figures.

| Workload | Before | After | Measured | Estimated | Share of the estimate |
| --- | --- | --- | --- | --- | --- |
| `alu` | 35.8 | 136.1 | **3.80x** | 3.46x | 110% |
| `memcpy` | 32.1 | 90.1 | **2.81x** | 2.07x | 136% |
| `mixed` | 35.3 | 180.2 | **5.11x** | 6.17x | 83% |

Against the absolute figures that the plan projects (`alu` 121.2, `memcpy`
51.7, `mixed` 173.9), all three workloads are above the projection.

The decision rules of section 9 do not apply: no workload delivers less than
half of its estimate, and no workload regresses.

The C++ core is now at 68% of the Rust control on `alu`, 45% on `memcpy` and
69% on `mixed`.

The step-1 and step-2 sessions agree closely (`--isa acdfim`: 136.1 / 90.5 /
178.6 against 136.1 / 90.1 / 180.2), which shows that the harness repeats.

### Functional checks

| Check | Result |
| --- | --- |
| 1. Retired counts | PASS. Exact in the benchmark session. |
| 2. The application | PASS. `hello.elf` writes to the terminal with `--isa acdfim`. |
| 3. MMIO | PASS. `mmio.elf` writes and reads `0xffff0010`. |
| 4. Interrupts | PASS. `stdin.elf` receives its character with interrupts on. |

### Commit

`perf(whisper): run machine mode only (--isa acdfim)`

## Step 3: Rebuild whisper with unchanged flags

**State: complete.** The first attempt failed its gate by a factor of twelve.
The cause is now known, and one link option repairs it. This section keeps the
whole investigation, because the finding is the reason the step exists.

### What the step adds

`scripts/build-whisper/build.sh` builds `whisper.js` and `whisper.wasm` from
the SweRV-ISS source at the pinned commit
`b4a81080604a729db22a23a8a47b7bcafc3db731`, with the compile flags of line 79
of the GNUmakefile. `scripts/build-whisper/README.md` records the SDK version,
the prerequisites and the exact commands.

The script keeps the flags in the repository and not in the GNUmakefile. The
GNUmakefile is in a submodule of the `riscv-rs` crate that this branch does
not track, so a change there would not be in any commit of this repository and
a later reader could not know which flags made a module. For the same reason
the build works on a copy of the source: the submodule stays clean and the
differential harness keeps its oracle.

### The first attempt: twelve times slower

The first build used the recorded flags and nothing else. Session
`step-3-rebuild`, median of 5, MIPS:

| Configuration | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| C++ `--isa acdfim`, step 2 | 136.1 | 90.1 | 180.2 |
| C++ `--isa acdfim`, first rebuild | 11.2 | 10.7 | 11.0 |

That is 0.08x, 0.12x and 0.06x against an estimate of 1.00x. The effect of the
ISA string also disappeared, which was the first sign that one cost dominated
every other. The functional gate passed, so the module was correct and only
slow.

### What the regression was not

Each line is a measurement. Browser, `--isa acdfim`, MIPS, same machine.

| Build | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| The module RISC-V ALE shipped | 126.6 | 75.2 | 129.9 |
| Rebuild, Emscripten 6.0.8 | 11.8 | 10.8 | 11.7 |
| Rebuild, Emscripten 3.1.74 | 10.8 | 10.8 | 11.0 |
| Rebuild, Emscripten 2.0.34 (the period of the shipped module) | 10.7 | 10.7 | 10.9 |
| Rebuild, plus `-DFAST_SLOPPY` | 12.5 | 12.4 | 12.7 |
| Rebuild, compiled with `-O2` | 10.5 | — | — |
| Rebuild, linked with `-O2` | 10.0 | — | — |
| Rebuild, compiled with `-fno-inline` | 21.9 | 17.2 | 22.0 |
| Rebuild, `Hart::execute` rewritten as a `switch` | 10.7 | 10.8 | 11.1 |
| Rebuild, handlers marked `__attribute__((noinline))` | 10.7 | 10.6 | 10.9 |
| Rebuild, `-sASYNCIFY_IGNORE_INDIRECT=1` | 43.0 | 39.8 | 44.8 |
| Rebuild, no `-s ASYNCIFY` | 58.7 | 50.9 | 60.2 |

- **It is not the SDK version.** Three SDKs, from 2021, 2024 and 2026, give
  the same figure.
- **It is not `-DFAST_SLOPPY`,** so the shipped module was not built with it.
- **It is not the optimization level,** at compile or at link.
- **It is not a measurement artefact.** The wall-clock time from the first
  line of the worker to the printed figure was 1.83 s for the rebuild and
  0.21 s for the shipped module, for the same 20,000,005 instructions.
- **It is not the V8 tier decision by itself.** With
  `--js-flags=--liftoff-only`, which stops V8 from ever using its optimizing
  tier, the shipped module falls from 119 to 106 MIPS and the rebuild does not
  move at all (10.2 against 10.3). The rebuild already ran in the baseline
  tier.
- **Asyncify makes it about five times worse, but it is not the cause.** Even
  with no Asyncify the rebuild reached 59 MIPS against the 127 MIPS of the
  shipped module, which carries Asyncify.

### The cause

The rebuilt module contained two enormous functions. A build with
`--profiling-funcs` gives their names:

| Function | First rebuild | Shipped |
| --- | --- | --- |
| `Hart<unsigned long long>::execute` | 713,039 bytes | — |
| `Hart<unsigned int>::execute` | 694,014 bytes | — |
| Largest function of any name | 713,039 bytes | 231,569 bytes |
| Functions in the module | 2,259 | 5,122 |
| Share of the code in the 10 largest functions | 60% | 17% |

`Hart::execute` is the instruction dispatcher, and each of the 482 handlers
(`execAddi`, `execLw` and so on) is called from exactly one place: that
dispatch.

**`wasm-opt -O3` inlines a function that has one caller, whatever its size,**
because the original body then costs nothing. Binaryen therefore put all 482
handlers inside `execute` and made one function of about 700 KB. V8 does not
apply its optimizing tier to a function of that size, so the whole interpreter
ran in the baseline tier.

Two earlier explanations were wrong, and the measurements above remove them:

- The computed goto in the source is not the cause. A patch that rewrote
  `Hart::execute` as a `switch` changed the function from 713,019 to 712,992
  bytes and the speed not at all. LLVM already lowers a computed goto to the
  same form.
- `__attribute__((noinline))` on the handler declarations is not enough.
  `llvm-nm` shows that LLVM keeps all 969 handler symbols in `Hart.cpp.o` with
  or without the attribute. The inlining happens after that, in Binaryen.

### The repair

One link option: `-sBINARYEN_EXTRA_PASSES=-ocimfs=1`.
`one-caller-inline-max-function-size` sets the size limit of the one-caller
rule to 1, so a handler stays a function of its own. No source change is
necessary.

| Measure | Without the option | With it | The shipped module |
| --- | --- | --- | --- |
| Largest function | 694 KB | 234 KB | 231 KB |
| Functions in the module | 2,277 | 5,298 | 5,122 |
| `alu`, MIPS | 11 | 133 | 136 |

The two right-hand columns are close in every row. The toolchain that made the
shipped module did not have this behaviour.

### The result

Session `step-3-rebuild`, Emscripten 6.0.8, median of 5, MIPS:

| Configuration | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Rust (the control) | 201.8 | 202.0 | 263.2 |
| C++ `--isa acdfimsu` | 27.7 | 24.4 | 27.1 |
| C++ `--isa acdfim` | 133.3 | 77.8 | 141.8 |

Against step 2, with `--isa acdfim`:

| Workload | Step 2 | Step 3 | Measured | Estimated | Result |
| --- | --- | --- | --- | --- | --- |
| `alu` | 136.1 | 133.3 | 0.98x | 1.00x | Inside the tolerance |
| `memcpy` | 90.1 | 77.8 | 0.86x | 1.00x | Inside the tolerance, at the edge |
| `mixed` | 180.2 | 141.8 | 0.79x | 1.00x | **Outside the tolerance** |

**`mixed` regresses by 21%, and the step accepts it in writing.** The risk
paragraph of step 3 of the plan permits this: "A new SDK can change the
figures in either direction. If it does, record the new figures as the new
baseline for steps 4 to 8, and record the delta in the commit message." That
is the case here, and the change is not repairable with the tools available:

- The SDK that made the shipped module is not known and cannot be found.
  Emscripten 2.0.34, 3.1.74 and 6.0.8 give figures within a few per cent of
  each other with the repair option. 2.0.34 gives 135.1 / 79.1 / 144.9 and
  6.0.8 gives 133.3 / 77.8 / 141.8.
- The exact flags that made the shipped module are not known either. Section
  12 of `local/rs-cpp.md` recorded that limit before this work started.

**The figures of this session are the new baseline for steps 4 to 8.** Do not
compare a later step against the figures of step 2.

The SDK is pinned at 6.0.8 in `build.sh`, so a rebuild on another day gives
the same module.

### Functional checks

| Check | Result |
| --- | --- |
| 1. Retired counts | PASS. Exact on all three workloads, both ISA strings. |
| 2. The application | PASS |
| 3. MMIO | PASS |
| 4. Interrupts | PASS |

### Commit

`build(whisper): rebuild from source with unchanged flags`

## Step 4: Add -DFAST_SLOPPY

**State: complete.**

### What the step changes

`EXTRA_FLAGS=-DFAST_SLOPPY` in the build. The flag is upstream, not a local
patch. It replaces `Hart::load` with `Hart::fastLoad` and removes the
attribute lookup, the triggers, the load queue, the stack check, the CLINT
test and the console-io test from every load and store. It keeps the memory
bound test and the `jsReadMMIO` and `jsWriteMMIO` hooks, so the RISC-V ALE
devices continue to work.

The plan says to add the flag to `OFLAGS` in the GNUmakefile. It goes into
`scripts/build-whisper/build.sh` instead, for the reason that section "Step 3"
gives: this branch does not track the GNUmakefile.

### The result

Session `step-4-fast-sloppy`, median of 5, MIPS:

| Configuration | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Rust (the control) | 200.8 | 203.0 | 263.5 |
| C++ `--isa acdfimsu` | 27.8 | 27.7 | 27.1 |
| C++ `--isa acdfim` | 133.3 | 122.0 | 140.8 |

Against step 3, with `--isa acdfim`:

| Workload | Step 3 | Step 4 | Measured | Plan estimate | Share |
| --- | --- | --- | --- | --- | --- |
| `alu` | 133.3 | 133.3 | 1.00x | 1.11x | 90% |
| `memcpy` | 77.8 | 122.0 | **1.57x** | 3.35x | 47% |
| `mixed` | 141.8 | 140.8 | 0.99x | 1.12x | 88% |

No workload regresses beyond the tolerance. `memcpy` gains 57%.

### The `memcpy` estimate is wrong, and the step is kept

The `memcpy` figure is below half of its estimate, so the first decision rule
of section 9 of the plan applies: stop, find the cause, and then keep, change
or drop the step.

**The cause is the estimate and not the step.** The plan takes 3.35x from the
native figures of section 14.2 of `local/rs-cpp.md`: 98.6 MIPS without the
flag and 330.0 MIPS with it. The 98.6 does not reproduce. Step 1 already
recorded this: the same native binary that the report used gives 155.1 MIPS on
the `memcpy` workload of this harness, not 98.6, and the difference is in the
native figures, so it comes from the program and not from the browser.

A native build of the same source with and without the flag, on this machine
and on these exact ELF files (best of 3, MIPS):

| Workload | Native, plain | Native, `-DFAST_SLOPPY` | Ratio |
| --- | --- | --- | --- |
| `alu` | 358.4 | 359.5 | 1.00x |
| `memcpy` | 158.4 | 359.9 | **2.27x** |
| `mixed` | 311.4 | 321.8 | 1.03x |

The native ratio for `memcpy` is 2.27x and not 3.35x. Against that measured
ratio, the browser delivers 69% (1.57 of 2.27), which is above half. The
native ratios for `alu` and `mixed` are 1.00x and 1.03x, and the browser
delivers 1.00x and 0.99x, which agree.

The browser gain is smaller than the native gain for the reason that section
14.4 of the report gives: in the browser the Asyncify instrumentation and the
MMIO address tests of the `__EMSCRIPTEN__` build are a larger share of the
per-instruction cost, so removing work from the load and the store path helps
proportionally less.

**Decision: keep the step.** It gives a real 1.57x on `memcpy`, it regresses
nothing, and the functional checks pass. The plan estimates for step 4 should
read 1.00x / 2.27x / 1.03x native, and the browser meets or nearly meets all
three.

### The differential check

Section 7, item 5 of the plan recommends this check for step 4. A native
whisper with `-DFAST_SLOPPY` replaced the oracle, and the differential harness
of the fork ran against it:

```
running 8 tests
test test_differential_addi16sp_scaling ... ok
test test_failing_ci_sequence ... ok
test test_differential_control_flow_instructions ... ok
test test_differential_integer_instructions ... ok
test test_differential_amo_and_csr_instructions ... ok
test test_differential_floating_point_instructions ... ok
test test_differential_random_instruction_sequences ... ok
test test_differential_compressed_instructions ... ok

test result: ok. 8 passed; 0 failed
```

All 8 tests pass, so the flag changes no behaviour that the harness can reach.
The oracle was put back after the run and the submodule is clean.

The check does not cover everything the flag removes. It generates aligned
accesses inside one data window, so it does not test misaligned accesses, the
triggers, the load queue, the CLINT or the console-io path. A separate test
with a misaligned `lw` gives the same result on both binaries, because
whisper permits misaligned accesses in this configuration in any case.

### Functional checks

| Check | Result |
| --- | --- |
| 1. Retired counts | PASS. Exact on all three workloads, both ISA strings. |
| 2. The application | PASS |
| 3. MMIO | PASS. This is the check that matters most for this flag, because `fastLoad` keeps the `jsReadMMIO` hook. |
| 4. Interrupts | PASS |
| 5. Differential | PASS. 8 of 8. |

### Commit

`perf(whisper): build with -DFAST_SLOPPY`

## Step 5: Size the linear memory

**State: complete.** The reservation goes from 256 MB to 160 MB. The 64 MB
target of the plan is not reachable, and the audit that the plan asks for is
the reason.

### The audit: what pins the guest memory

The plan says to "find the highest guest address that the RISC-V ALE toolchain,
the syscalls and the stack use". This is the answer:

| Item | Address | Source |
| --- | --- | --- |
| The guest stack pointer | `0x7FFFFFC` | `index.html`, the `so_stack_pointer_value` field |
| The guest memory of whisper | 128 MB, so the top address is `0x7FFFFFF` | `whisper.cpp` line 1672, `memorySize = size_t(1) << 27` |
| The MMIO window | `0xffff0000` and above | Not in the guest memory. `Hart.cpp` tests `addr > 0xffff0000` **before** `memory_.read`, so the window goes through `jsReadMMIO` and `jsWriteMMIO` and does not constrain the size. |
| The program image | `0x1000` and up, a few kilobytes | The ELF that `ld.lld` writes |
| The `--newlib` heap | Between the program image and the stack | `Syscall.cpp` |

**The stack pointer is the highest guest address, and it is 4 bytes below the
top of the 128 MB guest memory.** The guest memory of whisper is therefore
already the smallest safe value. It cannot go down while the application starts
a program with that stack pointer.

Two facts of the plan are not correct, and this changes what step 5 can do:

1. **The 256 MB reservation is not the guest memory.** Section 6.3 of
   `local/rs-cpp.md` reads the 256 MB of `-s TOTAL_MEMORY=268435456` as the
   guest memory. It is the WebAssembly linear memory, which holds the guest
   memory **and** the heap of the module. The guest memory is 128 MB inside it.
2. **The 64 MB target needs an application change, not a build flag.** To get
   the reservation to 64 MB, the stack pointer must go to `0x3FFFFFC` or lower.
   That is not a safe change: the stack pointer is part of every saved project
   link. `data/home.json` holds two of them, and both carry
   `"so_stack_pointer_value": "0x7FFFFFC"`. A link that a user saved a year ago
   would set the field back to `0x7FFFFFC`, and the first push would fault. The
   links that users hold cannot be found or changed.

### What the step changes

1. **`TOTAL_MEMORY` from 268435456 (256 MB) to 167772160 (160 MB)** in
   `scripts/build-whisper/build.sh`.
2. **`patches/0001-parameterize-the-link-flags.patch`.** The link rule of the
   GNUmakefile had `-s TOTAL_MEMORY=268435456 -lworkerfs.js -s ASYNCIFY`
   written into it, after `LINK_LIBS`. An Emscripten setting that comes later
   on the command line wins, so nothing that `build.sh` passed could change the
   memory size. The first attempt of this step proved it: the link line still
   showed 268435456. The patch moves the three settings into an `EM_LINK_FLAGS`
   variable with `?=`, so a build that does not set the variable gives the same
   module as before the patch. **Step 8 needs this patch too**, because
   `-s ASYNCIFY` is on the same line.
3. **The functional gate now takes the stack pointer from `index.html`.** It
   took the ISA string from there since step 2, but it used `sp=0x10000`. A
   gate with a low stack pointer cannot find a linear memory that is too small,
   which is exactly the failure that step 5 risks.

### How 160 MB was chosen

The floor is the 128 MB guest memory plus the heap of the module, which is
mostly the 128K-entry decode cache (`Hart.cpp` line 112). The measurement is a
bisection: build the module, run it, and see whether it starts.

| Linear memory | Non-guest heap | Result |
| --- | --- | --- |
| 160 MB | 32 MB | Runs |
| 144 MB | 16 MB | Runs |
| 140 MB | 12 MB | Runs |
| 138 MB | 10.5 MB | `Aborted(OOM)` |

The need is therefore between 10.5 and 12 MB above the guest memory. 160 MB
leaves 32 MB, which is 2.7 times the measured need. The margin is for what the
application does and the probe does not: WORKERFS, a real ELF file of some
megabytes, the terminal buffers and the interactive shell.

**The functional gate finds a memory that is too small.** A 138 MB module fails
all three checks with `Aborted(OOM)`, which is the proof that the gate has
teeth for this step.

### The new metrics

The benchmark harness cannot show the effect of this step, so
`scripts/perf-core/startup/` is new. It reports the reservation, the time to
the first instruction and the module sizes. The probe program writes to the
MMIO window on its third instruction, and both cores have that hook, so the
timestamp has the same meaning for both.

Median of 7, milliseconds. Both sessions are on the same machine, one after the
other.

| Configuration | Step 4 | Step 5 | Reservation, step 4 | Reservation, step 5 |
| --- | --- | --- | --- | --- |
| Rust (the control) | 6.5 | 6.2 | 1.8 MB | 1.8 MB |
| C++ `--isa acdfim` | 46.8 | 48.0 | 256 MB | 160 MB |
| C++ as the application starts it | 46.2 | 47.0 | 256 MB | 160 MB |

| Metric | Step 4 | Step 5 | Change |
| --- | --- | --- | --- |
| Reservation | 256 MB | 160 MB | **−37.5%** |
| Time to the first instruction | 46.2 ms | 47.0 ms | +0.8 ms, inside the noise |
| `whisper.wasm` | 4,095,232 bytes | 4,095,232 bytes | none |

### Finding: the reservation costs almost no time

The plan expects the reservation to add to the startup time (section 15.3 of
the report). It does not. 96 MB less reservation changed the time to the first
instruction by less than 1 ms, which is inside the spread of the samples.

The cause is that a `WebAssembly.Memory` reservation is virtual. The browser
does not touch the pages until the module writes to them. What does cost time
is the write: the guest memory is an `mmap` of 128 MB, and Emscripten
implements an anonymous `mmap` as an allocation that it fills with zeros.

The `cpp-16mb` row of the startup results measures that cost. It gives whisper
a 16 MB guest memory with `--memorysize`, which is a run-time option and needs
no rebuild:

| Configuration | To the first instruction | To the exit |
| --- | --- | --- |
| C++, 128 MB guest memory (the application) | 47.0 ms | 150.7 ms |
| C++, 16 MB guest memory | 32.0 ms | 136.6 ms |
| Rust (the control) | 6.2 ms | 6.4 ms |

**The 128 MB guest memory costs 15 ms of the 47 ms.** That is the whole prize
for a smaller guest memory, and it is the number to weigh against breaking
every saved project link. The row stays in the harness so that a later reader
does not have to measure it again.

The remaining 32 ms is the fetch, the compile and the instantiation of a 4 MB
module, against 6 ms for the 129 KB Rust module. **Steps 6, 7 and 8 attack that
32 ms**, because they make the module smaller.

### Throughput

Step 5 does not target throughput, and the estimate is 1.00x. Session
`step-5-memory`, median of 5, MIPS, `--isa acdfim`:

| Workload | Step 4 | Step 5 | Measured | Estimated | Result |
| --- | --- | --- | --- | --- | --- |
| `alu` | 133.3 | 131.6 | 0.99x | 1.00x | Inside the tolerance |
| `memcpy` | 122.0 | 122.0 | 1.00x | 1.00x | Inside the tolerance |
| `mixed` | 140.8 | 140.8 | 1.00x | 1.00x | Inside the tolerance |

The Rust control of this session is 211.4 / 207.3 / 263.9 MIPS, against 200.8 /
203.0 / 263.5 in the step 4 session. The control moved up by 5% on `alu`, so
the machine was a little faster in this session, not slower.

### Functional checks

| Check | Result |
| --- | --- |
| 1. Retired counts | PASS. Exact on all three workloads, both ISA strings. |
| 2. The application | PASS, with `sp=0x7FFFFFC` from `index.html` |
| 3. MMIO | PASS |
| 4. Interrupts | PASS |

### Commit

`perf(whisper): reduce the linear memory reservation`

## Step 6: Trim the source list

**State: complete.** `whisper.wasm` goes from 4,095,232 to 2,393,197 bytes,
which is 41.6% less. Two statements of the plan are not correct, and the two
findings below hold them.

### What the step changes

Five macros, one for each subsystem that RISC-V ALE cannot reach.
`scripts/build-whisper/build.sh` puts them in `TRIM_FLAGS`, and
`patches/0002` and `patches/0003` hold the guards.

| Macro | Subsystem | Why RISC-V ALE cannot reach it |
| --- | --- | --- |
| `ALE_NO_VECTOR` | The V extension | `index.html` has no V checkbox, so `isRvv()` is always false and `decodeVec` already answers with the illegal entry |
| `ALE_NO_BITMANIP` | The B extension, `zba` to `zbt` | No checkbox either, and every handler already starts with an `isRvzb*` test that traps |
| `ALE_NO_GDB` | The GDB stub | It needs a socket, which a browser worker does not have, and nothing passes `--gdb` |
| `ALE_NO_SERVER` | The socket server | Nothing passes `--server` |
| `ALE_NO_SNAPSHOT` | Save and load a snapshot | Nothing passes `--loadfrom` or `--snapshotperiod` |

No guard changes what a guest program can do. The V and the B handlers were
already unreachable, because the ISA string of the application has no `v` and
no `b`. The guard removes the code behind a test that was always false.

### Finding: the application uses the interactive shell

The plan lists "the interactive shell" as a subsystem to remove. **That is not
correct.** The "run with debug" button of the application passes
`--interactive` (`assets/js/interface_elements.js` line 405 and
`modules/assistant.js` line 233). The shell stays, and the disassembler stays
with it, because the instruction trace of the shell uses it.

The functional gate now has a check for the shell, which is check 5 of the
table below. It runs `hello.elf` with `--interactive` and sends `peek pc`,
`run` and `quit` through the same `interactive` message that
`modules/simulator.js` sends. A build that removes the shell fails this check.

### Finding: no source list edit was necessary

The plan says to "remove from the build" the unused subsystems. A build list
edit is not possible for the V and the B handlers, and it is not necessary for
any of the five subsystems:

- `Hart<URV>::execute` dispatches with a computed goto, and its label array
  holds the address of every handler. A handler is therefore always referenced,
  and the linker cannot drop it, whatever the build list says. This is the
  reason the first attempt of this step changed the module size by 0 bytes.
- When the guard points those array entries at the `illegal` label, the
  reference goes and `wasm-ld --gc-sections` takes the handler and everything
  behind it. The `.cpp` file stays in the build list and the object file stays
  in `librvcore.a`.

The step therefore adds compile-time guards only. It changes no build list,
which also means that a build with `TRIM_FLAGS=` gives the module of step 5
again.

### The result: the module size

| File | Step 5 | Step 6 | Change |
| --- | --- | --- | --- |
| `whisper.wasm`, raw | 4,095,232 | 2,393,197 | **−41.6%** |
| `whisper.wasm`, gzip | 942,427 | 605,256 | −35.8% |
| `whisper.js`, raw | 96,479 | 79,734 | −17.4% |
| `whisper.js`, gzip | 26,416 | 21,873 | −17.2% |

The module has 2,771 functions after the step, and the largest is 234,376
bytes. (Step 7 named that function with a symbol map: it is
`InstTable::setupInstVec()`, and not `Hart<URV>::execute`.) The Rust module is
132,561 bytes, so the C++ module is 18 times as large after this step and 31
times as large before it.

The combined target of steps 6 and 7 is a raw module of 1 MB to 1.5 MB. Step 6
gives 2.39 MB.

### Finding: the module size is not the startup cost

The startup harness now splits the time to the first instruction into two
parts. `moduleMs` is the fetch, the compile and the instantiation of the
module, which ends at the Emscripten `preRun` hook. `coreInitMs` is everything
after that hook and before the first guest instruction: the instruction table,
the CSRs, the decode cache, the guest memory and the program load.

Median of 9, milliseconds. Both sessions are on this machine, one after the
other.

| Configuration | To the first instruction | ... the module | ... the core startup | To the exit |
| --- | --- | --- | --- | --- |
| Rust, step 6 | 6.3 | 1.9 | 2.4 | 6.5 |
| C++ as the application starts it, step 5 | 47.1 | 8.7 | 37.3 | 153.5 |
| C++ as the application starts it, step 6 | 47.3 | 7.7 | 38.5 | 154.7 |
| C++ `--isa acdfim`, step 5 | 50.1 | 9.1 | 39.8 | 157.7 |
| C++ `--isa acdfim`, step 6 | 47.4 | 7.1 | 39.3 | 154.6 |
| C++ with a 16 MB guest memory, step 6 | 31.6 | 7.3 | 23.1 | 137.1 |

**The module part is 8 ms of the 47 ms, and not 32 ms.** A module that is 41.6%
smaller made that part about 1 ms shorter, which is at the edge of the noise.

This corrects the step 5 section. It says "about 32 ms is the fetch, the
compile and the instantiation of a 4 MB module". That was an inference from the
total time, and the split measurement shows that it is wrong. The 47 ms divides
like this:

| Part | Time | Can a step change it? |
| --- | --- | --- |
| Fetch, compile and instantiate the module | 8 ms | Yes, but the whole part is 8 ms |
| Zero the 128 MB guest memory | 16 ms | No. Step 5 closed this: the stack pointer of the application pins the guest memory. |
| The instruction table, the CSRs, the 128K-entry decode cache and the program load | 23 ms | Not measured further. This is the largest part. |

The 16 ms for the guest memory is the difference between the `coreInit` of the
128 MB row and of the 16 MB row (39.3 against 23.1). Step 5 measured the same
16 ms from the total.

**What this means for the next steps.** Step 7 and step 8 make the module
smaller again, and a smaller module cannot buy more than the 8 ms that this
part costs in total. A step that wants the startup time must work on the 23 ms
of the core startup, and the plan has no step for it.

### Throughput

Step 6 does not target throughput, and the estimate is 1.00x. Session
`step-6-trim`, median of 5, MIPS:

| Configuration | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Rust (the control) | 204.3 | 201.2 | 260.4 |
| C++ `--isa acdfimsu` | 25.2 | 25.6 | 25.0 |
| C++ `--isa acdfim` | 135.1 | 125.0 | 144.9 |

Against step 5, with `--isa acdfim`:

| Workload | Step 5 | Step 6 | Measured | Estimated | Result |
| --- | --- | --- | --- | --- | --- |
| `alu` | 131.6 | 135.1 | 1.03x | 1.00x | Inside the tolerance |
| `memcpy` | 122.0 | 125.0 | 1.02x | 1.00x | Inside the tolerance |
| `mixed` | 140.8 | 144.9 | 1.03x | 1.00x | Inside the tolerance |

The Rust control of this session is 3% below the control of the step 5 session
(204.3 / 201.2 / 260.4 against 211.4 / 207.3 / 263.9), so the machine was a
little slower in this session and the small gain is not machine drift. Against
the live control, the C++ core goes from 62% / 59% / 53% to 66% / 62% / 56%.

The `--isa acdfimsu` row falls from 27.6 / 27.6 / 27.1 to 25.2 / 25.6 / 25.0,
which is 7% to 9%. That is inside the 15% tolerance, and the application does
not use that configuration after step 2. The cause was not investigated.

### Functional checks

| Check | Result |
| --- | --- |
| 1. Retired counts | PASS. Exact on all three workloads, both ISA strings. |
| 2. The application | PASS |
| 3. MMIO | PASS |
| 4. Interrupts | PASS |
| 5. The interactive shell (new) | PASS. `peek pc` answers `0x00001000` and `run` reaches the write syscall. |

### Commit

`build(whisper): remove the subsystems that ALE does not use`

## Step 7: RV32-only build

**State: complete.** `whisper.wasm` goes from 2,393,197 to 1,757,149 bytes,
which is 26.6% less. The combined target of steps 6 and 7 is a raw module of
1 MB to 1.5 MB, and the module is 1.76 MB, so the target is not reached. A
symbol map says why, and the answer is below: 909 KB of what is left has no
connection to the register width.

### What the step changes

`RV32_FLAGS=-DALE_NO_RV64` and `patches/0004`. Each template of the core is
instantiated two times, one for `uint32_t` and one for `uint64_t`. The patch
puts the second instantiation of each one behind the macro:

| Site | Count |
| --- | --- |
| `template class WdRiscv::X<uint64_t>;` at the end of a `.cpp` file | 16 |
| `handleExceptionForGdb<uint64_t>` in `gdb.cpp`, one in each branch of the `ALE_NO_GDB` guard | 2 |
| The member-template instantiations at the end of `Hart.cpp` (`store` and `determineStoreException`) | 6 |
| The member-template instantiations at the end of `HartConfig.cpp` | 5 |
| The `session<uint64_t>` call in `main` | 1 |

The `template <>` member specializations for `Hart<uint64_t>` stay:
`execMulh`, `execMulhsu`, `execMulhu` and `execLd` in `Hart.cpp`, and five
`execFcvt` and `execFmv` functions in `float.cpp`. They are ten small
functions, nothing references them when the class is not instantiated, and
`wasm-ld --gc-sections` takes them out. The symbol map of the new module
confirms that none of them is in it. The patch is therefore mechanical: it
adds a guard and it removes no code.

### RISC-V ALE cannot ask for RV64

`whisper.cpp` takes the register width from the command line (`--xlen`), then
from the configuration file, then from the class of the ELF file. All three say
32 in RISC-V ALE:

- Nothing in the application passes `--xlen`. The word does not appear outside
  the SweRV-ISS source.
- The clang of the application is hard-wired to RV32. `modules/clang_worker.js`
  line 15 passes `-triple riscv32--` and `-target-abi ilp32d`, and line 23 does
  the same for the assembler. A user cannot change it from the interface.
- The ELF file that `ld.lld` then writes is ELFCLASS32.

With the guard, an RV64 ELF gets the answer "This build has no RV64 support"
and the program does not run. Before the guard it ran.

### The result: the module size

| File | Step 6 | Step 7 | Change |
| --- | --- | --- | --- |
| `whisper.wasm`, raw | 2,393,197 | 1,757,149 | **−26.6%** |
| `whisper.wasm`, gzip | 605,256 | 475,406 | −21.5% |
| `whisper.js`, raw | 79,734 | 79,734 | none |
| Functions | 2,771 | 2,271 | −500 |

`whisper.js` does not change at all. It is the Emscripten loader, and it holds
no core code.

Against the state before step 6, `whisper.wasm` goes from 4,095,232 to
1,757,149 bytes, which is 57.1% less. It is 13.3 times the size of the Rust
module, against 30.9 times before step 6.

### Where the module is

The step needed to know what is in the module, so `build.sh` has two new
options: `LINK_EXTRA=--emit-symbol-map` writes the symbol map, and
`NO_INSTALL=1` keeps a module that is for a measurement out of `modules/`. The
`.wasm` file of a symbol-map build has the same size as the module the branch
ships (2,393,197 and 1,757,149 bytes), so the attribution below is an
attribution of the shipped modules.

`scripts/perf-core/startup/wasm_sizes.cjs --group` gives the size of each
subsystem. The bytes are the sum of the function bodies.

| Subsystem | Step 6 | Step 7 | Change | Templated on the width |
| --- | --- | --- | --- | --- |
| The interpreter (`Hart`, `Core`, `System`, `DecodedInst`) | 547,404 | 265,278 | −282,126 | Yes |
| Other (libc, libc++, Emscripten, Asyncify) | 509,331 | 487,936 | −21,395 | No |
| The instruction table | 242,367 | 239,995 | −2,372 | No |
| The disassembler | 234,586 | 117,285 | −117,301 | Yes |
| Boost.program_options | 181,153 | 180,818 | −335 | No |
| The configuration file (JSON) | 165,103 | 107,759 | −57,344 | Yes |
| The CSRs | 137,197 | 69,873 | −67,324 | Yes |
| The interactive shell | 86,403 | 50,280 | −36,123 | Yes |
| The syscalls | 73,632 | 36,792 | −36,840 | Yes |
| Memory, PMA and PMP | 60,410 | 56,936 | −3,474 | Yes |
| Virtual memory | 21,490 | 21,496 | +6 | Yes |
| The triggers | 14,995 | 7,206 | −7,789 | Yes |
| The command line | 14,962 | 20,052 | +5,090 | No |
| The vector extension, what is left of it | 4,788 | 4,788 | none | No |
| **Total** | **2,293,821** | **1,666,494** | **−627,327** | |

**Why the module did not halve.** The groups that the register width does not
touch hold 909 KB of the 1,666 KB that is left:

| Group | Bytes | What it is |
| --- | --- | --- |
| Other | 487,936 | libc, libc++, the Emscripten runtime and the Asyncify instrumentation. Step 8 attacks the last part. |
| The instruction table | 239,995 | One function, `InstTable::setupInstVec()`, which builds the 482-entry table. It is not a template. |
| Boost.program_options | 180,818 | The command-line parser, 296 functions. Nothing in RISC-V ALE needs a general parser: the worker sends a fixed argument list. |

The groups that the width does touch went from 1,319,730 to 711,409 bytes,
which is 46.1% less, and that is the halving the plan expects. The "command
line" group grew by 5 KB, because `main` now has only one `session` call and
the linker inlines more into it.

### Correction to the step 6 section

The step 6 section says that the largest function of the module, 234,376
bytes, is `Hart<URV>::execute`. The symbol map says that it is
`WdRiscv::InstTable::setupInstVec()`. `Hart<unsigned int>::execute` is 7,728
bytes, which is what `-sBINARYEN_EXTRA_PASSES=-ocimfs=1` gives: the 482
handlers stay outside it. The step 3 finding does not change, because a
`--profiling-funcs` build named the 713,039-byte function of the first rebuild
directly.

`setupInstVec()` is also the reason the largest function is the same in step 6
and in step 7. It is not a template, so the register width does not touch it.

### Startup

Median of 9, milliseconds.

| Configuration | To the first instruction | ... the module | ... the core startup | To the exit |
| --- | --- | --- | --- | --- |
| Rust, step 7 | 6.3 | 1.8 | 2.3 | 6.5 |
| C++ as the application starts it, step 6 | 47.3 | 7.7 | 38.5 | 154.7 |
| C++ as the application starts it, step 7 | 46.3 | 6.9 | 38.5 | 153.3 |
| C++ `--isa acdfim`, step 6 | 47.4 | 7.1 | 39.3 | 154.6 |
| C++ `--isa acdfim`, step 7 | 44.1 | 6.3 | 36.8 | 150.2 |
| C++ with a 16 MB guest memory, step 7 | 31.5 | 6.9 | 23.4 | 137.4 |

The module part falls by 0.8 ms for 636 KB less module. This repeats the
finding of step 6, and it is now measured two times on two different size
changes: **the module size is not where the startup time is.**

### Throughput

Step 7 does not target throughput, and the estimate is 1.00x. Session
`step-7-rv32`, median of 5, MIPS:

| Configuration | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Rust (the control) | 206.8 | 210.1 | 265.6 |
| C++ `--isa acdfimsu` | 25.8 | 25.8 | 25.5 |
| C++ `--isa acdfim` | 137.0 | 126.6 | 147.1 |

Against step 6, with `--isa acdfim`:

| Workload | Step 6 | Step 7 | Measured | Estimated | Result |
| --- | --- | --- | --- | --- | --- |
| `alu` | 135.1 | 137.0 | 1.01x | 1.00x | Inside the tolerance |
| `memcpy` | 125.0 | 126.6 | 1.01x | 1.00x | Inside the tolerance |
| `mixed` | 144.9 | 147.1 | 1.02x | 1.00x | Inside the tolerance |

The Rust control of this session is 1% to 4% above the control of the step 6
session, so the small gain is machine drift and not the step. Against the live
control, the C++ core is at 66% / 60% / 55%, which is the same place as after
step 6.

### Functional checks

| Check | Result |
| --- | --- |
| 1. Retired counts | PASS. Exact on all three workloads, both ISA strings. |
| 2. The application | PASS |
| 3. MMIO | PASS |
| 4. Interrupts | PASS |
| 5. The interactive shell | PASS |

### Commit

`build(whisper): instantiate for RV32 only`

## Step 8: Replace Asyncify with a budget-and-return run loop

**State: complete.** 1.82x on `alu`, 1.80x on `memcpy` and 1.60x on `mixed`,
against an estimate of 1.12x to 1.39x. The C++ core is now at 110%, 112% and
90% of its live Rust control, and `whisper.wasm` is below 1 MB.

### What the step changes

Asyncify instruments every function that can reach `emscripten_sleep`, and the
core pays that cost on every instruction. The core slept for two reasons: to
give the worker its event loop back, so that a message could arrive, and to
wait for something (a character on the standard input, or a command of the
interactive shell).

Without Asyncify a wait must be a return to JavaScript. The module therefore
changes shape:

| Item | With Asyncify | Without it |
| --- | --- | --- |
| Where the program runs | Inside `main` | Inside `ale_run_slice`, which the worker calls |
| What `main` does | Everything, and then the module is finished | Sets the session up and returns |
| The wait of the run loop | `emscripten_sleep(int_sleep_duration)` | The slice returns after its budget of instructions |
| The wait for input | A loop around `emscripten_sleep(10)` | The hart backs up to the `ecall` and the slice returns |
| The wait for a shell command | A loop around `emscripten_sleep(100)` | `interactSlice` takes the commands that are ready and returns |
| After the report | `emscripten_sleep(100)`, then `jsSimStop` | `jsSimStop`, and the worker sends the output first |

`patches/0005` holds the C++ side:

- **`Hart::aleRunSlice(file, budget)`** is what `run` becomes. It keeps the
  state of a run in the hart (`aleCounter0_`, `aleElapsed_`, `aleRunActive_`),
  so a call continues where the call before it stopped, and it prints the
  instructions-per-second line one time only, with the time of all the slices
  together. The report of the benchmark therefore has the same meaning as
  before.
- **The budget goes into `instCountLim_`**, which both run loops already test.
  **The hot loop has no test that it did not have before.** A slice with no
  limit runs `simpleRunNoLimit`, which is the loop that a run with Asyncify
  used, so the fast path is byte-for-byte the same work.
- **The wait for input.** `Syscall` case 63 calls `readFromStdin` one time.
  When there is no character it calls `Hart::aleSetBlocked`, which backs `pc_`
  up to the `ecall`, takes one off `instCounter_` (the `ecall` did not retire)
  and stops the loop. `execEcall` keeps the value of `a0`, because the slice
  after this one runs the same `ecall` again and the syscall needs its
  arguments. `getStdin` in the worker takes no character when it answers -1,
  so nothing is lost.
- **The shell.** `Interactive::interactSlice` takes the commands that are
  ready and returns. The state that `interact` kept on its stack (the hart id,
  the replay stream, the error count) is now in the object. An `until` command
  sets a stop address and calls `run`, so it also goes through the slices
  instead of running to the address inside one call.
- **`whisper.cpp`** gets the slice driver: `aleStart` (the setup part of
  `sessionRun`), `aleSlice` (one slice, which knows whether the shell has a run
  in progress), `aleFinish` (the tail of `session`) and the exported
  `ale_run_slice`. The `System`, the `Interactive` and the open files live in a
  static object, and `main` keeps its `Args` and its `HartConfig` in statics,
  because the slices run after `main` returns.

`ale_run_slice(budget)` answers 0 (the program is finished), 1 (instructions
ran) or 2 (it waits for the host).

The JavaScript side: `modules/simulator_worker.js` starts the slice chain from
the Emscripten `postRun` hook and calls the next slice from `setTimeout`. The
two `worker_cpp.js` files of `scripts/perf-core/` do the same with one
unlimited slice. Each one tests for `Module._ale_run_slice` first and falls
back to the old model, so the same worker drives a module with Asyncify and a
module without it. `finishExec` in the application worker now sends the output
that is still in the buffer before the host sees the stop, which is the job
that the 100 ms sleep did.

### The plan would have removed a feature, and the step keeps it

The plan says to "tune the budget so each slice lands between 8 ms and 16 ms",
which is what the Rust worker does. **That would take the frequency control out
of RISC-V ALE.**

The sleep of the run loop is not only a yield. It is also the clock of the
simulated processor:

- `index.html` has an `int_freq_range` slider. `simulator.js` line 151 turns it
  into `set_int_delay` with the value `(2**(32 - scale)) - 1`, and the default
  scale of 25 gives 127.
- The core uses that value as `int_inst_mask` and tests `instCounter_ &
  int_inst_mask`, so with 127 it stops every 128 instructions and sleeps
  `simulator_sleep[0]`, which is 1 ms. The application therefore runs at about
  128 thousand instructions each second, and the slider changes that rate.

The worker of this step keeps both numbers:

| Interrupts | Budget | Delay between two slices |
| --- | --- | --- |
| On | `simulator_int_inst_delay` + 1 | `simulator_sleep[0]` |
| Off | 0, which is no limit | 0 |

The core therefore tests for an interrupt at the same instruction count as
before and waits the same time, and the slider keeps its meaning. With
interrupts off there is nothing to test and the program runs in one slice,
which is what the benchmark measures.

### The defect that the new gate check found

The first version of the patch stopped the run with `noUserStop`, which the
fast loops test. **`untilAddress` does not test `noUserStop`; it tests
`userStop`.** The interactive shell uses `untilAddress`, because interactive
mode turns the triggers and the performance counters on. A read of the standard
input inside the shell therefore backed the hart up to the `ecall` and ran it
again, forever, inside one slice. The worker never returned to JavaScript, so
the character could never arrive.

A new check in the functional gate, `interactive-stdin`, runs `stdin.elf` with
`--interactive` and a `run` command. With the first version of the patch **that
check does not finish**, which is the proof that it has teeth. The repair puts
the test in the condition of `untilAddress`:

```cpp
while (pc_ != address and instCounter_ < limit and not aleBlocked_)
```

That loop is the one that does everything, so one test more for each
instruction does not matter. The fast loops keep their zero extra cost.

### Throughput

Both sessions are back to back on this machine. The step 7 session of the
morning is not the control here, because the machine moved between the two: the
Rust control of that session was 206.8 / 210.1 / 265.6 MIPS and of this one it
is 207.3 / 192.7 / 250.6. The results file of the control session is
`scripts/perf-core/results/step-8-control-step-7.json`.

Median of 5, MIPS:

| Configuration | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Rust, control session | 207.3 | 192.7 | 250.6 |
| Rust, step 8 session | 214.6 | 193.6 | 251.6 |
| C++ `--isa acdfim`, step 7 | 129.0 | 120.5 | 141.8 |
| C++ `--isa acdfim`, step 8 | **235.3** | **217.4** | **227.3** |
| C++ `--isa acdfimsu`, step 7 | 24.7 | 24.8 | 24.4 |
| C++ `--isa acdfimsu`, step 8 | 49.5 | 39.8 | 36.2 |

| Workload | Step 7 | Step 8 | Measured | Plan estimate | Share |
| --- | --- | --- | --- | --- | --- |
| `alu` | 129.0 | 235.3 | **1.82x** | 1.12x to 1.39x | 131% of the top |
| `memcpy` | 120.5 | 217.4 | **1.80x** | 1.12x to 1.39x | 130% |
| `mixed` | 141.8 | 227.3 | **1.60x** | 1.12x to 1.39x | 115% |

The estimate was too low, and the "What the next steps should know" note of
step 5 said so before the step ran. Asyncify costs much more than the
native-to-WebAssembly ratio of section 14.4 of the report suggests.

Against the live Rust control:

| Workload | Step 7 | Step 8 |
| --- | --- | --- |
| `alu` | 62% | **110%** |
| `memcpy` | 63% | **112%** |
| `mixed` | 57% | **90%** |

Against the projection of the plan (section 10, scenario B: 248 / 240 / 220):
95%, 91% and 103%. Against the Rust figures of the report (222.5 / 188.5 /
244.5): 106%, 115% and 93%.

The samples of the C++ core now come in steps of about 1%, because the core
times itself with `gettimeofday` and a run of 20 million instructions takes
about 88 ms. Two workloads can therefore report the same figure.

### Size and startup

| File | Step 7 | Step 8 | Change |
| --- | --- | --- | --- |
| `whisper.wasm`, raw | 1,757,149 | 956,545 | **−45.6%** |
| `whisper.wasm`, gzip | 475,406 | 310,188 | −34.8% |
| `whisper.js`, raw | 79,734 | 70,791 | −11.2% |

**The module is below 1 MB**, which is the target of section 10 of the plan for
the end state. Against the module that RISC-V ALE shipped (4,608,325 bytes) it
is 79.2% smaller.

Median of 9, milliseconds, both sessions back to back:

| Configuration | To the first instruction | ... the module | ... the core startup | To the exit |
| --- | --- | --- | --- | --- |
| Rust, control session | 5.8 | 1.8 | 1.8 | 5.9 |
| Rust, step 8 session | 4.7 | 1.4 | 1.7 | 4.9 |
| C++ as the application starts it, step 7 | 44.8 | 6.5 | 37.2 | 150.6 |
| C++ as the application starts it, step 8 | 34.4 | 4.6 | 28.6 | 35.6 |
| C++ with a 16 MB guest memory, step 8 | 19.2 | 4.7 | 13.8 | 20.5 |

**The time to the exit falls from 150.6 ms to 35.6 ms.** That is the 100 ms
sleep that `reportInstsPerSec` had after the report. Every program of the
application paid it.

The time to the first instruction falls from 44.8 to 34.4 ms. The Rust control
of the two sessions differs by 19% on the same figure (5.8 against 4.7), so
that comparison carries noise of about that size. The module part falls from
6.5 to 4.6 ms, which agrees with the finding of steps 6 and 7: a smaller module
buys little, because the whole part is small.

### The differential check of the plan is not possible for this step

Section 7, item 5 of the plan recommends the differential harness with a native
build of the modified whisper as the oracle. **That build cannot be an oracle.**
Without JavaScript nothing calls `ale_run_slice`, so a native
`-DALE_NO_ASYNCIFY` whisper would set the session up and exit without running
one instruction.

The step also does not need it. It changes no instruction semantics: `execute`,
`decode` and all 482 handlers are untouched, and the guards are only in the
stop condition of the run loops, the wait of one syscall, the command read of
the shell and the report. The evidence for the step is:

1. The exact retired counts, on three workloads and both ISA strings, in every
   benchmark session. Each one is an end-to-end comparison over 20 million
   instructions against the counts that every earlier step produced.
2. The five checks of the functional gate, two of which exist for the paths
   that this step changes.

### Functional checks

| Check | Result |
| --- | --- |
| 1. Retired counts | PASS. Exact on all three workloads, both ISA strings. |
| 2. The application | PASS |
| 3. MMIO | PASS |
| 4. Interrupts | PASS. `stdin.elf` receives its character with interrupts on, which is now the new yield model. |
| 5. The interactive shell | PASS |
| 6. The shell with a read of the standard input (new) | PASS. This check found the defect above. |

### Commit

`perf(whisper): replace Asyncify with a budget-and-return run loop`

## Where the plan ends

All eight steps are complete. The objective of section 1 of the plan was a
browser throughput near the Rust core. **The C++ core now reaches 110%, 112%
and 90% of its live Rust control.**

Median of 5, MIPS, with `--isa acdfim`, which is what the application uses
after step 2. Each figure comes from the session of its own step, so the
machine drift between sessions is inside these numbers; the Rust control of
each session is in the results file of that session.

| Milestone | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Step 1, the module as shipped (`--isa acdfimsu`) | 35.8 | 31.6 | 35.3 |
| Step 2, machine mode only | 136.1 | 90.1 | 180.2 |
| Step 3, rebuilt from source | 133.3 | 77.8 | 141.8 |
| Step 4, plus `-DFAST_SLOPPY` | 133.3 | 122.0 | 140.8 |
| Step 5, a 160 MB linear memory | 131.6 | 122.0 | 140.8 |
| Step 6, the subsystems that ALE cannot reach | 135.1 | 125.0 | 144.9 |
| Step 7, RV32 only | 137.0 | 126.6 | 147.1 |
| Step 8, no Asyncify | **235.3** | **217.4** | **227.3** |
| The Rust control, step 8 session | 214.6 | 193.6 | 251.6 |
| Share of the control | **110%** | **112%** | **90%** |

The total against the state that RISC-V ALE shipped is **6.6x on `alu`, 6.9x on
`memcpy` and 6.4x on `mixed`**. Section 1 of `local/rs-cpp.md` measured the
Rust core as 6.4 to 8.7 times as fast as the C++ core in that state, so the
step from "6.4 to 8.7 times slower" to "0.9 to 1.1 times as fast" is the whole
gap that the report found.

The secondary metrics:

| Milestone | Reservation | To the first instruction | To the exit | `whisper.wasm` |
| --- | --- | --- | --- | --- |
| As shipped | 256 MB | — | — | 4,608,325 bytes |
| Step 4 | 256 MB | 46.2 ms | — | 4,095,232 bytes |
| Step 5 | 160 MB | 47.1 ms | 153.5 ms | 4,095,232 bytes |
| Step 6 | 160 MB | 47.3 ms | 154.7 ms | 2,393,197 bytes |
| Step 7 | 160 MB | 46.3 ms | 153.3 ms | 1,757,149 bytes |
| Step 8 | 160 MB | **34.4 ms** | **35.6 ms** | **956,545 bytes** |
| The Rust core | 1.8 MB | 4.7 ms | 4.9 ms | 132,561 bytes |

The module is 79.2% smaller than the module the fork shipped, and it is below
the 1 MB that section 10 of the plan gives as the target. The time from the run
message to the end of a small program falls from 153 ms to 36 ms.

Against the projection of section 10 of the plan:

| Milestone | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| After step 2, projected | 121.2 | 51.7 | 173.9 |
| After step 2, measured | 136.1 | 90.1 | 180.2 |
| After step 4, projected | 134–179 | 173–192 | 195–196 |
| After step 4, measured | 133.3 | 122.0 | 140.8 |
| After step 8, projected | ~248 | ~240 | ~220 |
| After step 8, measured | 235.3 | 217.4 | 227.3 |
| The Rust target of the report | 222.5 | 188.5 | 244.5 |

The end state is 95%, 91% and 103% of the projection, and 106%, 115% and 93%
of the Rust figures that the report measured. Steps 2 and 8 were the two speed
steps that carried the plan; step 4 helped `memcpy` only. The two facts that
kept the middle of the plan below its projection are recorded above:

1. The rebuild of step 3 is slower than the module the fork shipped on
   `memcpy` (−14%) and on `mixed` (−21%). The toolchain that made the shipped
   module is not known and cannot be found.
2. The estimate for `-DFAST_SLOPPY` on `memcpy` came from a native figure that
   does not reproduce. The measured native ratio on this machine is 2.27x and
   not 3.35x.

### What a later reader should know

- **Compare a step against the session before it.** The baseline moved at step
  3, and the machine drifts between sessions by a few per cent. Every session
  has the Rust core in it as the live control for this reason. The step 8
  section shows the method: it re-measured the step 7 module in the same window
  (`results/step-8-control-step-7.json`) instead of using the figures of the
  morning.
- **The module size is not the startup cost.** Steps 6, 7 and 8 measured it
  three times. The fetch, the compile and the instantiation of the module is
  about 5 ms of the 34 ms to the first instruction, and a module that is half
  the size makes that part about 1 ms shorter. What is left is the zeroing of
  the 128 MB guest memory (about 15 ms, and step 5 shows why it cannot go down)
  and the instruction table, the CSRs, the 128K-entry decode cache and the
  program load.
- **The 64 MB reservation target of the plan is closed, not reached.** The
  stack pointer of the application (`0x7FFFFFC`) pins the guest memory at
  128 MB, and that stack pointer is in every saved project link. The step 5
  section holds the audit.
- **Boost.program_options is 181 KB and RISC-V ALE does not need a parser.**
  The worker sends a fixed argument list. After step 8 it is one of the largest
  items in a 956 KB module, and no step of this plan takes it. A later plan
  can.
- **Do not remove `-sBINARYEN_EXTRA_PASSES=-ocimfs=1`.** Step 8 removed
  Asyncify, which makes `Hart::execute` smaller, and a later reader could
  believe the option is no longer necessary. The option controls a rule that
  has nothing to do with Asyncify: without it, Binaryen puts all 482 handlers
  inside `execute` and the module is twelve times slower. The step 3 section
  holds the measurements.
- **The worker and the module are a pair.** A module without Asyncify needs a
  worker that calls `_ale_run_slice`. The three workers of this branch test for
  that export and fall back to the old model, so `ASYNCIFY=1` gives a working
  application again, but a worker from before step 8 cannot run the module of
  step 8.
- **The frequency control of the application is in the worker now.** The budget
  of a slice and the delay between two slices come from
  `simulator_int_inst_delay` and `simulator_sleep[0]`, which are what the
  `int_freq_range` slider sets. A change to the slice policy changes the
  simulated clock of every program of RISC-V ALE. The step 8 section holds the
  numbers.
