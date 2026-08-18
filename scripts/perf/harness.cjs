"use strict";

const fs = require("fs");
const path = require("path");
const { createServer } = require("./http_server.cjs");
const { launchBrowser, killBrowser } = require("./browser.cjs");
const { connectToPage } = require("./cdp_client.cjs");

// ─── CLI Parsing ───────────────────────────────────────────────────────────

function parseArgs(argv) {
  const args = {
    browser: "firefox",
    dry: false,
    noCompare: false,
    workloads: null,
    iterations: 1,
    timeout: 60000,
    failThreshold: null,
  };

  for (let i = 0; i < argv.length; i++) {
    switch (argv[i]) {
      case "--browser":
        args.browser = argv[++i];
        break;
      case "--fail-threshold":
        args.failThreshold = parseFloat(argv[++i]);
        break;
      case "--dry":
        args.dry = true;
        break;
      case "--no-compare":
        args.noCompare = true;
        break;
      case "--workloads":
        args.workloads = argv[++i];
        break;
      case "--iterations":
        args.iterations = parseInt(argv[++i], 10);
        break;
      case "--timeout":
        args.timeout = parseInt(argv[++i], 10);
        break;
      case "--help":
      case "-h":
        console.log(USAGE);
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${argv[i]}`);
        console.error(USAGE);
        process.exit(1);
    }
  }

  return args;
}

const USAGE = `Usage: node harness.cjs [options]

Options:
  --browser <firefox|chrome>   Browser to use (default: firefox)
  --dry                        Run benchmarks, report only, no save/compare
  --no-compare                 Save results, but don't compare to last run
  --workloads <path>           Path to workloads.json
  --iterations <n>             Run each workload N times, report median (default: 1)
  --timeout <ms>               Per-workload timeout in ms (default: 60000)
  --fail-threshold <pct>       Exit nonzero when a workload is more than <pct>
                               percent slower than the saved baseline
  --help                       Show this help

Exit status:
  0   every workload reported status "ok" and stayed within the threshold
  1   a workload failed to run, or regressed past --fail-threshold
`;

// ─── Paths ──────────────────────────────────────────────────────────────────

const PERF_DIR = __dirname;
const REPO_ROOT = path.resolve(PERF_DIR, "..", "..");
const WORKLOADS_DIR = path.join(PERF_DIR, "workloads");
const RESULTS_DIR = path.join(PERF_DIR, "results");
const LAST_RESULTS_FILE = path.join(RESULTS_DIR, "last.json");

// ─── Utility ───────────────────────────────────────────────────────────────

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function median(arr) {
  const sorted = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  if (sorted.length % 2 === 0) {
    return (sorted[mid - 1] + sorted[mid]) / 2;
  }
  return sorted[mid];
}

function base64Encode(data) {
  return Buffer.from(data).toString("base64");
}

// ─── Color ──────────────────────────────────────────────────────────────────

// `isTTY` is undefined when stdout is a pipe, so compare against true: piping
// the run into a file or a PR comment must not embed ANSI escape sequences.
const USE_COLOR = process.stdout.isTTY === true;

const COLORS = {
  reset: "\x1b[0m",
  green: "\x1b[32m",
  red: "\x1b[31m",
};

function colorize(text, color) {
  if (!USE_COLOR || !color) return text;
  return COLORS[color] + text + COLORS.reset;
}

// Regex to strip ANSI escape codes for visible-length calculations
const ANSI_RE = /\x1b\[[0-9;]*m/g;

/**
 * Return the visible length of a string, ignoring ANSI escape codes.
 * @param {string} str
 * @returns {number}
 */
function visibleLength(str) {
  return str.replace(ANSI_RE, "").length;
}

/**
 * Determine the color for a time delta.
 * Faster (negative delta) → green, slower (positive delta) → red,
 * roughly the same (within ±5%) → no color.
 * @param {number} delta - Absolute difference (current - previous).
 * @param {number} pct - Percentage difference.
 * @returns {string|null} - "green", "red", or null.
 */
function deltaColor(delta, pct) {
  if (Math.abs(pct) < 5) return null;
  return delta < 0 ? "green" : "red";
}

// ─── In-Page Measurement ───────────────────────────────────────────────────

/**
 * Build the in-page measurement function as a string.
 * This function runs inside the browser page context.
 * It reads from window.__perf_files__ and window.__perf_config__,
 * and stores the result in window.__perf_result__.
 */
const MEASUREMENT_FUNCTION = `
(async function() {
  window.__perf_result__ = null;

  var filesData = window.__perf_files__;
  var config = window.__perf_config__;

  // Create File objects from base64
  var files = filesData.map(function(f) {
    var binary = atob(f.content);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new File([bytes], f.name);
  });

  // Load files into simulator and compiler
  simulator_controller.load_files(files);
  compiler.set_file_array(simulator_controller.last_loaded_files);

  // Set up stdout/stderr collection
  var stdout = "";
  var stderr = "";
  var stdioCh = new BroadcastChannel("stdio_channel" + window.uniq_id);
  stdioCh.onmessage = function(e) {
    if (e.data.fh == 1) stdout += e.data.data;
    else if (e.data.fh == 2) stderr += e.data.data;
  };

  // Set stdin if provided
  if (config.stdin) {
    stdioCh.postMessage({fh: -1, init_stdin: true, data: config.stdin + "\\n"});
  }

  // Compile
  var t0 = performance.now();
  var filename = null;
  var compileError = null;
  try {
    filename = await compiler.auto_compile(".c", ".s", ".o", ".x");
  } catch (e) {
    compileError = e.message || String(e);
  }
  var t1 = performance.now();

  if (!filename) {
    // Try to find a pre-compiled ELF file
    for (var i = 0; i < simulator_controller.last_loaded_files.length; i++) {
      if (simulator_controller.last_loaded_files[i].name.endsWith(".x")) {
        filename = simulator_controller.last_loaded_files[i].name;
        break;
      }
    }
  }
  if (!filename && simulator_controller.last_loaded_files.length > 0) {
    filename = simulator_controller.last_loaded_files[0].name;
  }

  if (!filename) {
    stdioCh.close();
    window.__perf_result__ = JSON.stringify({
      compileTime: t1 - t0,
      execTime: 0,
      stdout: stdout,
      stderr: stderr,
      filename: null,
      compileError: compileError || "No file to execute",
      execError: null
    });
    return;
  }

  // Build execution args
  var args = ["/" + filename.replace(/ /g, "_")];
  if (config.newlib) {
    args.push("--newlib");
    args.push("--setreg", "sp=" + config.stack_pointer);
  }
  args.push("--isa", config.isa);

  // Execute with timeout
  var t2 = performance.now();
  var execError = null;
  var timedOut = false;
  try {
    await Promise.race([
      simulator_controller.start_execution(args),
      new Promise(function(_, reject) {
        setTimeout(function() {
          timedOut = true;
          reject(new Error("timeout"));
        }, config.timeout);
      })
    ]);
  } catch (e) {
    execError = e.message || String(e);
    try { simulator_controller.stop_execution(); } catch(e2) {}
  }
  var t3 = performance.now();

  // Wait a bit for final stdout/stderr flush
  await new Promise(function(r) { setTimeout(r, 500); });

  stdioCh.close();

  window.__perf_result__ = JSON.stringify({
    compileTime: t1 - t0,
    execTime: t3 - t2,
    stdout: stdout,
    stderr: stderr,
    filename: filename,
    compileError: compileError,
    execError: timedOut ? "timeout" : execError
  });
})();
`;

// ─── Workload Execution ─────────────────────────────────────────────────────

/**
 * Run a single workload iteration.
 * @param {object} client - CDPClient instance.
 * @param {object} workload - Workload definition.
 * @param {string} workloadsDir - Directory containing workload files.
 * @param {number} timeout - Timeout in ms.
 * @returns {Promise<object>} - Result { compileTime, execTime, stdout, stderr, status, error }
 */
async function runWorkload(client, workload, workloadsDir, timeout) {
  // Read and base64-encode all files
  const filesData = [];
  for (const fileName of workload.files) {
    let filePath = path.join(workloadsDir, fileName);
    if (!fs.existsSync(filePath)) {
      filePath = path.join(REPO_ROOT, fileName);
    }
    const content = fs.readFileSync(filePath);
    filesData.push({
      name: path.basename(fileName),
      content: base64Encode(content),
    });
  }

  // Set file data in the page
  const filesJson = JSON.stringify(filesData);
  const filesB64 = base64Encode(filesJson);
  await client.evaluate(
    `window.__perf_files__ = JSON.parse(atob("${filesB64}"));`,
  );

  // Set config in the page
  const config = {
    stdin: workload.stdin || "",
    isa: workload.isa || "imac",
    newlib: workload.newlib !== undefined ? workload.newlib : false,
    stack_pointer: workload.stack_pointer || "0x7FFFFFC",
    timeout: timeout,
  };
  const configB64 = base64Encode(JSON.stringify(config));
  await client.evaluate(
    `window.__perf_config__ = JSON.parse(atob("${configB64}"));`,
  );

  // Clear previous result
  await client.evaluate("window.__perf_result__ = null;");

  // Run the measurement function
  await client.evaluate(MEASUREMENT_FUNCTION);

  // Poll for result
  const resultStr = await client.pollForResult(
    "window.__perf_result__",
    200,
    timeout + 10000,
  );

  const result = JSON.parse(resultStr);

  // Determine status
  let status = "ok";
  if (result.compileError) status = "compile_error";
  else if (result.execError === "timeout") status = "timeout";
  else if (result.execError) status = "exec_error";
  else if (
    workload.expected_stdout !== undefined &&
    result.stdout !== workload.expected_stdout
  ) {
    status = "output_mismatch";
  }

  return {
    compileTime: result.compileTime || 0,
    execTime: result.execTime || 0,
    stdout: result.stdout || "",
    stderr: result.stderr || "",
    expectedStdout: workload.expected_stdout || "",
    stdoutMatch:
      workload.expected_stdout !== undefined
        ? result.stdout === workload.expected_stdout
        : null,
    status,
    error: result.compileError || result.execError || null,
  };
}

// ─── Result Storage & Comparison ────────────────────────────────────────────

function saveResults(results) {
  fs.mkdirSync(RESULTS_DIR, { recursive: true });
  fs.writeFileSync(LAST_RESULTS_FILE, JSON.stringify(results, null, 2));
}

function loadLastResults() {
  try {
    return JSON.parse(fs.readFileSync(LAST_RESULTS_FILE, "utf-8"));
  } catch (e) {
    return null;
  }
}

function printResultsTable(results) {
  console.log("\n" + "─".repeat(80));
  console.log(
    `Performance Results — ${results.browser} ${results.browser_version} — ${results.timestamp}`,
  );
  console.log("─".repeat(80));
  console.log(
    pad("Workload", 25) +
      padRight("Compile (ms)", 14) +
      padRight("Exec (ms)", 12) +
      padRight("Stdout", 8) +
      padRight("Status", 16),
  );
  console.log("─".repeat(80));

  for (const w of results.workloads) {
    const stdoutCol =
      w.stdout_match === true ? "✓" : w.stdout_match === false ? "✗" : "-";
    const statusColor = w.status === "ok" ? "green" : "red";
    console.log(
      pad(w.name, 25) +
        padRight(w.compile_time_ms.toFixed(1), 14) +
        padRight(w.exec_time_ms.toFixed(1), 12) +
        padRight(stdoutCol, 8) +
        padRight(colorize(w.status, statusColor), 16),
    );
  }
  console.log("─".repeat(80));
}

function printComparisonTable(current, last) {
  if (!last) {
    console.log("\n(No previous run to compare against)");
    return;
  }

  console.log("\n" + "═".repeat(90));
  console.log("Comparison with last run");
  console.log("═".repeat(90));
  console.log(
    pad("Workload", 25) +
      padRight("Compile (ms)", 14) +
      padRight("Exec (ms)", 12) +
      padRight("Compile Δ", 16) +
      padRight("Exec Δ", 16),
  );
  console.log("─".repeat(90));

  for (const w of current.workloads) {
    const prev = last.workloads.find((x) => x.name === w.name);
    if (!prev) {
      console.log(
        pad(w.name, 25) +
          padRight(w.compile_time_ms.toFixed(1), 14) +
          padRight(w.exec_time_ms.toFixed(1), 12) +
          padRight("(new)", 16) +
          padRight("(new)", 16),
      );
      continue;
    }

    const compileDelta = w.compile_time_ms - prev.compile_time_ms;
    const compilePct =
      prev.compile_time_ms !== 0
        ? (compileDelta / prev.compile_time_ms) * 100
        : 0;
    const execDelta = w.exec_time_ms - prev.exec_time_ms;
    const execPct =
      prev.exec_time_ms !== 0 ? (execDelta / prev.exec_time_ms) * 100 : 0;

    const compileDeltaStr = colorize(
      formatDelta(compileDelta, compilePct),
      deltaColor(compileDelta, compilePct),
    );
    const execDeltaStr = colorize(
      formatDelta(execDelta, execPct),
      deltaColor(execDelta, execPct),
    );

    console.log(
      pad(w.name, 25) +
        padRight(w.compile_time_ms.toFixed(1), 14) +
        padRight(w.exec_time_ms.toFixed(1), 12) +
        padRight(compileDeltaStr, 16) +
        padRight(execDeltaStr, 16),
    );
  }
  console.log("═".repeat(90));
}

function formatDelta(delta, pct) {
  const sign = delta >= 0 ? "+" : "";
  return `${sign}${delta.toFixed(1)} (${sign}${pct.toFixed(1)}%)`;
}

function pad(str, len) {
  str = String(str);
  const vlen = visibleLength(str);
  if (vlen >= len) return str;
  return str + " ".repeat(len - vlen);
}

function padRight(str, len) {
  str = String(str);
  const vlen = visibleLength(str);
  if (vlen >= len) return str;
  return str + " ".repeat(len - vlen);
}

// ─── Main ──────────────────────────────────────────────────────────────────

async function main() {
  const args = parseArgs(process.argv.slice(2));
  // Check for ws dependency
  try {
    require.resolve("ws");
  } catch (e) {
    console.error(
      "Error: 'ws' package not found.\n" +
        "Please run: npm install (or cd scripts/perf && npm install)",
    );
    process.exit(1);
  }

  // Load workloads
  const workloadsPath = args.workloads
    ? path.resolve(args.workloads)
    : path.join(WORKLOADS_DIR, "workloads.json");
  const workloadsDir = path.dirname(workloadsPath);

  let workloadDefs;
  try {
    workloadDefs = JSON.parse(fs.readFileSync(workloadsPath, "utf-8"));
  } catch (e) {
    console.error(
      `Error loading workloads from ${workloadsPath}: ${e.message}`,
    );
    process.exit(1);
  }

  console.log(`Performance Harness — RISC-V ALE`);
  console.log(`Browser: ${args.browser}`);
  console.log(`Workloads: ${workloadDefs.length}`);
  console.log(`Iterations: ${args.iterations}`);
  console.log(`Timeout: ${args.timeout}ms per workload`);
  console.log(`Dry run: ${args.dry}`);
  console.log(`Compare: ${!args.noCompare && !args.dry}`);

  // Start HTTP server
  console.log("\nStarting local HTTP server...");
  const { server: httpServer, port: httpPort } = await createServer(REPO_ROOT);
  console.log(`HTTP server: http://127.0.0.1:${httpPort}`);

  // Launch browser
  console.log(`\nLaunching ${args.browser}...`);
  let browserProc, browserPort;
  try {
    const result = await launchBrowser(args.browser);
    browserProc = result.process;
    browserPort = result.port;
  } catch (e) {
    console.error(`Failed to launch browser: ${e.message}`);
    httpServer.close();
    process.exit(1);
  }
  console.log(`Browser debugging port: ${browserPort}`);

  // Register cleanup handlers
  const cleanup = () => {
    killBrowser(browserProc);
    try {
      httpServer.close();
    } catch (e) {}
  };
  process.on("exit", cleanup);
  process.on("SIGINT", () => {
    cleanup();
    process.exit(130);
  });
  process.on("SIGTERM", () => {
    cleanup();
    process.exit(143);
  });
  process.on("uncaughtException", (err) => {
    console.error("Uncaught exception:", err);
    cleanup();
    process.exit(1);
  });

  // Connect to the page via WebDriver BiDi
  console.log("\nConnecting via WebDriver BiDi...");
  let client;
  try {
    client = await connectToPage(browserPort);
  } catch (e) {
    console.error(`Failed to connect via BiDi: ${e.message}`);
    cleanup();
    process.exit(1);
  }

  // Navigate to the ALE page
  const aleUrl = `http://127.0.0.1:${httpPort}/index.html`;
  console.log(`Navigating to ${aleUrl}...`);
  await client.navigate(aleUrl);

  // Wait for page to be ready
  console.log("Waiting for page to load...");
  await client.waitForReady(60000);

  // Wait for the ALE modules to be loaded
  console.log("Waiting for ALE modules to initialize...");
  await client.waitForGlobal("__ale_perf_ready__", 60000);
  console.log("ALE modules ready.");

  // Small stabilization delay
  await sleep(1000);

  // Run workloads
  const results = {
    timestamp: new Date().toISOString(),
    browser: args.browser,
    browser_version: client.browserVersion || "unknown",
    node_version: process.version,
    workloads: [],
  };

  for (let i = 0; i < workloadDefs.length; i++) {
    const wl = workloadDefs[i];
    console.log(
      `\n[${i + 1}/${workloadDefs.length}] ${wl.name}: ${wl.description || ""}`,
    );

    const compileTimes = [];
    const execTimes = [];
    let lastResult = null;

    for (let iter = 0; iter < args.iterations; iter++) {
      if (args.iterations > 1) {
        console.log(`  Iteration ${iter + 1}/${args.iterations}...`);
      }

      try {
        const result = await runWorkload(
          client,
          wl,
          workloadsDir,
          args.timeout,
        );
        compileTimes.push(result.compileTime);
        execTimes.push(result.execTime);
        lastResult = result;

        const iterStatusColor = result.status === "ok" ? "green" : "red";
        console.log(
          `  Compile: ${result.compileTime.toFixed(1)}ms  ` +
            `Exec: ${result.execTime.toFixed(1)}ms  ` +
            `Status: ${colorize(result.status, iterStatusColor)}`,
        );

        if (result.stdoutMatch === false) {
          console.log(`  Stdout: ${colorize("✗ mismatch", "red")}`);
          console.log(`    Expected: ${JSON.stringify(result.expectedStdout)}`);
          console.log(`    Got:      ${JSON.stringify(result.stdout)}`);
        } else if (result.stdoutMatch === true) {
          console.log(`  Stdout: ${colorize("✓ verified", "green")}`);
        }

        if (result.status !== "ok" && result.error) {
          console.log(`  Error: ${result.error}`);
        }
        if (result.stderr && result.status !== "ok") {
          console.log(`  Stderr: ${result.stderr.slice(0, 200)}`);
        }
      } catch (e) {
        console.error(`  Failed: ${e.message}`);
        lastResult = {
          compileTime: 0,
          execTime: 0,
          stdout: "",
          stderr: "",
          status: "harness_error",
          error: e.message,
        };
      }

      // Small delay between iterations
      if (iter < args.iterations - 1) {
        await sleep(500);
      }
    }

    const compileMedian = compileTimes.length > 0 ? median(compileTimes) : 0;
    const execMedian = execTimes.length > 0 ? median(execTimes) : 0;

    results.workloads.push({
      name: wl.name,
      compile_time_ms: compileMedian,
      exec_time_ms: execMedian,
      status: lastResult ? lastResult.status : "unknown",
      stdout: lastResult ? lastResult.stdout : "",
      stderr: lastResult ? lastResult.stderr : "",
      stdout_match: lastResult ? lastResult.stdoutMatch : null,
    });
  }

  // Print results
  printResultsTable(results);

  // Compare with last run
  const comparing = !args.dry && !args.noCompare;
  const baseline = comparing ? loadLastResults() : null;
  if (comparing) {
    printComparisonTable(results, baseline);
  }

  const failures = collectFailures(results, baseline, args.failThreshold);

  // Save results
  if (!args.dry) {
    saveResults(results);
    console.log(`\nResults saved to ${LAST_RESULTS_FILE}`);
  } else {
    console.log("\n(dry run — results not saved)");
  }

  // Cleanup
  client.close();
  cleanup();

  if (failures.length > 0) {
    console.log("\n" + "═".repeat(90));
    console.log("FAILED");
    for (const failure of failures) console.log("  " + failure);
    console.log("═".repeat(90));
    process.exit(1);
  }

  console.log("\nDone.");
  process.exit(0);
}

/**
 * Reasons this run should be considered a failure: any workload that did not
 * report "ok", and — when a threshold is set and a baseline exists — any
 * workload that got more than `threshold` percent slower.
 *
 * @returns {string[]} human-readable failure descriptions, empty when green.
 */
function collectFailures(results, baseline, threshold) {
  const failures = [];

  for (const w of results.workloads) {
    if (w.status !== "ok") {
      failures.push(
        `${w.name}: status "${w.status}"` + (w.stderr ? ` — ${w.stderr.trim()}` : ""),
      );
    } else if (w.stdout_match === false) {
      failures.push(`${w.name}: produced unexpected output`);
    }
  }

  if (results.workloads.length === 0) {
    failures.push("no workloads ran");
  }

  if (threshold === null || threshold === undefined || !baseline) {
    return failures;
  }

  for (const w of results.workloads) {
    const prev = baseline.workloads.find((x) => x.name === w.name);
    if (!prev) continue;
    for (const field of ["compile_time_ms", "exec_time_ms"]) {
      if (!prev[field]) continue;
      const pct = ((w[field] - prev[field]) / prev[field]) * 100;
      if (pct > threshold) {
        failures.push(
          `${w.name}: ${field} regressed ${pct.toFixed(1)}% ` +
            `(${prev[field].toFixed(1)}ms → ${w[field].toFixed(1)}ms, threshold ${threshold}%)`,
        );
      }
    }
  }

  return failures;
}

main().catch((err) => {
  console.error("Fatal error:", err);
  process.exit(1);
});
