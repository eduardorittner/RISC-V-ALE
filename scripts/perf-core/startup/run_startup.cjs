"use strict";

/**
 * The startup and footprint driver.
 *
 * Steps 5, 6 and 7 of `local/optimize-whisper.md` do not target throughput.
 * Their metrics are the module size, the linear memory reservation and the time
 * to the first instruction. This driver reports those three.
 *
 * It is a separate harness from `run.cjs`. Rule 3 of the plan says that no
 * step may change how the benchmark harness measures, so the benchmark harness
 * keeps the files that step 1 wrote and this directory holds the new metric.
 *
 * What each figure means:
 *
 *   reservation   the initial size of the linear memory. It comes from the
 *                 memory section of the `.wasm` file and the worker confirms
 *                 it at run time from `wasmMemory.buffer.byteLength`.
 *   firstInst     the time from the moment the worker has the run message to
 *                 the moment the guest writes to the MMIO window. `probe.elf`
 *                 does that on its third instruction, so this is the time to
 *                 the first instruction. It contains the fetch of the ELF, the
 *                 fetch of the module, the compile, the instantiation, the
 *                 whisper startup and the program load.
 *   module        the part of `firstInst` that is the fetch, the compile and
 *                 the instantiation of the module. This is the part that a
 *                 smaller module makes shorter.
 *   coreInit      the rest: the instruction table, the CSRs, the decode cache,
 *                 the guest memory and the program load.
 *   exit          the same clock, up to the end of the program.
 *   sizes         the raw and the gzip size of each module file.
 *
 * Usage:
 *   node scripts/perf-core/startup/run_startup.cjs --label step-5 [--reps 7]
 */

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");
const { execFileSync } = require("child_process");

const { createServer } = require("../http_server.cjs");
const { launchBrowser, killBrowser } = require("../browser.cjs");
const { connectToPage } = require("../cdp_client.cjs");

const HERE = __dirname;
const PERF = path.resolve(HERE, "..");
const REPO = path.resolve(PERF, "..", "..");
const STAGE = path.join(HERE, ".stage");
const RESULTS = path.join(PERF, "results");

/** The guest directory the C++ module writes the probe into. */
const GUEST_DIR = "/working";

/**
 * The configurations. The first three are the ones the benchmark harness uses,
 * so a figure here is comparable with a figure there. `cpp-app` is the
 * configuration the application ships: the stack pointer of `index.html`,
 * which is at the top of the 128 MB guest memory of whisper.
 */
const CONFIGS = [
  {
    key: "rust",
    core: "rust",
    label: "Rust (the control)",
    args: (p) => ["--newlib", p, "--setreg", "sp=0x10000"],
  },
  {
    key: "cpp-acdfim",
    core: "cpp",
    label: "C++ --isa acdfim",
    args: (p) => ["--newlib", p, "--isa", "acdfim", "--setreg", "sp=0x10000"],
  },
  {
    key: "cpp-app",
    core: "cpp",
    label: "C++ as the application starts it",
    args: (p) => [
      "--newlib",
      p,
      "--isa",
      "acdfim",
      "--setreg",
      "sp=0x7FFFFFC",
    ],
  },
  // The reference row for the guest memory. The application cannot use it:
  // `so_stack_pointer_value` in `index.html` is 0x7FFFFFC, every saved project
  // link carries that value, and a stack pointer above the guest memory faults
  // on the first push. The row exists to show what a smaller guest memory
  // would buy, because step 5 of the plan asks for a 64 MB reservation and the
  // stack pointer is the reason that target is out of reach.
  {
    key: "cpp-16mb",
    core: "cpp",
    label: "C++ with a 16 MB guest memory (not the application)",
    args: (p) => [
      "--newlib",
      p,
      "--isa",
      "acdfim",
      "--memorysize",
      "0x1000000",
      "--setreg",
      "sp=0xFFFFFC",
    ],
  },
];

