"use strict";

/**
 * The functional gate of section 7 of `local/optimize-whisper.md`.
 *
 * A step is complete only when these checks pass. The driver serves the
 * repository, opens `check.html` in headless Chromium and runs each guest
 * program on the real application worker (`modules/simulator_worker.js`) with
 * the real module (`modules/whisper.js` and `modules/whisper.wasm`).
 *
 * The checks:
 *
 *  2. The application. `hello.elf` writes to the terminal through the
 *     `--newlib` write syscall.
 *  3. MMIO. `mmio.elf` writes a value to `0xffff0010` through `jsWriteMMIO`,
 *     reads it back through `jsReadMMIO` and writes the byte to the terminal.
 *  4. Interrupts. `stdin.elf` waits for input with interrupts on, which is the
 *     `emscripten_sleep` path, and echoes the character it receives.
 *
 * Check 1 (the retired counts) is part of `run.cjs`.
 *
 * The ISA string and the stack pointer come from `index.html`, because that is
 * where the application takes them from: `run_simulator()` in
 * `assets/js/interface_elements.js` reads the ISA checkboxes and the
 * `so_stack_pointer_value` field, and pushes `--isa` and `--setreg sp=...` in
 * front of `simulator_controller.start_execution`. The default in
 * `modules/simulator_worker.js` is only a fallback.
 *
 * The stack pointer matters to this gate from step 5 of the plan. It is
 * 0x7FFFFFC, which is the top of the 128 MB guest memory of whisper, so it is
 * the highest guest address the application uses. A gate that used a low stack
 * pointer would not find a memory that is too small.
 *
 * Usage:
 *   node scripts/perf-core/checks/run_checks.cjs
 */

const fs = require("fs");
const path = require("path");

const HERE = __dirname;
const PERF = path.resolve(HERE, "..");
const REPO = path.resolve(PERF, "..", "..");

const { createServer } = require(path.join(PERF, "http_server.cjs"));
const { launchBrowser, killBrowser } = require(path.join(PERF, "browser.cjs"));
const { connectToPage } = require(path.join(PERF, "cdp_client.cjs"));

/** The character the interrupt check sends to the guest. */
const STDIN_CHAR = "K";

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

/**
 * The ISA string the application builds, read from the checkbox defaults of
 * `index.html`. `get_checked_ISAs` appends the letters in this order.
 */
function isaStringFromIndexHtml() {
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  let isa = "";
  for (const letter of ["a", "c", "d", "f", "i", "m", "s", "u"]) {
    const id = `config_isa${letter.toUpperCase()}`;
    const tag = new RegExp(`<input[^>]*id="${id}"[^>]*>`).exec(html);
    if (!tag) throw new Error(`no checkbox with id ${id} in index.html`);
    if (/\schecked(=|\s|>)/.test(tag[0])) isa += letter;
  }
  return isa;
}

/**
 * The stack pointer the application starts a program with, read from the
 * `so_stack_pointer_value` field of `index.html`.
 */
function stackPointerFromIndexHtml() {
  const html = fs.readFileSync(path.join(REPO, "index.html"), "utf8");
  const tag = /<input[^>]*id="so_stack_pointer_value"[^>]*>/.exec(html);
  if (!tag) throw new Error("no so_stack_pointer_value field in index.html");
  const value = /\svalue="([^"]+)"/.exec(tag[0]);
  if (!value) throw new Error("so_stack_pointer_value has no default value");
  return value[1];
}

async function main() {
  const manifest = JSON.parse(
    fs.readFileSync(path.join(HERE, "programs", "manifest.json"), "utf8"),
  );
  const isa = isaStringFromIndexHtml();
  const sp = stackPointerFromIndexHtml();
  console.log(`The application starts with --isa ${isa} and sp=${sp}\n`);

  const { server, port } = await createServer(REPO);
  const browser = await launchBrowser("chrome");
  let client;
  const results = [];

  try {
    client = await connectToPage(browser.port);
    await client.navigate(
      `http://127.0.0.1:${port}/scripts/perf-core/checks/check.html`,
    );
    await client.waitForReady();
    await client.waitForGlobal("checksReady");

    for (const p of manifest.programs) {
      const isStdin = p.name === "stdin";
      const opts = {
        elfUrl: `/scripts/perf-core/checks/programs/${p.file}`,
        elfName: p.file,
        args: [
          "--newlib",
          `/working/${p.file}`,
          "--setreg",
          `sp=${sp}`,
          "--isa",
          isa,
        ],
        // The interrupt check is the one that must run with interrupts on.
        interrupts: isStdin,
        timeoutMs: 60000,
      };
      if (isStdin) {
        opts.stdin = STDIN_CHAR;
        opts.stdinAfterMs = 1500;
      }

      const res = await client.evaluate(
        `runCheck(${JSON.stringify(opts)})`,
        true,
      );
      const out = res && res.result ? res.result.value : null;
      results.push({ name: p.name, describe: p.describe, out });
    }
  } finally {
    if (client) client.close();
    killBrowser(browser.process);
    server.close();
    await sleep(200);
  }

  // ─── Verdicts ─────────────────────────────────────────────────────────────

  let failures = 0;
  for (const r of results) {
    const out = r.out || {};
    const stdout = (out.stdout || "").trim();
    let ok = false;
    let why = "";

    if (!out.finished) {
      why = out.timedOut ? "the program did not stop before the timeout" : "the program did not report that it finished";
    } else if (r.name === "hello") {
      ok = stdout.includes("Hello, RISC-V ALE!");
      why = ok ? "" : `stdout was ${JSON.stringify(stdout)}`;
    } else if (r.name === "mmio") {
      const expectByte = String.fromCharCode(manifest.mmio.value);
      const offset = manifest.mmio.address & 0xffff;
      const stored = out.mmio ? out.mmio[String(offset)] : undefined;
      ok = stdout.includes(expectByte) && stored === manifest.mmio.value;
      why = ok
        ? ""
        : `stdout was ${JSON.stringify(stdout)}, the host saw ` +
          `mmio[0x${offset.toString(16)}] = ${stored}`;
    } else if (r.name === "stdin") {
      ok = stdout.includes(STDIN_CHAR);
      why = ok ? "" : `stdout was ${JSON.stringify(stdout)}`;
    }

    if (!ok) failures++;
    console.log(
      `${ok ? "PASS" : "FAIL"}  ${r.name.padEnd(7)} ${r.describe}` +
        (ok ? "" : `\n        ${why}`),
    );
    if (!ok && out.stderr) {
      console.log(`        stderr: ${JSON.stringify(out.stderr.slice(0, 400))}`);
    }
    if (!ok && out.logs && out.logs.length) {
      console.log(`        logs: ${JSON.stringify(out.logs).slice(0, 600)}`);
    }
  }

  const record = {
    isa,
    results: results.map((r) => ({
      name: r.name,
      stdout: r.out ? r.out.stdout : null,
      stderr: r.out ? r.out.stderr : null,
      mmio: r.out ? r.out.mmio : null,
      finished: r.out ? r.out.finished : false,
    })),
  };
  fs.mkdirSync(path.join(PERF, "results"), { recursive: true });
  fs.writeFileSync(
    path.join(PERF, "results", "functional-checks.json"),
    JSON.stringify(record, null, 2) + "\n",
  );

  console.log("");
  if (failures) {
    console.error(`${failures} functional check(s) failed.`);
    process.exitCode = 1;
  } else {
    console.log("All functional checks pass.");
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
