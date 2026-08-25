# Plan: Optimize The C++ Core (whisper) To Match The Rust Core

NOTE: This plan uses the ASD-STE100 (Simplified Technical English) writing
rules. Code identifiers, file names, metric names and command options are
technical names. They stay in their original form.

## 1. Objective

The report `local/rs-cpp.md` measured the two simulator cores in the browser.
The Rust core was 6.4 to 8.7 times as fast as the C++ core in the
configuration that RISC-V ALE shipped. The report also found the cause. Most
of the gap comes from the configuration and from the delivery, and not from
the quality of the C++ interpreter.

This plan applies that finding. It changes the C++ core, one step at a time,
until its browser throughput is close to the Rust core throughput. The report
projects that the end state reaches 89% to 126% of the Rust figures
(`local/rs-cpp.md`, section 14.5, scenario B).

The target figures are the Rust core figures from the report
(browser, median of 5, MIPS):

| Workload | Target (Rust core) |
| --- | --- |
| `alu` | 222.5 |
| `memcpy` | 188.5 |
| `mixed` | 244.5 |

## 2. Rules

These rules apply to all work under this plan.

1. **The base.** All work starts from commit
   `3ce049cad57f581a965eda4d945c962c11e0e03c`. This is the last commit of the
   original fork. It is also the last commit where whisper was the simulator
   core of RISC-V ALE.
2. **The branch.** All work goes on the branch `optimize-whisper`. The branch
   starts at the base commit. This plan document is the first commit on the
   branch.
3. **The harness.** The branch must carry the same benchmark harness that
   produced the figures in `local/rs-cpp.md`. The harness measures both cores,
   so every result is directly comparable to that report and to the Rust core.
   Step 1 adds the harness. No later step is permitted to change how the
   harness measures. A later step is permitted to increase the number of
   repetitions.
4. **The order.** The steps go from the least code changes to the most code
   changes.
5. **Measure between steps.** After each step, run the full benchmark on both
   cores. Compare the measured result against the estimated speedup of that
   step. Record the comparison before the next step starts.
6. **One commit per step.** Each step is exactly one commit. The commit
   contains the change and the measured results of rule 5. Write the results
   table into the commit message.
7. **Same machine.** All figures in one comparison must come from the same
   machine and the same browser build. Do not compare a new measurement
   against an old one from a different machine or browser. The Rust core runs
   in every benchmark session as the live control, so the target moves with
   the machine.
8. **Functional gate.** A step is complete only when the functional checks of
   section 7 pass. A step that fails its functional gate does not get a
   commit.
9. **No unexplained result.** When a measured result misses its estimate, the
   decision rules of section 8 apply before the next step starts.

## 3. References

| Item | Value |
| --- | --- |
| Base commit | `3ce049cad57f581a965eda4d945c962c11e0e03c` |
| Fork commit with the report and the fixtures | `3fe0c5588589b2d3978f059346b2cd63c2dad5f5` (main) |
| The report | `local/rs-cpp.md` at the fork commit |
| C++ source (SweRV-ISS) | `https://github.com/antoniocgj/SweRV-ISS-1.git` at `b4a81080604a729db22a23a8a47b7bcafc3db731` (the commit that `crates/riscv-rs/SweRV-ISS-1` pins on main) |
| Rust core module (control fixture) | `modules/pkg/riscv_rs.js` and `modules/pkg/riscv_rs_bg.wasm` from main, 132,561 bytes for the `.wasm` file |
| Shipped C++ module (the baseline) | `modules/whisper.js` and `modules/whisper.wasm` at the base commit, 4,608,325 bytes for the `.wasm` file |
| Old worker configuration | `modules/simulator_worker.js` line 297: `["--newlib", "/working/ex2", "--isa", "acdfimsu", "--setreg", "sp=0x10000"]` |
| Build flags today | `GNUmakefile` line 79: `-O3 -fno-builtin -D__EMSCRIPTEN__ -DDISABLE_EXCEPTIONS -s TOTAL_MEMORY=268435456 -s ASYNCIFY` |

