"use strict";

/**
 * The startup phase driver.
 *
 * `run_startup.cjs` reports the time to the first instruction and divides it
 * into the module part and the core startup part. The core startup is the
 * larger of the two and it is one number there. This driver divides it into
 * the phases of the whisper startup, so that a reader can see which phase
 * holds the milliseconds.
 *
 * It needs a module that `-DALE_TIME_STARTUP` built:
 *
 *   EXTRA_FLAGS=-DALE_TIME_STARTUP BUILD_TAG=instr NO_INSTALL=1 \
 *     scripts/build-whisper/build.sh
 *
 * `patches/0006-time-the-startup.patch` holds the marks. Without the macro the
 * patch is inert, so the module that the branch ships does not change.
 *
 * Usage:
 *   node scripts/perf-core/startup/run_phases.cjs [--label 36ms] [--reps 9]
 *     [--module scripts/build-whisper/.build/instr]
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const { createServer } = require("../http_server.cjs");
const { launchBrowser, killBrowser } = require("../browser.cjs");
const { connectToPage } = require("../cdp_client.cjs");

const HERE = __dirname;
const PERF = path.resolve(HERE, "..");
const REPO = path.resolve(PERF, "..", "..");
const STAGE = path.join(HERE, ".stage-phases");
const RESULTS = path.join(PERF, "results");

const GUEST_DIR = "/working";

/**
 * The configurations.
 *
 * `app` is the one that matters: it is what `modules/simulator_worker.js`
 * sends when a user presses the run button, so its total is the figure that
 * `local/prog.md` reports as the time from the run message to the end of a
 * small program.
 *
 * `16mb` is the reference row. It gives whisper a 16 MB guest memory with
 * `--memorysize`, which is a run-time option. The application cannot use it
 * (the stack pointer of `index.html` is at the top of the 128 MB guest
 * memory), and the row exists to separate the cost of the guest memory from
 * everything else.
 */
