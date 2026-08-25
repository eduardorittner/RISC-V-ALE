"use strict";

/**
 * The core benchmark driver.
 *
 * It serves the page, the two workers, the Rust fixture and the C++ module
 * from one directory, drives headless Chromium and collects the figure that
 * each core reports.
 *
 * The measurement rules come from sections 3 and 13 of `local/rs-cpp.md` and
 * from section 5 of `local/optimize-whisper.md`. They must not change:
 *
 *  - The C++ figure is the `Retired N instructions in X.XXs Y inst/s` line
 *    that the core prints. The Rust figure is `performance.now()` around one
 *    `run_slice(0xFFFFFFFF)` call.
 *  - Interrupts are off in both cores.
 *  - Each repetition runs in a new worker.
 *  - Five repetitions per core, per workload, per configuration. The report
 *    gives the median and the best.
 *  - The Rust module is a fixture, so it is the live control in every session.
 *  - The C++ module comes from `modules/`, so each step of the plan measures
 *    the module that the branch carries.
 *
 * Usage:
 *   node scripts/perf-core/run.cjs --label step-1-baseline [--reps 5]
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const { createServer } = require("./http_server.cjs");
const { launchBrowser, killBrowser } = require("./browser.cjs");
const { connectToPage } = require("./cdp_client.cjs");

const HERE = __dirname;
const REPO = path.resolve(HERE, "..", "..");
const STAGE = path.join(HERE, ".stage");
const RESULTS = path.join(HERE, "results");
const WORKLOAD_DIR = path.join(HERE, "workloads");

/** The guest directory the C++ module writes the workload into. */
const GUEST_DIR = "/working";

/**
 * The configurations the harness measures. Every session measures all of
 * them, so a step never changes what the harness does. A step reads the
 * column that matches the configuration the application ships.
 */
const CONFIGS = [
  {
    key: "rust",
    core: "rust",
    label: "Rust",
    args: (guestPath) => ["--newlib", guestPath, "--setreg", "sp=0x10000"],
  },
  {
    key: "cpp-acdfimsu",
    core: "cpp",
    label: "C++ --isa acdfimsu",
    args: (guestPath) => [
      "--newlib",
      guestPath,
      "--isa",
      "acdfimsu",
      "--setreg",
      "sp=0x10000",
    ],
  },
  {
    key: "cpp-acdfim",
    core: "cpp",
    label: "C++ --isa acdfim",
    args: (guestPath) => [
      "--newlib",
      guestPath,
      "--isa",
      "acdfim",
      "--setreg",
      "sp=0x10000",
    ],
  },
];