## 4. Prerequisites

Install these tools before step 1. Record the exact versions in
`scripts/perf-core/README.md`.

1. **Node.js and Playwright Chromium.** The harness serves the files and
   drives the browser. `scripts/perf/http_server.cjs`, `browser.cjs` and
   `cdp_client.cjs` on main already do these jobs. Copy them.
2. **The Emscripten SDK (`emsdk`).** Steps 3 to 8 rebuild `whisper.wasm`.
   Record the SDK version. The version that built the shipped module is not
   known, so step 3 exists to control for the toolchain.
3. **A native C++ toolchain.** The harness validates each ELF workload against
   the native whisper oracle before the browser run.

## 5. The benchmark harness (step 1)

The harness is the one that section 13 of `local/rs-cpp.md` describes. It is
not in the repository, so step 1 rebuilds it from that description and puts it
in `scripts/perf-core/` on this branch.

The harness has these properties. They come from sections 3 and 13 of the
report, and they must not change:

- Three RV32 workloads: `alu`, `memcpy` and `mixed`. Each retires an exactly
  known instruction count near 20 million (20,000,005 for `alu`, 20,000,009
  for `memcpy`, 20,000,003 for `mixed`). A generator writes each workload as a
  minimal ELF32 file. The instruction encoders come from
  `crates/riscv-rs/benches/throughput_benchmarks.rs` on main.
- Each core runs in a dedicated classic worker in headless Chromium. The
  section 13 of the report lists the globals that each worker must define.
- The C++ figure comes from the `Retired N instructions in X.XXs Y inst/s`
  line that the core prints. The Rust figure comes from `performance.now()`
  around one `run_slice(0xFFFFFFFF)` call.
- Interrupts are off in both cores.
- The C++ module is one-shot. The harness starts a new worker for each
  repetition.
- Five repetitions per core, per workload, per configuration. Report the
  median and the best.
- The Rust core module is a fixture. Copy `modules/pkg/riscv_rs.js` and
  `modules/pkg/riscv_rs_bg.wasm` from main into
  `scripts/perf-core/fixtures/`. Confirm the `.wasm` file is 132,561 bytes.
  This is the same module that the report measured, so the control is exact.

**Validation gates for step 1:**

1. The native oracle and both browser cores retire the exact instruction
   counts above, on all three workloads.
2. The C++ core with `--isa acdfimsu` and the Rust core give figures that
   agree with section 4.1 of the report, within the tolerance of section 8 of
   this plan. This agreement is the proof that the results are directly
   comparable to the report.

## 6. The steps

The table gives the overview. The subsections give the details. The estimated
speedups are per step, against the figures of the step before.

| Step | Change | Code changed | Estimated speedup (`alu` / `memcpy` / `mixed`) |
| --- | --- | --- | --- |
| 1 | Add the benchmark harness | None (new files only) | None. This step sets the baseline. |
| 2 | ISA string `acdfimsu` to `acdfim` | 1 line | 3.46x / 2.07x / 6.17x |
| 3 | Rebuild `whisper.wasm`, flags unchanged | None (build only) | 1.00x (control) |
| 4 | Add `-DFAST_SLOPPY` | 1 build flag | 1.11x / 3.35x / 1.12x |
| 5 | Size the linear memory | 1 to 2 build flags | 1.00x (footprint step) |
| 6 | Trim the source list | Build list, guards | 1.00x (size step) |
| 7 | RV32-only build | Many small edits | 1.00x (size step) |
| 8 | Remove Asyncify | Run loop redesign | 1.12x to 1.39x |

### Step 1: Add the benchmark harness

- **Change.** Add `scripts/perf-core/` with the generator, the two workers,
  the page, the driver and the Rust fixtures. Section 5 gives the content.
