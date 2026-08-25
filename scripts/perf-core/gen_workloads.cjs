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

/** Virtual address of the first instruction of every workload. */
const PROGRAM_BASE = 0x1000;
/** Where `memcpy` reads from. A `lui` immediate holds it exactly. */
const SRC_BASE = 0x100000;
/** Where `memcpy` writes to. A `lui` immediate holds it exactly. */
const DST_BASE = 0x200000;

// ─── Encoders ───────────────────────────────────────────────────────────────

function encodeI(opcode, rd, funct3, rs1, imm) {
  return (
    (((imm >>> 0) & 0xfff) << 20) |
    (rs1 << 15) |
    (funct3 << 12) |
    (rd << 7) |
    opcode
  ) >>> 0;
}

function encodeR(opcode, rd, funct3, rs1, rs2, funct7) {
  return (
    (funct7 << 25) |
    (rs2 << 20) |
    (rs1 << 15) |
    (funct3 << 12) |
    (rd << 7) |
    opcode
  ) >>> 0;
}

function encodeS(opcode, funct3, rs1, rs2, imm) {
  const u = imm >>> 0;
  return (
    (((u >>> 5) & 0x7f) << 25) |
    (rs2 << 20) |
    (rs1 << 15) |
    (funct3 << 12) |
    ((u & 0x1f) << 7) |
    opcode
  ) >>> 0;
}

function encodeB(opcode, funct3, rs1, rs2, imm) {
  const u = imm >>> 0;
  return (
    (((u >>> 12) & 1) << 31) |
    (((u >>> 5) & 0x3f) << 25) |
    (rs2 << 20) |
    (rs1 << 15) |
    (funct3 << 12) |
    (((u >>> 1) & 0xf) << 8) |
    (((u >>> 11) & 1) << 7) |
    opcode
  ) >>> 0;
}

/** `addi rd, rs1, imm` */
const addi = (rd, rs1, imm) => encodeI(0x13, rd, 0, rs1, imm);
/** `xori rd, rs1, imm` */
const xori = (rd, rs1, imm) => encodeI(0x13, rd, 4, rs1, imm);
/** `slli rd, rs1, shamt` */
const slli = (rd, rs1, shamt) => encodeI(0x13, rd, 1, rs1, shamt);
/** `add rd, rs1, rs2` */
const add = (rd, rs1, rs2) => encodeR(0x33, rd, 0, rs1, rs2, 0);
/** `lw rd, imm(rs1)` */
const lw = (rd, rs1, imm) => encodeI(0x03, rd, 2, rs1, imm);
/** `sw rs2, imm(rs1)` */
const sw = (rs1, rs2, imm) => encodeS(0x23, 2, rs1, rs2, imm);
/** `lui rd, imm20` */
const lui = (rd, imm20) => ((((imm20 & 0xfffff) << 12) | (rd << 7) | 0x37) >>> 0);
/** `bne rs1, x0, offset` */
const bnez = (rs1, offset) => encodeB(0x63, 1, rs1, 0, offset);

const ECALL = 0x00000073;

/**
 * `li rd, value` as the canonical `lui` and `addi` pair.
 *
 * The `addi` immediate is sign-extended, so the high part is rounded up when
 * bit 11 of the value is set. A counter that is built without this correction
 * never reaches zero.
 */
function li(rd, value) {
  const v = value >>> 0;
  const hi = (v + 0x800) >>> 12;
  const lo = (v - ((hi << 12) >>> 0)) | 0;
  return [lui(rd, hi), addi(rd, rd, lo)];
}

/**
 * `c.addi rd, imm` — a 16-bit instruction. `rd` must not be x0 and `imm` must
 * not be 0, or the encoding means `c.nop` instead.
 */
function cAddi(rd, imm) {
  const u = imm >>> 0;
  return (
    ((((u >>> 5) & 1) << 12) | (rd << 7) | ((u & 0x1f) << 2) | 0b01) & 0xffff
  );
}

// ─── Program construction ───────────────────────────────────────────────────

