# Progress: Optimize The C++ Core (whisper)

NOTE: This document uses the ASD-STE100 (Simplified Technical English) writing
rules. Code identifiers, file names, metric names and command options are
technical names. They stay in their original form.

This document records the work of `local/optimize-whisper.md`. It gives the
result of each step, the comparison against the estimate of that step, and
each finding that a later step must know.

The instruction is to do the steps 1 to 4 and then to stop.

## Status

| Step | State | Result |
| --- | --- | --- |
| 1. Add the benchmark harness | Complete | Baseline measured. Four of the six cells of gate 2 agree with the report. |
| 2. Change the ISA string | Complete | 3.80x / 2.81x / 5.11x against an estimate of 3.46x / 2.07x / 6.17x |
| 3. Rebuild with unchanged flags | **Blocked** | The rebuild is 12 times slower than the shipped module. The cause is known. The step is not applied. |
| 4. Add `-DFAST_SLOPPY` | **Blocked** | It needs the rebuild of step 3. |

Steps 3 to 8 all need a rebuild, so the plan cannot continue until the problem
of step 3 has a solution. The step 3 section names the solution that the
evidence points to: replace the computed goto in `Hart::execute` with a
`switch`.

The application is at the end state of step 2. `modules/whisper.js` and
`modules/whisper.wasm` are the files that RISC-V ALE shipped.

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
cd $HOME/emsdk && ./emsdk install latest && ./emsdk activate latest
```

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

## Step 3: Rebuild whisper with unchanged flags — BLOCKED

**State: not applied. The step fails its gate. `modules/whisper.js` and
`modules/whisper.wasm` are back at the module that RISC-V ALE shipped.**

Rule 8 of the plan says that a step which fails its gate does not get a
commit, and the decision rules of section 9 say that a regression larger than
the tolerance must be explained and then fixed or accepted in writing. This
section is that explanation. Step 4 needs a rebuild, so step 4 is blocked with
step 3.

### What the step did

`scripts/build-whisper/build.sh` builds `whisper.js` and `whisper.wasm` from
the SweRV-ISS source at the pinned commit
`b4a81080604a729db22a23a8a47b7bcafc3db731`, with the flags of line 79 of the
GNUmakefile and nothing more. `scripts/build-whisper/README.md` records the
SDK version, the prerequisites and the exact commands.

The script keeps the flags in the repository and not in the GNUmakefile. The
GNUmakefile is in a submodule of the `riscv-rs` crate that this branch does not
track, so a change there would not be in any commit of this repository and a
later reader could not know which flags made a module. The compile flags are
the same; `EXTRA_FLAGS` adds to them, and nothing removes from them.

Two groups of options make the 2021 source build with a 2026 SDK. Neither
changes what the program does:

1. `-include cstdint -include optional -include limits` and three `-Wno-`
   options. The differential harness uses the same options for the native
   oracle.
2. `-sEXPORTED_RUNTIME_METHODS` with `FS`, `WORKERFS`, `writeArrayToMemory`,
   `lengthBytesUTF8`, `stringToUTF8` and `callMain`. An Emscripten of 2021 put
   every runtime method on the module. A modern one exports nothing unless it
   is asked, and the RISC-V ALE worker and the `EM_JS` shims need these six.

### The result: a 12-times regression

Session `step-3-rebuild`, median of 5, MIPS:

| Configuration | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Rust (the control) | 212.3 | 200.0 | 260.8 |
| C++ `--isa acdfimsu` | 10.1 | 9.9 | 10.1 |
| C++ `--isa acdfim` | 11.2 | 10.7 | 11.0 |

Against step 2 (136.1 / 90.1 / 180.2 with `--isa acdfim`) this is 0.08x, 0.12x
and 0.06x. The estimate was 1.00x. The effect of the ISA string also
disappeared, which is the first sign that something dominates every other
cost.

The functional gate passes on the rebuilt module. All three checks give the
correct output. The module is correct; it is only slow.

### What the regression is not

Each line is a measurement. All figures are browser figures, `--isa acdfim`,
MIPS, on the same machine.

| Build | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| The module RISC-V ALE shipped | 126.6 | 75.2 | 129.9 |
| Rebuild, Emscripten 6.0.8 | 11.8 | 10.8 | 11.7 |
| Rebuild, Emscripten 3.1.74 | 10.8 | 10.8 | 11.0 |
| Rebuild, Emscripten 2.0.34 (the period of the shipped module) | 10.7 | 10.7 | 10.9 |
| Rebuild 2.0.34, plus `-DFAST_SLOPPY` | 12.5 | 12.4 | 12.7 |
| Rebuild 2.0.34, compiled with `-O2` | 10.5 | — | — |
| Rebuild, linked with `-O2` | 10.0 | — | — |
| Rebuild 6.0.8, `-sASYNCIFY_IGNORE_INDIRECT=1` | 43.0 | 39.8 | 44.8 |
| Rebuild 6.0.8, no `-s ASYNCIFY` | 58.7 | 50.9 | 60.2 |
| Rebuild 2.0.34, no `-s ASYNCIFY` | 53.2 | — | — |

- **It is not the SDK version.** Three SDKs, from 2021, 2024 and 2026, give
  the same figure.
- **It is not `-DFAST_SLOPPY`,** so the shipped module was not built with that
  flag.
- **It is not the optimization level,** at compile or at link.
- **Asyncify makes it worse by about five times, but it is not the cause.**
  Even with no Asyncify at all, the rebuild reaches 53 to 59 MIPS against the
  126.6 MIPS of the shipped module, which carries Asyncify.
- **It is not a measurement artefact.** The wall-clock time from the first
  line of the worker to the printed figure is 1.83 s for the rebuild and
  0.21 s for the shipped module, for the same 20,000,005 instructions.
- **It is not the V8 tier.** With `--js-flags=--liftoff-only`, which stops V8
  from ever using its optimizing tier, the shipped module falls from 119 to
  106 MIPS and the rebuild does not move at all (10.2 against 10.3). The
  rebuild already runs in the baseline tier and never leaves it.

### What the regression is

The rebuilt module contains two enormous functions that the shipped module
does not have. A build with `--profiling-funcs` gives their names:

| Function | Rebuild | Shipped |
| --- | --- | --- |
| `Hart<unsigned long long>::execute` | 713,039 bytes | — |
| `Hart<unsigned int>::execute` | 694,014 bytes | — |
| Largest function of any name | 713,039 bytes | 231,569 bytes |
| Functions in the module | 2,259 | 5,122 |
| Share of the code in the 10 largest functions | 60% | 17% |

`Hart::execute` is the instruction dispatcher. Its source uses a GNU computed
goto over an array of about 500 label addresses, and the comment in the source
says that a table of methods "would cost 20% more in execution time". That
comment describes a native build.

WebAssembly has no indirect branch instruction, so LLVM must remove the
irreducible control flow that a computed goto makes. Every LLVM available
today does this in a way that makes the function 9 times as large as it is in
the shipped module. V8 does not apply its optimizing tier to a function of
that size, which the `--liftoff-only` measurement above confirms. The result
is an interpreter that runs its whole inner loop in the baseline tier.

Inlining is only a small part of it. With `-fno-inline` the function falls
from 694 KB to 464 KB and the speed rises from 11.8 to 21.9 MIPS, and the
module gets 1,008 more functions, which is about the number of instruction
handlers. The remaining 464 KB is the lowered computed goto itself.

The shipped module has 2,863 more functions than the rebuild and its largest
function is 231,569 bytes. Its `execute` is one of the pair near 75 KB. The
compiler that made it did not expand the computed goto.

### The conclusion

**The module that RISC-V ALE shipped cannot be reproduced from the pinned
source with the recorded flags by any Emscripten SDK that is available today.**
Section 12 of `local/rs-cpp.md` already recorded the risk: "The C++ module is a
prebuilt artifact. I did not rebuild it, so I cannot confirm that the flags in
`GNUmakefile` are the flags that produced it." This step is the confirmation
that they are not sufficient, and it also shows that no SDK choice repairs it.

Steps 3 to 8 of the plan all need a rebuild. They are therefore blocked until
the dispatcher problem has a solution.

### What can unblock it

The recommended next step is a **source change to `Hart::execute`**: replace
the computed goto with a `switch` that calls the handler functions. The source
comment says this costs 20% natively. In WebAssembly it should cost much less
than the 12 times it costs now, because the function would become a jump table
of calls instead of a 700 KB block that V8 leaves in the baseline tier. This
is a new step, and it must come before the present step 3.

Two smaller measures are known to help, and they are not sufficient on their
own:

- `-fno-inline`, which takes the rebuild from 11.8 to 21.9 MIPS on `alu`.
- Removing Asyncify, which takes it from 11.8 to 58.7 MIPS on `alu`. Step 8 of
  the plan already does this, so its estimate of 1.12x to 1.39x is much too
  low for a rebuilt module.

### Functional checks

| Check | Result |
| --- | --- |
| 1. Retired counts | PASS. Exact on all three workloads. |
| 2. The application | PASS |
| 3. MMIO | PASS |
| 4. Interrupts | PASS |

The gate passes, but rule 9 stops the step. A step is not complete when it
regresses a workload by more than the tolerance, and this one regresses every
workload by about 12 times.

### Commit

No commit applies the step. The build script, its README and this analysis are
in `build(whisper): add the build script and record why the rebuild is slow`.
`modules/whisper.js` and `modules/whisper.wasm` stay at the module that
RISC-V ALE shipped.

## Step 4: Add -DFAST_SLOPPY — BLOCKED

**State: not applied. Step 4 needs the rebuild of step 3.**

The flag was measured during the analysis of step 3, on the rebuilt module
with Emscripten 2.0.34 (browser, `--isa acdfim`, MIPS):

| Build | `alu` | `memcpy` | `mixed` |
| --- | --- | --- | --- |
| Rebuild | 10.7 | 10.7 | 10.9 |
| Rebuild plus `-DFAST_SLOPPY` | 12.5 | 12.4 | 12.7 |

That is 1.17x, 1.16x and 1.17x. The plan estimates 1.11x, 3.35x and 1.12x.
The `memcpy` figure is far below its estimate, but this measurement proves
nothing about the flag: the dispatcher problem of step 3 dominates every other
cost in this module, and it removes the difference between the workloads. The
step must be measured again after step 3 works.

`-DFAST_SLOPPY` compiles without error and the module is correct: the three
functional checks pass with it.

