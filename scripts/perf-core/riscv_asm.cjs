"use strict";

/**
 * A small RV32 assembler and ELF32 writer.
 *
 * The benchmark generator (`gen_workloads.cjs`) and the functional checks
 * (`checks/gen_check_programs.cjs`) both use it. The instruction encoders come
 * from `crates/riscv-rs/benches/throughput_benchmarks.rs`.
 */

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
/** `lb rd, imm(rs1)` */
const lb = (rd, rs1, imm) => encodeI(0x03, rd, 0, rs1, imm);
/** `lw rd, imm(rs1)` */
const lw = (rd, rs1, imm) => encodeI(0x03, rd, 2, rs1, imm);
/** `sb rs2, imm(rs1)` */
const sb = (rs1, rs2, imm) => encodeS(0x23, 0, rs1, rs2, imm);
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

  /** Add raw bytes, for example a message. The count must be even. */
  pushBytes(bytes) {
    if (bytes.length % 2) throw new Error("pushBytes needs an even count");
    for (let i = 0; i < bytes.length; i += 2) {
      this.halfwords.push(bytes[i] | (bytes[i + 1] << 8));
    }
  }

  /** Byte length of the program so far. The branch offsets need it. */
  lenBytes() {
    return this.halfwords.length * 2;
  }

  /**
   * `exit(0)`. Every program ends with it. Without a halt the core runs on
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

// ─── ELF32 container ────────────────────────────────────────────────────────

const EHDR_SIZE = 52;
const PHDR_SIZE = 32;
const EM_RISCV = 243;

/**
 * Put the program bytes into a minimal little-endian ELF32 executable with
 * one PT_LOAD segment and no sections. Both cores read the segment table:
 * `Memory::loadElfSegment` in the C++ core and the `PT_LOAD` branch of
 * `Simulator::load_binary_with_args` in the Rust core.
 *
 * `memBytes` makes the segment larger in memory than in the file, which gives
 * a program a zeroed buffer without putting it in the file.
 */
function buildElf(codeBytes, entry, memBytes) {
  const offset = EHDR_SIZE + PHDR_SIZE;
  const memSize = memBytes === undefined ? codeBytes.length : memBytes;
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
  buf.writeUInt32LE(memSize, EHDR_SIZE + 20); // p_memsz
  buf.writeUInt32LE(5, EHDR_SIZE + 24); // p_flags = R + X
  buf.writeUInt32LE(4, EHDR_SIZE + 28); // p_align

  codeBytes.copy(buf, offset);
  return buf;
}

module.exports = {
  encodeI,
  encodeR,
  encodeS,
  encodeB,
  addi,
  xori,
  slli,
  add,
  lb,
  lw,
  sb,
  sw,
  lui,
  bnez,
  li,
  cAddi,
  ECALL,
  Program,
  buildElf,
};