/**
 * A guest program as a flat halfword stream, so a 16-bit instruction and a
 * 32-bit one can sit next to each other.
 */
class Program {
  constructor() {
    this.halfwords = [];
  }

  push32(word) {
    this.halfwords.push(word & 0xffff);
    this.halfwords.push((word >>> 16) & 0xffff);
  }

  pushPair(pair) {
    this.push32(pair[0]);
    this.push32(pair[1]);
  }

  push16(half) {
    this.halfwords.push(half & 0xffff);
  }

  /** Byte length of the program so far. The branch offsets need it. */
  lenBytes() {
    return this.halfwords.length * 2;
  }

  /**
   * `exit(0)`. Every workload ends with it. Without a halt the core runs on
   * into zeroed memory.
   */
  pushExit() {
    this.push32(addi(17, 0, 93)); // a7 = SYS_exit
    this.push32(addi(10, 0, 0)); // a0 = 0
    this.push32(ECALL);
  }

  toBytes() {
    const buf = Buffer.alloc(this.halfwords.length * 2);
    this.halfwords.forEach((half, i) => buf.writeUInt16LE(half, i * 2));
    return buf;
  }
}

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

// ─── ELF32 container ────────────────────────────────────────────────────────

const EHDR_SIZE = 52;
const PHDR_SIZE = 32;
const EM_RISCV = 243;

/**
 * Put the program bytes into a minimal little-endian ELF32 executable with
 * one PT_LOAD segment and no sections. Both cores read the segment table:
 * `Memory::loadElfSegment` in the C++ core and the `PT_LOAD` branch of
 * `Simulator::load_binary_with_args` in the Rust core.
 */
function buildElf(codeBytes, entry) {
  const offset = EHDR_SIZE + PHDR_SIZE;
  const buf = Buffer.alloc(offset + codeBytes.length);

  // The ELF header.
  buf.write("\x7fELF", 0, "latin1");
  buf.writeUInt8(1, 4); // ELFCLASS32
  buf.writeUInt8(1, 5); // ELFDATA2LSB
  buf.writeUInt8(1, 6); // EV_CURRENT
  buf.writeUInt16LE(2, 16); // e_type = ET_EXEC
  buf.writeUInt16LE(EM_RISCV, 18); // e_machine
  buf.writeUInt32LE(1, 20); // e_version
  buf.writeUInt32LE(entry, 24); // e_entry
  buf.writeUInt32LE(EHDR_SIZE, 28); // e_phoff
  buf.writeUInt32LE(0, 32); // e_shoff
  // Bit 0 is RVC, bits 1 and 2 are the float ABI. The two cores take the ISA
  // from the command line, so this field only records the encoding.
  buf.writeUInt32LE(0x1, 36); // e_flags
  buf.writeUInt16LE(EHDR_SIZE, 40); // e_ehsize
  buf.writeUInt16LE(PHDR_SIZE, 42); // e_phentsize
  buf.writeUInt16LE(1, 44); // e_phnum
  buf.writeUInt16LE(40, 46); // e_shentsize
  buf.writeUInt16LE(0, 48); // e_shnum
  buf.writeUInt16LE(0, 50); // e_shstrndx

  // The one program header.
  buf.writeUInt32LE(1, EHDR_SIZE + 0); // p_type = PT_LOAD
  buf.writeUInt32LE(offset, EHDR_SIZE + 4); // p_offset
  buf.writeUInt32LE(entry, EHDR_SIZE + 8); // p_vaddr
  buf.writeUInt32LE(entry, EHDR_SIZE + 12); // p_paddr
  buf.writeUInt32LE(codeBytes.length, EHDR_SIZE + 16); // p_filesz
  buf.writeUInt32LE(codeBytes.length, EHDR_SIZE + 20); // p_memsz
  buf.writeUInt32LE(5, EHDR_SIZE + 24); // p_flags = R + X
  buf.writeUInt32LE(4, EHDR_SIZE + 28); // p_align

  codeBytes.copy(buf, offset);
  return buf;
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
