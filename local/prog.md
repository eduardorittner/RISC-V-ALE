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

## Where the plan stands

Median of 5, MIPS, with `--isa acdfim`, which is what the application uses
after step 2. The Rust column is the live control of each session.

| Milestone | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Step 1, the module as shipped (`--isa acdfimsu`) | 35.8 | 31.6 | 35.3 |
| Step 2, machine mode only | 136.1 | 90.1 | 180.2 |
| Step 3, rebuilt from source | 133.3 | 77.8 | 141.8 |
| Step 4, plus `-DFAST_SLOPPY` | 133.3 | 122.0 | 140.8 |
| Step 5, a 160 MB linear memory | 131.6 | 122.0 | 140.8 |
| The Rust control, step 5 session | 211.4 | 207.3 | 263.9 |
| Share of the control | 62% | 59% | 53% |

The secondary metrics, which steps 5, 6 and 7 target:

| Milestone | Reservation | To the first instruction | `whisper.wasm` |
| --- | --- | --- | --- |
| Step 4 | 256 MB | 46.2 ms | 4,095,232 bytes |
| Step 5 | 160 MB | 47.0 ms | 4,095,232 bytes |
| The Rust core | 1.8 MB | 6.5 ms | 132,561 bytes |

Against the projection of section 10 of the plan:

| Milestone | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| After step 2, projected | 121.2 | 51.7 | 173.9 |
| After step 2, measured | 136.1 | 90.1 | 180.2 |
| After step 4, projected | 134–179 | 173–192 | 195–196 |
| After step 4, measured | 133.3 | 122.0 | 140.8 |

Step 2 was better than its projection on all three workloads. Step 4 is at the
low edge of the `alu` projection and below the `memcpy` and `mixed`
projections. Two measured facts explain the difference, and both are recorded
above:

1. The rebuild of step 3 is slower than the module the fork shipped on
   `memcpy` (−14%) and on `mixed` (−21%). The toolchain that made the shipped
   module is not known and cannot be found.
2. The estimate for `-DFAST_SLOPPY` on `memcpy` came from a native figure that
   does not reproduce. The measured native ratio on this machine is 2.27x and
   not 3.35x.

The total against the state RISC-V ALE shipped is 3.7x on `alu`, 3.9x on
`memcpy` and 4.0x on `mixed`.

### What the next steps should know

- **The baseline moved at step 3.** Compare a step against the session before
  it, and not against step 2.
- **Steps 6 and 7 do not target throughput.** Their metrics are the module
  size, the memory reservation and the time to the first instruction.
  `scripts/perf-core/startup/` reports all three.
- **The module size is the startup cost that is left.** Step 5 measured it: of
  the 47 ms to the first instruction, 15 ms is the 128 MB guest memory (which
  cannot go down) and about 32 ms is the fetch, the compile and the
  instantiation of a 4 MB module. The Rust core needs 6 ms for a 129 KB module.
- **The 64 MB reservation target of the plan is closed, not reached.** The
  stack pointer of the application (`0x7FFFFFC`) pins the guest memory at
  128 MB, and that stack pointer is in every saved project link. The step 5
  section holds the audit.
- **The estimate for step 8 is too low.** The plan projects 1.12x to 1.39x
  from the ratio change 0.55 to 0.69. A direct measurement during the work on
  step 3 gives a much larger figure: with the same objects, a module without
  `-s ASYNCIFY` reached 58.7 MIPS where the module with it reached 11.8 MIPS.
  That measurement was made before the repair of step 3, so it is not a
  prediction of the gain from the present state, but it does show that
  Asyncify costs far more than the plan assumes. Measure it again after
  step 8.
- **Do not remove `-sBINARYEN_EXTRA_PASSES=-ocimfs=1`.** Step 8 removes
  Asyncify, which makes `Hart::execute` smaller, and a later reader could
  believe the option is no longer necessary. The option controls a rule that
  has nothing to do with Asyncify.
