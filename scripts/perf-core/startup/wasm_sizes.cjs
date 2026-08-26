"use strict";

/**
 * What is big inside a `.wasm` module.
 *
 * Steps 6 and 7 of `local/optimize-whisper.md` remove code from the module.
 * This tool says which code is there, so that a step works on the parts that
 * are worth the change instead of on a guess.
 *
 * It reads the code section for the body size of each function, and the symbol
 * map that `em++ --emit-symbol-map` writes for the name of each function. The
 * import count is the offset between a function index and a code entry.
 *
 * Usage:
 *   node scripts/perf-core/startup/wasm_sizes.cjs <file.wasm> [file.wasm.symbols]
 *   node scripts/perf-core/startup/wasm_sizes.cjs <file.wasm> --group
 */

const fs = require("fs");

function readWasm(file) {
  const buf = fs.readFileSync(file);
  let p = 8;

  const leb = () => {
    let r = 0,
      shift = 0,
      b;
    do {
      b = buf[p++];
      r += (b & 0x7f) * Math.pow(2, shift);
      shift += 7;
    } while (b & 0x80);
    return r;
  };
  const skipName = () => {
    const n = leb();
    p += n;
  };

  let importedFunctions = 0;
  const functions = []; // {index, bytes}
  let total = buf.length;
  const sections = {};

  while (p < buf.length) {
    const id = buf[p++];
    const len = leb();
    const end = p + len;
    sections[id] = (sections[id] || 0) + len;

    if (id === 2) {
      // The import section. Only a function import shifts the index space.
      const count = leb();
      for (let i = 0; i < count; i++) {
        skipName(); // module
        skipName(); // field
        const kind = buf[p++];
        if (kind === 0) {
          leb(); // type index
          importedFunctions++;
        } else if (kind === 1) {
          p++; // element type
          const flags = leb();
          leb();
          if (flags & 1) leb();
        } else if (kind === 2) {
          const flags = leb();
          leb();
          if (flags & 1) leb();
        } else if (kind === 3) {
          p++; // value type
          p++; // mutability
        }
      }
    } else if (id === 10) {
      // The code section.
      const count = leb();
      for (let i = 0; i < count; i++) {
        const size = leb();
        functions.push({ index: importedFunctions + i, bytes: size });
        p += size;
      }
    }
    p = end;
  }

  return { functions, sections, total, importedFunctions };
}

function readSymbols(file) {
  const map = new Map();
  if (!fs.existsSync(file)) return map;
  for (const line of fs.readFileSync(file, "utf8").split("\n")) {
    const i = line.indexOf(":");
    if (i < 0) continue;
    map.set(Number(line.slice(0, i)), line.slice(i + 1));
  }
  return map;
}

/**
 * The subsystem a symbol belongs to, for the grouped report.
 *
 * The rules match a class-qualified name and not a loose word, and the order
 * is from the specific to the general. Both properties matter: a rule that
 * matched the word "vector" would put every function that takes a
 * `std::vector` argument into the vector extension, and a rule that matched
 * "Vec" would put `InstTable::setupInstVec` there as well, which is the whole
 * instruction table and has nothing to do with the vector extension.
 */
function group(name) {
  const rules = [
    [/WdRiscv::Server|WhisperMessage/, "server"],
    [/handleExceptionForGdb|Gdb\b|ForGdb/, "gdb"],
    [/[Ss]napshot/, "snapshot"],
    [/WdRiscv::Interactive/, "interactive"],
    [/nlohmann|WdRiscv::HartConfig/, "config file (JSON)"],
    [/^boost::|boost::program_options|::program_options/, "boost"],
    [/InstTable|WdRiscv::InstEntry/, "instruction table"],
    [/::exec[A-Z][a-z]*V|WdRiscv::VecRegs|::vsetvl|::decodeVec|::exec[Vv]/,
      "vector extension"],
    [/::disassemble/, "disassembler"],
    [/WdRiscv::Triggers|::ldStAddrTrigger|::instAddrTrigger/, "triggers"],
    [/WdRiscv::VirtMem|WdRiscv::Tlb/, "virtual memory"],
    [/WdRiscv::Syscall|::emulate/, "syscalls"],
    [/WdRiscv::CsRegs|WdRiscv::Csr/, "CSRs"],
    [/WdRiscv::Memory|WdRiscv::PmaManager|WdRiscv::PmpManager/, "memory"],
    [/softfloat|^f16_|^f32_|^f64_|^extF80|^ui32_|^ui64_|^i32_|^i64_/,
      "soft float"],
    [/WdRiscv::Hart|WdRiscv::Core|WdRiscv::System|WdRiscv::DecodedInst/,
      "the interpreter"],
    [/^main$|^collectCommandLineValues|^applyCmdLineArgs|^session|^runServer/,
      "the command line"],
  ];
  for (const [re, label] of rules) if (re.test(name)) return label;
  return "other (libc, libc++, Emscripten, Asyncify)";
}

function main() {
  const file = process.argv[2];
  if (!file) throw new Error("usage: wasm_sizes.cjs <file.wasm> [symbols]");
  const grouped = process.argv.includes("--group");
  const symFile =
    process.argv[3] && !process.argv[3].startsWith("--")
      ? process.argv[3]
      : file.replace(/\.wasm$/, ".js.symbols");

  const { functions, sections, total } = readWasm(file);
  const symbols = readSymbols(symFile);

  const named = functions.map((f) => ({
    ...f,
    name: symbols.get(f.index) || `function[${f.index}]`,
  }));
  const code = named.reduce((a, f) => a + f.bytes, 0);

  console.log(`${file}`);
  console.log(`  total        ${total} bytes`);
  console.log(`  code section ${sections[10] || 0} bytes`);
  console.log(`  data section ${sections[11] || 0} bytes`);
  console.log(`  functions    ${functions.length}`);
  console.log(
    `  largest      ${Math.max(...functions.map((f) => f.bytes))} bytes`,
  );
  console.log("");

  if (grouped) {
    const totals = new Map();
    for (const f of named) {
      const g = group(f.name);
      const cur = totals.get(g) || { bytes: 0, count: 0 };
      cur.bytes += f.bytes;
      cur.count++;
      totals.set(g, cur);
    }
    const rows = [...totals.entries()].sort((a, b) => b[1].bytes - a[1].bytes);
    for (const [g, v] of rows) {
      const share = ((v.bytes / code) * 100).toFixed(1);
      console.log(
        `  ${String(v.bytes).padStart(8)}  ${share.padStart(5)}%  ` +
          `${String(v.count).padStart(5)} fn  ${g}`,
      );
    }
    return;
  }

  named.sort((a, b) => b.bytes - a.bytes);
  for (const f of named.slice(0, 40)) {
    console.log(`  ${String(f.bytes).padStart(8)}  ${f.name}`);
  }
}

main();