- **Estimate.** No speedup. The step produces the baseline table. Expected
  baseline, from section 4.1 of the report: `alu` 35.0, `memcpy` 25.0,
  `mixed` 28.2 MIPS for the C++ core as shipped; `alu` 222.5, `memcpy` 188.5,
  `mixed` 244.5 MIPS for the Rust control.
- **Gate.** The two validation gates of section 5.
- **Commit.** `perf(whisper): add the core benchmark harness`.

### Step 2: Change the ISA string

- **Change.** In `modules/simulator_worker.js`, change `--isa acdfimsu` to
  `--isa acdfim`. One line. No rebuild.
- **Why.** Section 9 of the report. The `s` in the ISA string makes `isRvs()`
  true, which forces the slow `runUntilAddress` loop. Without `s` and `u`, the
  core selects its own fast loop (`simpleRun`).
- **Estimate.** 3.46x on `alu`, 2.07x on `memcpy`, 6.17x on `mixed`. This
  estimate is strong, because section 4.1 of the report measured both ISA
  strings in the browser on the same shipped module. Expected absolute
  figures: `alu` 121.2, `memcpy` 51.7, `mixed` 173.9 MIPS.
- **Risk.** The change removes supervisor mode and user mode. RISC-V ALE runs
  machine mode only, so no guest program uses them. A guest that touches an
  `s` CSR gets an illegal-instruction trap after this change. The functional
  checks of section 7 must pass.
- **Commit.** `perf(whisper): run machine mode only (--isa acdfim)`.

### Step 3: Rebuild whisper with unchanged flags (control)

- **Change.** Build `whisper.js` and `whisper.wasm` from the SweRV-ISS source
  (the pinned commit of section 3) with the flags the `GNUmakefile` already
  has. Replace the two files in `modules/`. Add a build script and a
  `README.md` that records the SDK version and the exact commands. No source
  change.
- **Why.** The shipped module is a prebuilt artifact from an unknown SDK. All
  later steps need a rebuild. This step proves that a rebuild alone does not
  move the figures. Without it, no later step can attribute its delta.
- **Estimate.** 1.00x. The gate is agreement with step 2 within tolerance.
- **Risk.** A new SDK can change the figures in either direction. If it does,
  record the new figures as the new baseline for steps 4 to 8, and record the
  delta in the commit message.
- **Commit.** `build(whisper): rebuild from source with unchanged flags`.

### Step 4: Add -DFAST_SLOPPY

- **Change.** Add `-DFAST_SLOPPY` to `OFLAGS` in the `GNUmakefile`. Rebuild.
  One flag.
- **Why.** Section 14.2 of the report. The flag replaces `Hart::load` with
  `Hart::fastLoad` and removes the attribute lookup, the triggers, the load
  queue, the stack check, the CLINT test and the console-io test from every
  load and store. It keeps the memory bound test and the `jsReadMMIO` /
  `jsWriteMMIO` hook, so the RISC-V ALE devices continue to work.
- **Estimate.** 1.11x on `alu`, 3.35x on `memcpy`, 1.12x on `mixed`. The
  multipliers come from the native measurement in section 14.2. The report
  also projects absolute browser figures (section 14.5, scenario A): `alu`
  179, `memcpy` 192, `mixed` 196 MIPS. The multiplier method and the
  projection method disagree on `alu` (134 against 179). Treat the two values
  as the low and the high edge of the estimate.
- **Risk.** The flag removes function: misaligned-access exceptions, triggers,
  the load queue, the CLINT and the console-io path. This is a change in
  behaviour. The functional checks of section 7 must pass, and the optional
  differential check of section 7 is strongly recommended for this step.
- **Commit.** `perf(whisper): build with -DFAST_SLOPPY`.

### Step 5: Size the linear memory

- **Change.** Find the highest guest address that the RISC-V ALE toolchain,
  the syscalls and the stack use. Set the whisper guest memory size and the
  Emscripten `TOTAL_MEMORY` to the smallest safe values. Rebuild. The MMIO
  window at `0xffff0000` goes through the JavaScript hook, not through the
  buffer, so it does not constrain the size.
