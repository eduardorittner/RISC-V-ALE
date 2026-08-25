"use strict";

/**
 * The guest programs of the functional gate (section 7 of
 * `local/optimize-whisper.md`).
 *
 * Each program is small, and each one exercises one path that a step of the
 * plan can break:
 *
 *   hello  — the `--newlib` write syscall and the terminal path.
 *   mmio   — the `jsWriteMMIO` and `jsReadMMIO` hooks, which the RISC-V ALE
 *            devices use. The program writes a value to `0xffff0010`, reads it
 *            back and writes the byte it read to the terminal.
 *   stdin  — the `--newlib` read syscall. Until the host has input,
 *            `readFromStdin` reports -1 and `Syscall.cpp` waits in a loop
 *            around `emscripten_sleep(10)`. This is the path that the
 *            interrupt check of the gate must exercise.
 *
 * Usage:
 *   node scripts/perf-core/checks/gen_check_programs.cjs
 */

const fs = require("fs");
const path = require("path");

const {
  addi,
  lb,
  lw,
  sb,
  sw,
  lui,
  li,
  ECALL,
  Program,
  buildElf,
} = require("../riscv_asm.cjs");

/** Virtual address of the first instruction. */
const BASE = 0x1000;

/** Register numbers of the ABI names the programs use. */
const T0 = 5,
  T1 = 6,
  T2 = 7,
  A0 = 10,
  A1 = 11,
  A2 = 12,
  A7 = 17;

const SYS_READ = 63;
const SYS_WRITE = 64;

/** The address that the `mmio` program writes to and reads back. */
const MMIO_ADDR = 0xffff0010;
/** The value that the `mmio` program puts there. `0x5A` is the letter Z. */
const MMIO_VALUE = 0x5a;

const HELLO_TEXT = "Hello, RISC-V ALE!\n";

function padEven(buf) {
  return buf.length % 2 ? Buffer.concat([buf, Buffer.from([0])]) : buf;
}

/**
 * Build a program two times. The first pass gives the length of the code, and
 * the second pass puts the data behind it at a known address.
 */
function twoPass(build) {
  const first = build(0);
  const dataAddr = BASE + first.lenBytes();
  return { program: build(dataAddr), dataAddr };
}

function helloProgram(msgAddr) {
  const p = new Program();
  p.pushPair(li(A1, msgAddr));
  p.push32(addi(A0, 0, 1)); // fd 1
  p.push32(addi(A2, 0, HELLO_TEXT.length));
  p.push32(addi(A7, 0, SYS_WRITE));
  p.push32(ECALL);
  p.pushExit();
  if (msgAddr) p.pushBytes(padEven(Buffer.from(HELLO_TEXT, "latin1")));
  return p;
}

function mmioProgram(bufAddr) {
  const p = new Program();
  p.push32(lui(T0, MMIO_ADDR >>> 12)); // t0 = 0xffff0000
  p.push32(addi(T1, 0, MMIO_VALUE));
  p.push32(sw(T0, T1, MMIO_ADDR & 0xfff)); // jsWriteMMIO
  p.push32(lw(T2, T0, MMIO_ADDR & 0xfff)); // jsReadMMIO
  p.pushPair(li(A1, bufAddr));
  p.push32(sb(A1, T2, 0)); // buffer[0] = the value read back
  p.push32(addi(T1, 0, 10));
  p.push32(sb(A1, T1, 1)); // buffer[1] = newline
  p.push32(addi(A0, 0, 1)); // fd 1
  p.push32(addi(A2, 0, 2));
  p.push32(addi(A7, 0, SYS_WRITE));
  p.push32(ECALL);
  p.pushExit();
  if (bufAddr) p.pushBytes(Buffer.alloc(4));
  return p;
}

function stdinProgram(bufAddr) {
  const p = new Program();
  p.pushPair(li(A1, bufAddr));
  p.push32(addi(T1, 0, 10));
  p.push32(sb(A1, T1, 1)); // buffer[1] = newline
  p.push32(addi(A0, 0, 0)); // fd 0
  p.push32(addi(A2, 0, 1));
  p.push32(addi(A7, 0, SYS_READ));
  p.push32(ECALL);
  p.pushPair(li(A1, bufAddr));
  p.push32(addi(A0, 0, 1)); // fd 1
  p.push32(addi(A2, 0, 2));
  p.push32(addi(A7, 0, SYS_WRITE));
  p.push32(ECALL);
  p.pushExit();
  if (bufAddr) p.pushBytes(Buffer.alloc(4));
  return p;
}

const PROGRAMS = [
  {
    name: "hello",
    build: helloProgram,
    expectStdout: "Hello, RISC-V ALE!",
    describe: "the --newlib write syscall and the terminal path",
  },
  {
    name: "mmio",
    build: mmioProgram,
    expectStdout: String.fromCharCode(MMIO_VALUE),
    describe: "the jsWriteMMIO and jsReadMMIO hooks",
  },
  {
    name: "stdin",
    build: stdinProgram,
    expectStdout: null, // the driver sends the character and knows it
    describe: "the --newlib read syscall and the emscripten_sleep wait",
  },
];

function main() {
  const outDir = path.join(__dirname, "programs");
  fs.mkdirSync(outDir, { recursive: true });

  const manifest = {
    base: BASE,
    mmio: { address: MMIO_ADDR, value: MMIO_VALUE },
    programs: [],
  };

  for (const spec of PROGRAMS) {
    const { program } = twoPass(spec.build);
    const elf = buildElf(program.toBytes(), BASE);
    const file = `${spec.name}.elf`;
    fs.writeFileSync(path.join(outDir, file), elf);
    manifest.programs.push({
      name: spec.name,
      file,
      bytes: elf.length,
      expectStdout: spec.expectStdout,
      describe: spec.describe,
    });
    console.log(`${spec.name}: ${elf.length} bytes -> ${file}`);
  }

  fs.writeFileSync(
    path.join(outDir, "manifest.json"),
    JSON.stringify(manifest, null, 2) + "\n",
  );
}

main();
