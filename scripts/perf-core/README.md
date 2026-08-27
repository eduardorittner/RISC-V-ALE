# The core benchmark harness

NOTE: This document uses the ASD-STE100 (Simplified Technical English) writing
rules. Code identifiers, file names, metric names and command options are
technical names. They stay in their original form.

This directory holds the harness of `local/optimize-whisper.md`, step 1. It
measures the two simulator cores of RISC-V ALE as WebAssembly in a browser,
which is the only place where the speed matters.

The harness is a reconstruction of the harness that made the figures in
`local/rs-cpp.md`. Section 13 of that report describes it. The report itself
does not contain the code.

## What it measures

| Item | Value |
| --- | --- |
| Workloads | `alu`, `memcpy` and `mixed`, each near 20 million retired instructions |
| Cores | The Rust core (`riscv-rs`) and the C++ core (whisper) |
| Configurations | Rust, C++ `--isa acdfimsu` and C++ `--isa acdfim` |
| Browser | Headless Chromium, one dedicated classic worker for each core |
| C++ figure | The `Retired N instructions in X.XXs Y inst/s` line that the core prints |
| Rust figure | `performance.now()` around one `run_slice(0xFFFFFFFF)` call |
| Interrupts | Off in both cores |
| Repetitions | 5 for each core, workload and configuration. The report gives the median and the best. |

The Rust module is a **fixture** in `fixtures/`. It is the same module that
the report measured (`riscv_rs_bg.wasm`, 132,561 bytes), so it is the live
control in every session: the target moves with the machine.

The C++ module comes from `modules/whisper.js` and `modules/whisper.wasm` at
each run. Each step of the plan therefore measures the module that the branch
carries.

## Files

| File | Function |
| --- | --- |
| `riscv_asm.cjs` | A small RV32 assembler and ELF32 writer, shared by the two generators |
| `gen_workloads.cjs` | Writes the three ELF32 workloads and `workloads/manifest.json` |
| `validate_native.cjs` | Runs the native whisper oracle on each workload and checks the retired counts |
| `checks/` | The functional gate of section 7 of the plan |
| `startup/` | The startup and footprint metric of steps 5, 6 and 7 of the plan |
| `startup/wasm_sizes.cjs` | What is big inside a `.wasm` module: the code section, the function count, the largest function and, with a symbol map, the size of each subsystem |
| `startup/run_phases.cjs` | The phase metric of `local/36ms.md`: it divides the core startup into the phases of the whisper startup. It needs a module that `-DALE_TIME_STARTUP` built. |
| `run.cjs` | The driver. Serves the page, drives Chromium and writes the results |
| `page/index.html` | The page. It gives the driver a `runOne()` function |
| `page/worker_cpp.js` | The C++ core in a worker |
| `page/worker_rust.js` | The Rust core in a worker |
| `http_server.cjs` | A static file server. It sends `Cache-Control: no-store` |
| `browser.cjs` | Starts headless Chromium |
| `cdp_client.cjs` | Talks to Chromium with the DevTools protocol |
| `fixtures/` | The Rust module, frozen as the control |
| `workloads/` | The generated ELF32 files |
| `results/` | One JSON file and one Markdown file for each session |

`http_server.cjs`, `browser.cjs` and `cdp_client.cjs` are copies of the files
of the same name in `scripts/perf/` on `main`. The only change is the
`Cache-Control: no-store` header, which section 13 of the report requires.

## Commands

```sh
# Write the ELF32 workloads (only necessary after a change to the generator).
node scripts/perf-core/gen_workloads.cjs

# Validation gate 1: the native oracle retires the exact counts.
node scripts/perf-core/validate_native.cjs

# One benchmark session.
node scripts/perf-core/run.cjs --label step-1-baseline --reps 5

# The functional gate (checks 2, 3 and 4 of section 7 of the plan).
node scripts/perf-core/checks/gen_check_programs.cjs   # only after a change
node scripts/perf-core/checks/run_checks.cjs

# The startup and footprint metric (steps 5, 6 and 7 of the plan).
node scripts/perf-core/startup/gen_probe.cjs           # only after a change
node scripts/perf-core/startup/run_startup.cjs --label step-5-memory --reps 7

# The phase metric (local/36ms.md). It needs the instrumented module first.
EXTRA_FLAGS=-DALE_TIME_STARTUP BUILD_TAG=instr NO_INSTALL=1 \
  scripts/build-whisper/build.sh
node scripts/perf-core/startup/run_phases.cjs --label 36ms-phases --reps 15
```