- **Why.** Section 6.3 of the report. The module reserves 256 MB at start in
  every case. The Rust core allocates a few hundred kilobytes for the same
  programs. The reservation also adds to the startup time (section 15.3).
- **Estimate.** 1.00x on throughput. The metrics for this step are the memory
  reservation (target: 64 MB or less) and the time to the first instruction.
- **Risk.** A guest address above the new bound fails. The audit must cover
  the linker script, the heap growth of `--newlib` programs and the `sp`
  start value.
- **Commit.** `perf(whisper): reduce the linear memory reservation`.

### Step 6: Trim the source list

- **Change.** Remove from the build the subsystems that RISC-V ALE never
  uses: the GDB stub, the socket server, the interactive shell, snapshots,
  and, where the decode table permits a clean guard, the vector extension and
  the bit-manipulation extension. This needs `GNUmakefile` edits and `#ifdef`
  guards or stubs at the call sites in `whisper.cpp` and `Hart.cpp`.
- **Why.** Section 15.5 of the report. About 45% of the object bytes are not
  reachable for RV32IMAFDC in machine mode. This is a size and startup win.
- **Estimate.** 1.00x on throughput (sections 14.3 and 14.6 of the report
  show that the footprint does not drive these workloads). The metrics for
  this step are the raw and compressed module sizes and the time to the first
  instruction.
- **Commit.** `build(whisper): remove the subsystems that ALE does not use`.

### Step 7: RV32-only build

- **Change.** Remove the `uint64_t` explicit template instantiation at the end
  of each `.cpp` file, and the `--xlen 64` path in `whisper.cpp` that needs
  it. The edits are small and mechanical, but they touch many files.
- **Why.** Section 15.5 of the report. Every template is instantiated two
  times, and RISC-V ALE runs RV32 only.
- **Estimate.** 1.00x on throughput. The metrics are the module sizes and the
  time to the first instruction. The combined target for steps 6 and 7 is a
  raw module near 1 MB to 1.5 MB before step 8 (section 15.5).
- **Commit.** `build(whisper): instantiate for RV32 only`.

### Step 8: Remove Asyncify

- **Change.** This is the largest step. Give the C++ run loop an instruction
  budget and a plain return, in the same shape as the Rust `run_slice`:
  1. Restructure `main` so the module loads, initializes and then waits.
     Export a run-slice function that the worker calls with `ccall`. The
     module stops being one-shot.
  2. Replace the `emscripten_sleep` yield in the run loop (`Hart.cpp:4613`)
     with the budget-and-return model.
  3. Make the stdin read non-blocking. Today `Syscall.cpp:926` loops around
     `emscripten_sleep(10)`.
  4. Drive the slices from the worker with a `setTimeout` chain. The model is
     `modules/simulator_worker.js` on main (the Rust worker), which tunes the
     budget so each slice lands between 8 ms and 16 ms.
  5. Remove `-s ASYNCIFY` from the compile flags and the link flags. Rebuild.
- **Why.** Section 8 of the report. Asyncify instruments every function that
  can reach a sleep, and the core pays that cost on every instruction. The
  Rust core keeps about 69% of its native speed in the browser; the C++ core
  keeps about 55% (section 14.4). The difference is the delivery cost.
- **Estimate.** 1.12x to 1.39x, per workload, from the ratio change 0.55 to
  0.69. The report projects the absolute end state (section 14.5, scenario
  B): `alu` 248, `memcpy` 240, `mixed` 220 MIPS. That is 111%, 126% and 89%
  of the Rust targets. Asyncify removal also cuts the module size roughly in
  half (section 14.6).
- **Risk.** This is a design change, not a flag. Interrupt delivery, stdin,
  and the syscall path all cross the yield model. The functional checks of
  section 7 must pass with interrupts on.
- **Commit.** `perf(whisper): replace Asyncify with a budget-and-return run loop`.

## 7. Functional checks (the gate of rule 8)

