"use strict";

/**
 * The startup probe program.
 *
 * Steps 5, 6 and 7 of `local/optimize-whisper.md` do not target throughput.
 * Their metrics are the module size, the linear memory reservation and the
 * time to the first instruction. This program measures the last of the three.
 *
 * The program stores to the MMIO window as early as a RISC-V program can:
 *
 *   lui  t0, 0xffff0     first instruction
 *   addi t1, x0, 1       second instruction
 *   sw   t1, 0x10(t0)    third instruction, and the address is above
 *                        0xffff0000, so the core calls jsWriteMMIO
 *   exit
 *
 * The `jsWriteMMIO` hook therefore fires on the third retired instruction of
 * the program. Both cores have that hook (`Hart.cpp` for the C++ core,
 * `crates/riscv-rs/src/host_imports.rs` for the Rust core), so the host takes
 * one timestamp with the same meaning in both: the guest is running.
 *
 * Usage:
 *   node scripts/perf-core/startup/gen_probe.cjs
 */

const fs = require("fs");
const path = require("path");

const { addi, sw, lui, Program, buildElf } = require("../riscv_asm.cjs");

/** Virtual address of the first instruction. */
const BASE = 0x1000;

const T0 = 5,
  T1 = 6;

/** The MMIO address. `Hart.cpp` tests `addr > 0xffff0000`. */
const MMIO_ADDR = 0xffff0010;
const MMIO_VALUE = 1;

/** The retired instruction count at the moment `jsWriteMMIO` fires. */
const INSTRUCTIONS_TO_MMIO = 3;

function main() {
  const p = new Program();
  p.push32(lui(T0, MMIO_ADDR >>> 12));
  p.push32(addi(T1, 0, MMIO_VALUE));
  p.push32(sw(T0, T1, MMIO_ADDR & 0xfff));
  p.pushExit();

  const elf = buildElf(p.toBytes(), BASE);
  const outDir = __dirname;
  fs.writeFileSync(path.join(outDir, "probe.elf"), elf);
  fs.writeFileSync(
    path.join(outDir, "probe.json"),
    JSON.stringify(
      {
        file: "probe.elf",
        base: BASE,
        bytes: elf.length,
        mmio: { address: MMIO_ADDR, value: MMIO_VALUE },
        instructionsToMmio: INSTRUCTIONS_TO_MMIO,
        instructions: p.lenBytes() / 4,
      },
      null,
      2,
    ) + "\n",
  );
  console.log(`probe.elf: ${elf.length} bytes, MMIO on instruction 3`);
}

main();