## The functional gate

`checks/run_checks.cjs` serves the repository, opens `checks/check.html` in
headless Chromium and drives the real application worker
(`modules/simulator_worker.js`) with the real module. It uses the same message
protocol as `modules/simulator.js`, so it tests what the application runs.

| Program | What it proves |
| --- | --- |
| `hello.elf` | The `--newlib` write syscall reaches the terminal |
| `mmio.elf` | `jsWriteMMIO` and `jsReadMMIO` work. The program writes `0x5A` to `0xffff0010`, reads it back and writes the byte to the terminal. The host also sees the write in the sync message. |
| `bss.elf` | The guest memory reads as zero where the ELF file has nothing. The one `PT_LOAD` segment has a `p_memsz` that is 512 KB larger than its `p_filesz`, and `Memory::loadElfSegment` copies `p_filesz` bytes only, so the 512 KB is a real `.bss`. The program reads four words spread through the gap and writes `Z` when every one is zero and `D` when one is not. `patches/0007` needs this check: it takes the `memset` out of the guest memory allocation, so nothing after the allocation writes those bytes. A copy of the program whose probes point at the loaded code writes `D`, which is the proof that the check has teeth. |
| `stdin.elf` | The `--newlib` read syscall works with interrupts on. Until the host sends a character, `readFromStdin` reports -1 and `Syscall.cpp` waits in a loop around `emscripten_sleep(10)`. |
| `hello.elf` with `--interactive` | The interactive shell of whisper works. This is what the "run with debug" button of the application uses. The check sends `peek pc`, `run` and `quit` through the same `interactive` message that `modules/simulator.js` sends. Step 6 needs this check: the plan lists the shell as unused, and that is not correct. |
| `stdin.elf` with `--interactive` | A read of the standard input inside the shell. The shell uses the loop of the core that does everything (`untilAddress`) and a batch run uses the fast loop, so the two stop for input in two different places. Step 8 needs this check, and it found a defect: the first version of the patch stopped only the fast loop, so this check did not finish. |

The driver takes the ISA string from the checkboxes of `index.html`, because
that is where the application takes it from. `get_checked_ISAs()` in
`assets/js/interface_elements.js` reads those checkboxes and pushes `--isa` in
front of `simulator_controller.start_execution`. The `Module.arguments` value
in `modules/simulator_worker.js` is only a fallback, and the `start` message
replaces it.

The gate takes the ISA string **and the stack pointer** from `index.html`. The
stack pointer is `0x7FFFFFC`, which is the top of the 128 MB guest memory of
whisper, so it is the highest guest address the application uses. Step 5 needs
that: a gate with a low stack pointer would not find a linear memory that is
too small.

## The startup and footprint metric

`startup/run_startup.cjs` measures what steps 5, 6 and 7 change. Those steps do
not target throughput, so the benchmark harness cannot show their effect.

| Figure | What it is |
| --- | --- |
| Reservation | The initial size of the linear memory, from the memory section of the `.wasm` file. The worker confirms it at run time. |
| To the first instruction | The time from the run message in the worker to the first guest write to the MMIO window. `startup/probe.elf` does that on its third instruction. It contains the fetch, the compile, the instantiation, the core startup and the program load. |
| ... the module | The part of the figure above that ends at the Emscripten `preRun` hook: the fetch, the compile and the instantiation of the module, and nothing else. A smaller module makes this part shorter and no other part. |
| ... the core startup | The rest: the instruction table, the CSRs, the decode cache, the guest memory and the program load. Step 6 measured that this part is the larger one by a factor of four. |
| To the exit | The same clock, to the end of the program. |
| Size | The raw and the gzip size of each module file. |

`startup/wasm_sizes.cjs` reads a `.wasm` file and reports the size of the code
section, the number of functions and the size of the largest function. With a
symbol map from `em++ --emit-symbol-map` it also groups the functions by
subsystem, which is how step 6 chose what to guard.

Both cores get a new worker for each repetition here, which is not what the
throughput harness does. A startup figure must be a cold start.

The harness is a separate directory, and not an option of `run.cjs`, because
rule 3 of the plan says that no step may change how the benchmark harness
measures.

## The phase metric