Run these checks after every step, before the commit:

1. **Retired counts.** The three harness workloads run to completion on the
   C++ core, and the retired instruction counts are exact (section 5).
2. **The application.** RISC-V ALE loads in the browser at the branch state.
   A hello-world program with `--newlib` syscalls compiles, runs and writes
   to the terminal.
3. **MMIO.** One extension device works through `jsReadMMIO` and
   `jsWriteMMIO`.
4. **Interrupts.** With interrupts on (the normal application mode, not the
   benchmark mode), a program that waits for input receives it. For steps 1
   to 7 this exercises the `emscripten_sleep` path. For step 8 it exercises
   the new yield model.
5. **Differential check (optional, recommended for steps 4 and 8).** Build
   the modified whisper natively. Run the differential harness of the fork
   (`crates/riscv-rs/tests/differential_harness.rs` on main) with the
   modified binary as the oracle. A mismatch shows where the step changed
   behaviour, because the Rust core agrees with the unmodified whisper.

## 8. Measurement procedure and tolerance

Between each step:

1. Run the harness: both cores, all three workloads, five repetitions.
2. Record the median and the best for each cell.
3. Compute the per-workload speedup against the recorded figures of the step
   before, on the same machine and browser.
4. Compare the speedup against the estimate of section 6. Write the table
   with measured and estimated values into the commit message.

**Tolerance.** The C++ core measures itself with `gettimeofday`, and its
samples spread (section 12 of the report; the `alu` medians and bests differ
by up to 33%). Therefore:

- Two figures agree when their medians are within 15% of each other.
- When a comparison sits near the 15% edge, raise the repetitions to 10 and
  compare the new medians. Do not change anything else in the harness.

## 9. Decision rules (the rule of section 2, item 9)

- **A speed step (2, 4, 8) delivers less than half of its estimated gain on
  any workload.** Stop. Find the cause. Record the finding in the commit
  message or in a note in `scripts/perf-core/results/`. Decide with the
  finding in hand: keep the step, change the step, or drop the step. Do not
  start the next step first.
- **Any step regresses any workload by more than the 15% tolerance.** The
  step does not get a commit until the regression is explained and either
  fixed or accepted in writing.
- **A functional check fails.** The step does not get a commit. Fix or drop
  the step.

## 10. Projected end state

These projections come from the report. They are projections, not promises.
Section 14.6 of the report gives their limits.

| Milestone | `alu` | `memcpy` | `mixed` | Basis |
| --- | --- | --- | --- | --- |
| Baseline (step 1) | 35.0 | 25.0 | 28.2 | Measured, report section 4.1 |
| After step 2 | 121.2 | 51.7 | 173.9 | Measured, report section 4.1 |
| After step 4 | 134–179 | 173–192 | 195–196 | Projected, report sections 14.2 and 14.5 |
| After step 8 | ~248 | ~240 | ~220 | Projected, report section 14.5, scenario B |
| Rust target | 222.5 | 188.5 | 244.5 | Measured, report section 4.1 |

Secondary metrics at the end state: a raw module below about 1 MB after steps
6, 7 and 8 (against 4,608,325 bytes today), and a linear memory reservation
of 64 MB or less (against 256 MB today).

## 11. Limits of this plan

- **The estimates for steps 4 and 8 are projections.** They come from native
  measurements and a native-to-WebAssembly transfer ratio, not from browser
  measurements. Treat them as an order of magnitude. Rule 5 exists because of
  this.
- **The workloads are tight loops.** They are the best case for the decode
  cache and the branch predictor. Real programs will show smaller gains.
- **The toolchain is not the shipped toolchain.** Step 3 controls for this,
  but it can move the baseline.
- **Steps 5, 6 and 7 do not target throughput.** They exist because the
  report shows that size, startup and footprint are part of the gap. If only
  throughput matters, steps 5 to 7 can move after step 8 or out of scope. The
  order rule (least to most code changes) keeps them where they are.