function parseArgs(argv) {
  const opts = { label: "startup", reps: 7 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--label") opts.label = argv[++i];
    else if (a.startsWith("--label=")) opts.label = a.slice(8);
    else if (a === "--reps") opts.reps = Number(argv[++i]);
    else if (a.startsWith("--reps=")) opts.reps = Number(a.slice(7));
    else throw new Error(`unknown option: ${a}`);
  }
  return opts;
}

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function median(values) {
  const s = [...values].sort((a, b) => a - b);
  const mid = s.length >> 1;
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function stage() {
  fs.rmSync(STAGE, { recursive: true, force: true });
  fs.mkdirSync(STAGE, { recursive: true });

  for (const f of ["startup.html", "worker_cpp.js", "worker_rust.js", "probe.elf"]) {
    fs.copyFileSync(path.join(HERE, f), path.join(STAGE, f));
  }
  for (const f of ["riscv_rs.js", "riscv_rs_bg.wasm"]) {
    fs.copyFileSync(path.join(PERF, "fixtures", f), path.join(STAGE, f));
  }
  for (const f of ["whisper.js", "whisper.wasm"]) {
    fs.copyFileSync(path.join(REPO, "modules", f), path.join(STAGE, f));
  }
}

function gitDescribe() {
  try {
    return execFileSync("git", ["rev-parse", "--short", "HEAD"], {
      cwd: REPO,
      encoding: "utf8",
    }).trim();
  } catch (e) {
    return "unknown";
  }
}

/** The raw size and the gzip size of one file. */
function sizeOf(p) {
  try {
    const bytes = fs.readFileSync(p);
    return { raw: bytes.length, gzip: zlib.gzipSync(bytes, { level: 9 }).length };
  } catch (e) {
    return { raw: 0, gzip: 0 };
  }
}

/**
 * The initial size of the linear memory, from the memory section of a `.wasm`
 * file. This is the reservation the module asks the browser for.
 */
function wasmInitialMemory(file) {
  const buf = fs.readFileSync(file);
  let p = 8; // the magic and the version
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
  while (p < buf.length) {
    const id = buf[p++];
    const len = leb();
    const end = p + len;
    if (id === 5) {
      const count = leb();
      if (count > 0) {
        const flags = leb();
        const initial = leb();
        const maximum = flags & 1 ? leb() : null;
        return { pages: initial, bytes: initial * 65536, maxPages: maximum };
      }
    }
    p = end;
  }
  return null;
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const probe = JSON.parse(
    fs.readFileSync(path.join(HERE, "probe.json"), "utf8"),
  );

  stage();
  fs.mkdirSync(RESULTS, { recursive: true });

  const { server, port } = await createServer(STAGE);
  const browser = await launchBrowser("chrome");
  let client;

  const samples = {};
  const failures = [];

  try {
    client = await connectToPage(browser.port);
    await client.navigate(`http://127.0.0.1:${port}/startup.html`);
    await client.waitForReady();
    await client.waitForGlobal("harnessReady");

    for (const c of CONFIGS) samples[c.key] = [];

    for (let rep = 1; rep <= opts.reps; rep++) {
      for (const config of CONFIGS) {
        const args = config.args(`${GUEST_DIR}/${probe.file}`);
        const expr =
          `runStartup(${JSON.stringify(config.core)}, ` +
          `${JSON.stringify(args)})`;
        const res = await client.evaluate(expr, true);
        const value = res && res.result ? res.result.value : null;

        if (!value || value.type !== "result") {
          const why = value ? value.error : "no value";
          failures.push(`${config.key} rep ${rep}: ${why}`);
          console.error(`  FAIL ${config.key} rep ${rep}: ${why}`);
          continue;
        }

        samples[config.key].push(value);
        console.log(
          `rep ${rep}  ${config.key.padEnd(12)} ` +
            `first inst ${value.firstInstMs.toFixed(1).padStart(7)} ms ` +
            `(module ${value.moduleMs.toFixed(1).padStart(6)}, ` +
            `core ${value.coreInitMs.toFixed(1).padStart(6)})  ` +
            `exit ${value.exitMs.toFixed(1).padStart(7)} ms  ` +
            `memory ${(value.memoryBytes / 1048576).toFixed(0).padStart(4)} MB`,
        );
      }
    }
  } finally {
    if (client) client.close();
    killBrowser(browser.process);
    server.close();
    await sleep(200);
  }

  // ─── Report ───────────────────────────────────────────────────────────────

  const summary = {};
  for (const c of CONFIGS) {
    const cells = samples[c.key];
    if (!cells.length) continue;
    const stat = (field) => {
      const values = cells.map((s) => s[field]);
      return {
        median: Number(median(values).toFixed(1)),
        best: Number(Math.min(...values).toFixed(1)),
        samples: values.map((v) => Number(v.toFixed(1))),
      };
    };
    summary[c.key] = {
      firstInstMs: stat("firstInstMs"),
      moduleMs: stat("moduleMs"),
      coreInitMs: stat("coreInitMs"),
      exitMs: stat("exitMs"),
      memoryBytes: cells[0].memoryBytes,
    };
  }

  const sizes = {
    "whisper.js": sizeOf(path.join(REPO, "modules", "whisper.js")),
    "whisper.wasm": sizeOf(path.join(REPO, "modules", "whisper.wasm")),
    "riscv_rs.js": sizeOf(path.join(PERF, "fixtures", "riscv_rs.js")),
    "riscv_rs_bg.wasm": sizeOf(path.join(PERF, "fixtures", "riscv_rs_bg.wasm")),
  };

  const reservations = {
    "whisper.wasm": wasmInitialMemory(path.join(REPO, "modules", "whisper.wasm")),
    "riscv_rs_bg.wasm": wasmInitialMemory(
      path.join(PERF, "fixtures", "riscv_rs_bg.wasm"),
    ),
  };

  const record = {
    label: opts.label,
    commit: gitDescribe(),
    reps: opts.reps,
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    probe,
    sizes,
    reservations,
    summary,
    failures,
  };

  const jsonPath = path.join(RESULTS, `${opts.label}-startup.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(record, null, 2) + "\n");

  const lines = [];
  const mb = (n) => (n / 1048576).toFixed(1);
  const kb = (n) => (n / 1024).toFixed(0);

  lines.push(`# ${opts.label} — startup and footprint`, "");
  lines.push(`Commit: \`${record.commit}\`  Repetitions: ${opts.reps}`, "");
  lines.push("Median of the repetitions, milliseconds.", "");
  lines.push(
    "| Configuration | To the first instruction | ... the module | " +
      "... the core startup | To the exit | Reservation |",
  );
  lines.push("| --- | --- | --- | --- | --- | --- |");
  for (const c of CONFIGS) {
    const s = summary[c.key];
    if (!s) continue;
    lines.push(
      `| ${c.label} | ${s.firstInstMs.median.toFixed(1)} | ` +
        `${s.moduleMs.median.toFixed(1)} | ${s.coreInitMs.median.toFixed(1)} | ` +
        `${s.exitMs.median.toFixed(1)} | ${mb(s.memoryBytes)} MB |`,
    );
  }
  lines.push("", "Module size.", "");
  lines.push("| File | Raw | Gzip |");
  lines.push("| --- | --- | --- |");
  for (const [name, s] of Object.entries(sizes)) {
    lines.push(`| \`${name}\` | ${s.raw} (${kb(s.raw)} KB) | ${kb(s.gzip)} KB |`);
  }
  if (failures.length) {
    lines.push("", "## Failures", "");
    failures.forEach((f) => lines.push(`- ${f}`));
  }

  const mdPath = path.join(RESULTS, `${opts.label}-startup.md`);
  fs.writeFileSync(mdPath, lines.join("\n") + "\n");

  console.log("");
  console.log(lines.join("\n"));
  console.log("");
  console.log(`wrote ${path.relative(REPO, jsonPath)}`);
  console.log(`wrote ${path.relative(REPO, mdPath)}`);

  if (failures.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
