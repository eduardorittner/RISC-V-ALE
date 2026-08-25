"use strict";

/**
 * Generator for the three core-benchmark workloads.
 *
 * Each workload is an RV32 program with an exactly known retired-instruction
 * count near 20 million. The generator writes each program into a minimal
 * ELF32 file, so the two simulator cores run the same bytes.
 *
 * The three shapes and the instruction encoders come from
 * `crates/riscv-rs/benches/throughput_benchmarks.rs`. Section 3.2 of
 * `local/rs-cpp.md` describes the shapes:
 *
 *   alu     — register-only work. Fetch, decode and dispatch only.
 *   memcpy  — a load and a store per iteration. Adds the data-side path.
 *   mixed   — compressed and uncompressed instructions together. Adds the
 *             16/32-bit fetch split.
 *
 * The iteration counts give the exact retired counts that section 3.2 of the
 * report records: 20,000,005 for alu, 20,000,009 for memcpy and 20,000,003
 * for mixed.
 */

const fs = require("fs");
const path = require("path");

const {
  addi,
  xori,
  slli,
  add,
  lw,
  sw,
  lui,
  bnez,
  li,
  cAddi,
  Program,
  buildElf,
} = require("./riscv_asm.cjs");

/** Virtual address of the first instruction of every workload. */
const PROGRAM_BASE = 0x1000;
/** Where `memcpy` reads from. A `lui` immediate holds it exactly. */
const SRC_BASE = 0x100000;
/** Where `memcpy` writes to. A `lui` immediate holds it exactly. */
const DST_BASE = 0x200000;

/** `iterations` passes of a five-instruction register-only body. */
function aluLoop(iterations) {
  const p = new Program();
  p.pushPair(li(5, iterations)); // x5 = iterations (2 instructions)

  const bodyStart = p.lenBytes();
  p.push32(addi(5, 5, -1)); // x5 -= 1
  p.push32(xori(6, 6, 0x5a5)); // x6 ^= 0x5A5
  p.push32(slli(7, 6, 3)); // x7 = x6 << 3
  p.push32(add(8, 7, 6)); // x8 = x7 + x6
  const back = bodyStart - p.lenBytes();
  p.push32(bnez(5, back)); // loop while x5 != 0
  p.pushExit();

  // 2 setup instructions, 5 per iteration, then the 3-instruction exit.
  return { program: p, instructions: 2 + 5 * iterations + 3 };
}

/** `iterations` passes of a load, a store, two pointer bumps and the branch. */
function memcpyLoop(iterations) {
  const p = new Program();
  p.pushPair(li(5, iterations)); // x5 = iterations (2 instructions)
  p.push32(addi(10, 0, 0)); // x10 = source cursor
  p.push32(addi(11, 0, 0)); // x11 = destination cursor
  // Both bases are exact `lui` immediates, so one instruction builds each.
  p.push32(lui(12, SRC_BASE >>> 12)); // x12 = SRC_BASE
  p.push32(lui(13, DST_BASE >>> 12)); // x13 = DST_BASE

  const bodyStart = p.lenBytes();
  p.push32(add(14, 12, 10)); // x14 = source + cursor
  p.push32(lw(15, 14, 0)); // x15 = [x14]
  p.push32(add(16, 13, 11)); // x16 = destination + cursor
  p.push32(sw(16, 15, 0)); // [x16] = x15
  p.push32(addi(10, 10, 4)); // source cursor += 4
  p.push32(addi(11, 11, 4)); // destination cursor += 4
  p.push32(addi(5, 5, -1)); // x5 -= 1
  const back = bodyStart - p.lenBytes();
  p.push32(bnez(5, back));
  p.pushExit();

  // 6 setup instructions, 8 per iteration, then the 3-instruction exit.
  return { program: p, instructions: 6 + 8 * iterations + 3 };
}

/**
 * `iterations` passes of a body that puts 16-bit and 32-bit encodings
 * together, so every iteration crosses the compressed fetch split.
 */
function mixedLoop(iterations) {
  const p = new Program();
  p.pushPair(li(5, iterations)); // x5 = iterations (2 instructions)

  const bodyStart = p.lenBytes();
  p.push16(cAddi(6, 1)); // c.addi x6, 1        (16-bit)
  p.push32(xori(7, 7, 0x3c3)); // xori x7, x7, 0x3C3  (32-bit)
  p.push16(cAddi(8, -1)); // c.addi x8, -1       (16-bit)
  p.push32(add(9, 7, 6)); // add x9, x7, x6      (32-bit)
  p.push16(cAddi(5, -1)); // c.addi x5, -1       (16-bit)
  const back = bodyStart - p.lenBytes();
  p.push32(bnez(5, back)); // 32-bit
  p.pushExit();

  // 2 setup instructions, 6 per iteration, then the 3-instruction exit.
  return { program: p, instructions: 2 + 6 * iterations + 3 };
}

// ─── Entry point ────────────────────────────────────────────────────────────

const WORKLOADS = [
  { name: "alu", build: () => aluLoop(4000000) },
  { name: "memcpy", build: () => memcpyLoop(2500000) },
  { name: "mixed", build: () => mixedLoop(3333333) },
];

/** The counts that section 3.2 of `local/rs-cpp.md` records. */
const EXPECTED_COUNTS = {
  alu: 20000005,
  memcpy: 20000009,
  mixed: 20000003,
};

function main() {
  const outDir = path.join(__dirname, "workloads");
  fs.mkdirSync(outDir, { recursive: true });

  const manifest = { programBase: PROGRAM_BASE, workloads: [] };

  for (const { name, build } of WORKLOADS) {
    const { program, instructions } = build();
    if (instructions !== EXPECTED_COUNTS[name]) {
      throw new Error(
        `${name} retires ${instructions} instructions, not the ` +
          `${EXPECTED_COUNTS[name]} that the report records`,
      );
    }
    const elf = buildElf(program.toBytes(), PROGRAM_BASE);
    const file = `${name}.elf`;
    fs.writeFileSync(path.join(outDir, file), elf);
    manifest.workloads.push({
      name,
      file,
      instructions,
      bytes: elf.length,
    });
    console.log(
      `${name}: ${instructions} instructions, ${elf.length} bytes -> ${file}`,
    );
  }

  fs.writeFileSync(
    path.join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
}

if (require.main === module) {
  main();
}

module.exports = { PROGRAM_BASE, EXPECTED_COUNTS };