const CONFIGS = [
  {
    key: "app",
    label: "C++ as the application starts it (128 MB guest memory)",
    args: (p) => ["--newlib", p, "--isa", "acdfim", "--setreg", "sp=0x7FFFFFC"],
  },
  {
    key: "64mb",
    label: "C++ with a 64 MB guest memory (not the application)",
    args: (p) => [
      "--newlib",
      p,
      "--isa",
      "acdfim",
      "--memorysize",
      "0x4000000",
      "--setreg",
      "sp=0x3FFFFFC",
    ],
  },
  {
    key: "16mb",
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
  {
    key: "4mb",
    label: "C++ with a 4 MB guest memory (not the application)",
    args: (p) => [
      "--newlib",
      p,
      "--isa",
      "acdfim",
      "--memorysize",
      "0x400000",
      "--setreg",
      "sp=0x3FFFFC",
    ],
  },
  // The floor of the sweep. 1 MiB is the smallest guest memory that holds
  // `probe.elf`, its stack and a newlib heap. It is not a configuration for a
  // real program: a student program with a few kilobytes of `malloc` needs
  // more. The row is here to show where the linear part of the startup ends.
  {
    key: "1mb",
    label: "C++ with a 1 MiB guest memory (not the application)",
    args: (p) => [
      "--newlib",
      p,
      "--isa",
      "acdfim",
      "--memorysize",
      "0x100000",
      "--setreg",
      "sp=0xFFFFC",
    ],
  },
];

/**
 * How the marks group into the phases of the report. Each entry is one row:
 * the time from the `from` mark to the `to` mark.
 *
 * A phase that contains other phases carries `parent: true`, so the report can
 * show the tree without counting a millisecond two times.
 */
const PHASES = [
  { name: "Fetch the ELF file", from: "js.t0", to: "js.elfFetched" },
  {
    name: "Fetch, compile and instantiate the module",
    from: "js.elfFetched",
    to: "js.preRun",
  },
  { name: "Write the ELF into MEMFS (preRun)", from: "js.preRun", to: "js.fsWritten" },
  {
    name: "The Emscripten runtime, up to main",
    from: "js.fsWritten",
    to: "main.enter",
  },
  { name: "main, up to the return", from: "main.enter", to: "js.postRun", parent: true },
  { name: "  parseCmdLineArgs (Boost)", from: "main.enter", to: "main.parseCmdLineArgs" },
  { name: "  expandTargets", from: "main.parseCmdLineArgs", to: "main.expandTargets" },
  { name: "  the configuration file", from: "main.expandTargets", to: "main.loadConfigFile" },
  {
    name: "  the register width (the ELF class)",
    from: "main.loadConfigFile",
    to: "main.registerWidth",
  },
  { name: "  session, up to the return", from: "session.enter", to: "js.postRun", parent: true },
  {
    name: "    the primary configuration",
    from: "session.enter",
    to: "session.primaryConfig",
  },
  {
    name: "    new System",
    from: "session.primaryConfig",
    to: "session.newSystem",
    parent: true,
  },
  {
    name: "      new Memory",
    from: "system.newMemory.begin",
    to: "system.newMemory.end",
    parent: true,
  },
  {
    name: "        the PMA table (the member list)",
    from: "system.newMemory.begin",
    to: "memory.ctorBody",
  },
  { name: "        mmap the guest memory", from: "memory.ctorBody", to: "memory.mmap" },
  // `patches/0007` adds the zero check. A module without that patch has no
  // `memory.zeroCheck` mark, and `fallbackFrom` keeps the row below correct for
  // both modules.
  {
    name: "        check that the buffer is zero",
    from: "memory.mmap",
    to: "memory.zeroCheck",
  },
  {
    name: "        the rest of Memory",
    from: "memory.zeroCheck",
    fallbackFrom: "memory.mmap",
    to: "system.newMemory.end",
  },
  {
    name: "      new Core and new Hart",
    from: "system.newMemory.end",
    to: "system.newCores.end",
    parent: true,
  },
  {
    name: "        the Core object and the CSR vector",
    from: "system.newMemory.end",
    to: "csRegs.ctorBody",
  },
  { name: "        the CSR table", from: "csRegs.ctorBody", to: "csRegs.defined" },
  {
    name: "        between the CSRs and the table",
    from: "csRegs.defined",
    to: "instTable.enter",
  },
  { name: "        setupInstVec", from: "instTable.enter", to: "instTable.setupInstVec" },
  {
    name: "        the instruction name map",
    from: "instTable.setupInstVec",
    to: "instTable.instMap",
  },
  { name: "        the rest of InstTable", from: "instTable.instMap", to: "instTable.end" },
  {
    name: "        the other Hart members",
    from: "instTable.end",
    to: "hart.ctorBody",
  },
  { name: "        the decode cache", from: "hart.ctorBody", to: "hart.decodeCache" },
  { name: "        the rest of the Hart body", from: "hart.decodeCache", to: "hart.ctorEnd" },
  {
    name: "        the vector of harts",
    from: "hart.ctorEnd",
    to: "system.newCores.end",
  },
  {
    name: "      the asserts of session",
    from: "system.newCores.end",
    to: "session.newSystem",
  },
  { name: "    configHarts", from: "session.newSystem", to: "session.configHarts" },
  { name: "    configMemory", from: "session.configHarts", to: "session.configMemory" },
  { name: "    openUserFiles", from: "session.configMemory", to: "session.openUserFiles" },
  { name: "    hart.reset", from: "session.openUserFiles", to: "session.hartReset" },
  {
    name: "    aleStart",
    from: "session.hartReset",
    to: "aleStart.end",
    parent: true,
  },
  {
    name: "      the newlib test (reads the ELF)",
    from: "apply.enter",
    to: "apply.newlibFromElf",
  },
  { name: "      the ISA string", from: "apply.newlibFromElf", to: "apply.isaString" },
  { name: "      load the ELF into the guest", from: "apply.isaString", to: "apply.loadElf" },
  { name: "      the hart options", from: "apply.loadElf", to: "apply.hartOptions" },
  {
    name: "      the program arguments (writes the stack)",
    from: "apply.hartOptions",
    to: "apply.programArgs",
  },
  { name: "      the rest of aleStart", from: "apply.programArgs", to: "aleStart.end" },
  { name: "    the tail of session", from: "aleStart.end", to: "js.postRun" },
  {
    name: "The first slice, up to the first instruction",
    from: "js.postRun",
    to: "js.firstMmio",
    parent: true,
  },
  { name: "  the slice call and the run setup", from: "js.postRun", to: "run.enter" },
  { name: "  the first three instructions", from: "run.enter", to: "js.firstMmio" },
  { name: "The rest of the program", from: "js.firstMmio", to: "run.loopEnd" },
  { name: "The report (Retired N instructions)", from: "run.loopEnd", to: "js.exit" },
  { name: "The tail of the run", from: "js.exit", to: "js.sliceEnd" },
];

function parseArgs(argv) {
  const opts = {
    label: "36ms-phases",
    reps: 9,
    module: path.join(REPO, "scripts", "build-whisper", ".build", "instr"),
  };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === "--label") opts.label = argv[++i];
    else if (a === "--reps") opts.reps = Number(argv[++i]);
    else if (a === "--module") opts.module = path.resolve(argv[++i]);
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

function stage(moduleDir) {
  fs.rmSync(STAGE, { recursive: true, force: true });
  fs.mkdirSync(STAGE, { recursive: true });

  for (const f of ["phases.html", "worker_cpp_phases.js", "probe.elf"]) {
    fs.copyFileSync(path.join(HERE, f), path.join(STAGE, f));
  }
  for (const f of ["whisper.js", "whisper.wasm"]) {
    const src = path.join(moduleDir, f);
    if (!fs.existsSync(src)) {
      throw new Error(
        `no ${f} in ${moduleDir}. Build it with:\n` +
          "  EXTRA_FLAGS=-DALE_TIME_STARTUP BUILD_TAG=instr NO_INSTALL=1 " +
          "scripts/build-whisper/build.sh",
      );
    }
    fs.copyFileSync(src, path.join(STAGE, f));
  }
}

/**
 * The browser binary that the harness actually launched, and its version.
 *
 * `browser.cjs` tries the system paths before the Playwright cache, so on a
 * machine with Google Chrome installed the harness uses that Chrome and not the
 * pinned Chromium of Playwright. The version then moves when Chrome updates
 * itself, and rule 7 of `local/optimize-whisper.md` asks for one browser build
 * in one comparison. The results file records what ran, so that a later reader
 * does not have to guess.
 */
function browserVersion(proc) {
  const bin = proc && proc.spawnfile ? proc.spawnfile : "unknown";
  let version = "unknown";
  try {
    version = execFileSync(bin, ["--version"], { encoding: "utf8" }).trim();
  } catch (e) {}
  return { binary: bin, version };
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

async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const probe = JSON.parse(
    fs.readFileSync(path.join(HERE, "probe.json"), "utf8"),
  );

  stage(opts.module);
  fs.mkdirSync(RESULTS, { recursive: true });

  const { server, port } = await createServer(STAGE);
  const browser = await launchBrowser("chrome");
  const browserInfo = browserVersion(browser.process);
  console.log(`browser: ${browserInfo.version}`);
  console.log(`         ${browserInfo.binary}`);
  let client;

  const samples = {};
  const stderrOf = {};
  const failures = [];

  try {
    client = await connectToPage(browser.port);
    await client.navigate(`http://127.0.0.1:${port}/phases.html`);
    await client.waitForReady();
    await client.waitForGlobal("harnessReady");

    for (const c of CONFIGS) samples[c.key] = [];

    for (let rep = 1; rep <= opts.reps; rep++) {
      for (const config of CONFIGS) {
        const args = config.args(`${GUEST_DIR}/${probe.file}`);
        const expr = `runPhases(${JSON.stringify(args)})`;
        const res = await client.evaluate(expr, true);
        const value = res && res.result ? res.result.value : null;

        if (!value || value.type !== "result") {
          const why = value ? value.error : "no value";
          failures.push(`${config.key} rep ${rep}: ${why}`);
          console.error(`  FAIL ${config.key} rep ${rep}: ${why}`);
          continue;
        }

        samples[config.key].push(value.marks);
        if (!stderrOf[config.key]) stderrOf[config.key] = value.stderr || [];
        const t = {};
        for (const m of value.marks) if (!(m.name in t)) t[m.name] = m.ms;
        console.log(
          `rep ${rep}  ${config.key.padEnd(6)} ` +
            `first inst ${(t["js.firstMmio"] - t["js.t0"]).toFixed(1).padStart(6)} ms  ` +
            `exit ${(t["js.exit"] - t["js.t0"]).toFixed(1).padStart(6)} ms  ` +
            `marks ${value.marks.length}`,
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

  /** The first time of each mark name in one repetition. */
  function timeMap(marks) {
    const t = {};
    for (const m of marks) if (!(m.name in t)) t[m.name] = m.ms;
    return t;
  }

  const summary = {};
  for (const c of CONFIGS) {
    const reps = samples[c.key];
    if (!reps.length) continue;
    const maps = reps.map(timeMap);

    const rows = [];
    for (const phase of PHASES) {
      const values = [];
      for (const t of maps) {
        const from = phase.from in t ? phase.from : phase.fallbackFrom;
        if (from && from in t && phase.to in t) values.push(t[phase.to] - t[from]);
      }
      rows.push({
        name: phase.name,
        parent: Boolean(phase.parent),
        from: phase.from,
        to: phase.to,
        median: values.length ? Number(median(values).toFixed(2)) : null,
        min: values.length ? Number(Math.min(...values).toFixed(2)) : null,
        max: values.length ? Number(Math.max(...values).toFixed(2)) : null,
        samples: values.length,
        values: values.map((v) => Number(v.toFixed(2))),
      });
    }

    const totals = maps.map((t) => t["js.sliceEnd"] - t["js.t0"]);
    const firstInst = maps.map((t) => t["js.firstMmio"] - t["js.t0"]);
    const exit = maps.map((t) => t["js.exit"] - t["js.t0"]);

    // What the leaf phases do not hold. Each phase below the 0.1 ms resolution
    // of the clock reads 0.00, and the sum of the leaves is therefore smaller
    // than the whole run. The residual is that sum, per repetition.
    const leaves = rows.filter((r) => !r.parent && r.median !== null);
    const residual = maps.map((t, i) => {
      let sum = 0;
      for (const r of leaves) sum += r.values[i] === undefined ? 0 : r.values[i];
      return t["js.sliceEnd"] - t["js.t0"] - sum;
    });

    summary[c.key] = {
      label: c.label,
      // What the module wrote to the standard error, from the first
      // repetition. `patches/0007` writes one `ALE_GUEST_ZERO` line there.
      stderr: stderrOf[c.key] || [],
      total: Number(median(totals).toFixed(2)),
      totals: totals.map((v) => Number(v.toFixed(2))),
      firstInst: Number(median(firstInst).toFixed(2)),
      exit: Number(median(exit).toFixed(2)),
      residual: Number(median(residual).toFixed(2)),
      rows,
      markNames: Object.keys(maps[0]),
    };
  }

  const record = {
    label: opts.label,
    commit: gitDescribe(),
    module: path.relative(REPO, opts.module),
    reps: opts.reps,
    node: process.version,
    platform: `${process.platform} ${process.arch}`,
    browser: browserInfo,
    probe,
    summary,
    failures,
  };

  const jsonPath = path.join(RESULTS, `${opts.label}.json`);
  fs.writeFileSync(jsonPath, JSON.stringify(record, null, 2) + "\n");

  const lines = [];
  lines.push(`# ${opts.label} — where the startup time goes`, "");
  lines.push(
    `Commit: \`${record.commit}\`  Module: \`${record.module}\`  ` +
      `Repetitions: ${opts.reps}`,
    "",
  );
  lines.push(`Browser: ${record.browser.version}`, "");
  for (const c of CONFIGS) {
    const s = summary[c.key];
    if (!s) continue;
    lines.push(`## ${s.label}`, "");
    lines.push(
      `To the first instruction: ${s.firstInst.toFixed(1)} ms. ` +
        `To the exit: ${s.exit.toFixed(1)} ms. ` +
        `The whole run: ${s.total.toFixed(1)} ms, of which ` +
        `${s.residual.toFixed(1)} ms is not in any leaf phase (each phase ` +
        `below the 0.1 ms resolution of the clock reads 0.00).`,
      "",
    );
    lines.push("| Phase | Median (ms) | Min | Max |");
    lines.push("| --- | --- | --- | --- |");
    for (const r of s.rows) {
      if (r.median === null) {
        lines.push(`| ${r.name} | (no mark) | | |`);
        continue;
      }
      const name = r.parent ? `**${r.name.trim()}**` : r.name;
      const indent = r.name.length - r.name.trimStart().length;
      lines.push(
        `| ${"&nbsp;".repeat(indent)}${name} | ${r.median.toFixed(2)} | ` +
          `${r.min.toFixed(2)} | ${r.max.toFixed(2)} |`,
      );
    }
    lines.push("");
  }
  if (failures.length) {
    lines.push("## Failures", "");
    failures.forEach((f) => lines.push(`- ${f}`));
  }

  const mdPath = path.join(RESULTS, `${opts.label}.md`);
  fs.writeFileSync(mdPath, lines.join("\n") + "\n");

  console.log("");
  console.log(lines.join("\n"));
  console.log(`wrote ${path.relative(REPO, jsonPath)}`);
  console.log(`wrote ${path.relative(REPO, mdPath)}`);

  if (failures.length) process.exitCode = 1;
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