`startup/run_phases.cjs` answers the question of `local/36ms.md`: where do the
milliseconds between the run message and the end of a small program go?
`run_startup.cjs` divides that time into the module part and the core startup
part, and the core startup is four fifths of it in one number. This driver
divides that number into the phases of the whisper startup.

It needs a module that `-DALE_TIME_STARTUP` built:

```sh
EXTRA_FLAGS=-DALE_TIME_STARTUP BUILD_TAG=instr NO_INSTALL=1 \
  scripts/build-whisper/build.sh
node scripts/perf-core/startup/run_phases.cjs --label 36ms-phases --reps 15
```

`scripts/build-whisper/patches/0006-time-the-startup.patch` puts a mark at each
phase of the whisper startup. Without the macro the patch is inert, so a normal
build gives the module that the branch ships. The module writes one
`ALE_TIME <name> <ms>` line for each mark after the program ends, and
`startup/worker_cpp_phases.js` adds the timestamps that only JavaScript can
take. The clock of the marks is `emscripten_get_now()`, which Emscripten
implements as `performance.now()`, so the marks of the module and the
timestamps of the worker are on one clock.

The driver runs five guest memory sizes: the 128 MB of the application and
64 MB, 16 MB, 4 MB and 1 MiB with `--memorysize`. The four smaller ones are not
configurations that the application can use. They are there to separate the
cost of the guest memory from the rest, and `local/36ms.md` uses them for two
results: the largest phase of the startup is a fill of that memory with zeros,
and the part of the startup that the size does not touch is about 16.5 ms in all
five configurations.

**The resolution of the clock is 0.1 ms.** Chromium coarsens
`performance.now()` in a worker to 100 microseconds, so a phase that reads
0.00 ms is not free: it is below the resolution. `local/36ms.md` gives the sum
of all such phases.

The native oracle is `crates/riscv-rs/SweRV-ISS-1/opt/whisper`. Build it with:

```sh
cd crates/riscv-rs
make -f vendor/GNUmakefile.vendor
cd SweRV-ISS-1
make -f GNUmakefile.wdc BOOST_DIR=$(cd ../vendor && pwd) opt
```

## Why the two workers are not symmetrical

The C++ worker is new for each repetition. The Rust worker stays alive for the
whole session. This is not a convenience. It is what each core does in the
application, and it changes the figures by a large factor:

- V8 compiles a WebAssembly function with the baseline tier (Liftoff) on the
  first call and with the optimizing tier after that. It does not replace the
  code of a call that is already in progress.
- The Rust core does all of its work inside one large `run_slice` function.
  The first call to it therefore runs in the baseline tier from start to end.
  Measured on this machine: 133 MIPS on the first call and 225 MIPS on every
  call after it. The application calls `run_slice` one time for each slice of
  a `setTimeout` chain (`modules/simulator_worker.js` on `main`), so the
  optimized figure is the figure that a user gets.
- The C++ core runs its whole program inside one `main` call, and its module
  is one-shot. Its inner loop calls many small functions millions of times, so
  V8 optimizes those callees while the outer loop runs. The C++ core therefore
  reaches its optimized speed inside one run. A measurement with
  `--js-flags=--liftoff-only` gives 106 / 45 / 106 MIPS against 119 / 86 / 180
  MIPS with the default flags, which is the proof that it tiers up.

A harness that made a new Rust worker for each repetition would report about
130 MIPS for the Rust core, which is 40% below the figures in `local/rs-cpp.md`
and below what the application delivers.

## Tool versions

The versions that made the results in `results/`:

| Tool | Version |
| --- | --- |
| Operating system | macOS 26.2 (25C56), arm64 |
| Node.js | v26.7.0 |
| Playwright | 1.62.1 (`chromium-1234`) |
| Chromium | Google Chrome for Testing 151.0.7922.34 |
| Native C++ compiler | Apple clang 21.0.0 (clang-2100.1.1.101) |
| Emscripten SDK | 6.0.8 (`aeb67926e7de656da38bc807d83050af93578758`) |

The Emscripten SDK is at `$HOME/emsdk`. It needs Python 3.10 or later; the
Python of the operating system is 3.9.6, so the installation used a Python
3.12.13 from `uv`:

```sh
uv python install 3.12
export EMSDK_PYTHON=$(uv python find 3.12)
cd $HOME/emsdk && ./emsdk install latest && ./emsdk activate latest
source $HOME/emsdk/emsdk_env.sh
```