function parseArgs(argv) {
  const opts = { label: "run", reps: 5 };
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

/** Put every file the page needs into one directory. */
function stage() {
  fs.rmSync(STAGE, { recursive: true, force: true });
  fs.mkdirSync(STAGE, { recursive: true });

  for (const f of fs.readdirSync(path.join(HERE, "page"))) {
    fs.copyFileSync(path.join(HERE, "page", f), path.join(STAGE, f));
  }
  for (const f of ["riscv_rs.js", "riscv_rs_bg.wasm"]) {
    fs.copyFileSync(path.join(HERE, "fixtures", f), path.join(STAGE, f));
  }
  for (const f of fs.readdirSync(WORKLOAD_DIR)) {
    if (f.endsWith(".elf")) {
      fs.copyFileSync(path.join(WORKLOAD_DIR, f), path.join(STAGE, f));
    }
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

function fileSize(p) {
  try {
    return fs.statSync(p).size;
  } catch (e) {
    return 0;
  }
}

async function main() {
  const opts = parseArgs(process.argv.slice(2));

  const manifest = JSON.parse(
    fs.readFileSync(path.join(WORKLOAD_DIR, "manifest.json"), "utf8"),
  );
  const workloads = manifest.workloads;

  stage();
  fs.mkdirSync(RESULTS, { recursive: true });

  const { server, port } = await createServer(STAGE);
  const browser = await launchBrowser("chrome");
  let client;

  const samples = {}; // key -> workload -> [{instructions, seconds, instPerSec}]
  const failures = [];

  try {
    client = await connectToPage(browser.port);
    await client.navigate(`http://127.0.0.1:${port}/index.html`);
    await client.waitForReady();
    await client.waitForGlobal("harnessReady");

    for (const c of CONFIGS) samples[c.key] = {};

    // Repetition-major order, so a slow moment in the machine spreads over
    // every cell instead of over one of them.
    for (let rep = 1; rep <= opts.reps; rep++) {
      for (const config of CONFIGS) {
        for (const w of workloads) {
          const args = config.args(`${GUEST_DIR}/${w.file}`);
          const expr =
            `runOne(${JSON.stringify(config.core)}, ` +
            `${JSON.stringify(w.file)}, ${JSON.stringify(args)})`;
          const res = await client.evaluate(expr, true);
          const value = res && res.result ? res.result.value : null;

          if (!value || value.type !== "result") {
            const why = value ? value.error : "no value";
            failures.push(`${config.key}/${w.name} rep ${rep}: ${why}`);
            console.error(
              `  FAIL ${config.key} ${w.name} rep ${rep}: ${why}`,
              value && value.stderr ? value.stderr.slice(-5) : "",
            );
            continue;
          }

          if (value.instructions !== w.instructions) {
            failures.push(
              `${config.key}/${w.name} rep ${rep}: retired ` +
                `${value.instructions} instructions, not ${w.instructions}`,
            );
          }

          (samples[config.key][w.name] ||= []).push({
            instructions: value.instructions,
            seconds: value.seconds,
            instPerSec: value.instPerSec,
          });

          const mips = (value.instPerSec / 1e6).toFixed(1);
          console.log(
            `rep ${rep}  ${config.key.padEnd(14)} ${w.name.padEnd(7)} ` +
              `${mips.padStart(6)} MIPS  (${value.instructions} instructions)`,
          );
        }
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
    summary[c.key] = {};
    for (const w of workloads) {
      const cells = samples[c.key][w.name] || [];
      if (!cells.length) continue;
      const mips = cells.map((s) => s.instPerSec / 1e6);
      summary[c.key][w.name] = {
        median: Number(median(mips).toFixed(1)),
        best: Number(Math.max(...mips).toFixed(1)),
        samples: mips.map((v) => Number(v.toFixed(1))),
        instructions: cells[0].instructions,
      };
    }
  }

  const record = {
    label: opts.label,
    commit: gitDescribe(),
    reps: opts.reps,
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    modules: {
      "whisper.wasm": fileSize(path.join(REPO, "modules", "whisper.wasm")),
      "whisper.js": fileSize(path.join(REPO, "modules", "whisper.js")),
      "riscv_rs_bg.wasm": fileSize(
        path.join(HERE, "fixtures", "riscv_rs_bg.wasm"),
      ),
    },
    workloads: workloads.map((w) => ({
      name: w.name,
      instructions: w.instructions,
    })),
    summary,
    failures,
  };

  const jsonPath = path.join(RESULTS, `${opts.label}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(record, null, 2) + "\n");

  const lines = [];
  lines.push(`# ${opts.label}`, "");
  lines.push(`Commit: \`${record.commit}\`  Repetitions: ${opts.reps}`, "");
  lines.push("Median of the repetitions, MIPS.", "");
  lines.push(
    "| Configuration | " + workloads.map((w) => `\`${w.name}\``).join(" | ") + " |",
  );
  lines.push("| --- |" + workloads.map(() => " --- |").join(""));
  for (const c of CONFIGS) {
    const cells = workloads.map((w) => {
      const s = summary[c.key][w.name];
      return s ? s.median.toFixed(1) : "—";
    });
    lines.push(`| ${c.label} | ${cells.join(" | ")} |`);
  }
  lines.push("", "Best of the repetitions, MIPS.", "");
  lines.push(
    "| Configuration | " + workloads.map((w) => `\`${w.name}\``).join(" | ") + " |",
  );
  lines.push("| --- |" + workloads.map(() => " --- |").join(""));
  for (const c of CONFIGS) {
    const cells = workloads.map((w) => {
      const s = summary[c.key][w.name];
      return s ? s.best.toFixed(1) : "—";
    });
    lines.push(`| ${c.label} | ${cells.join(" | ")} |`);
  }
  if (failures.length) {
    lines.push("", "## Failures", "");
    failures.forEach((f) => lines.push(`- ${f}`));
  }
  const mdPath = path.join(RESULTS, `${opts.label}.md`);
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
