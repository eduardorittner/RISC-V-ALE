/*jshint esversion: 6 */
"use strict";

/**
 * The C++ core (whisper) in a worker, timed instead of measured.
 *
 * This worker is a copy of `page/worker_cpp.js` with three timestamps added.
 * It is a separate file on purpose: rule 3 of `local/optimize-whisper.md` says
 * that no step may change how the benchmark harness measures, and the
 * benchmark harness must keep its own worker exactly as step 1 wrote it.
 *
 * The timestamps:
 *
 *   t0        the worker has the run message. Nothing is fetched yet.
 *   tImport   the ELF is fetched and `importScripts` is about to fetch,
 *             compile and instantiate the module. `main` runs inside that call.
 *   tReady    the `preRun` hook. Emscripten calls it after the instantiation
 *             and before `main`, so `tReady - tImport` is the fetch, the
 *             compile and the instantiation of the module, and nothing else.
 *   tFirstMmio the guest wrote to the MMIO window. `probe.elf` does that on
 *             its third instruction, so this is the time to the first
 *             instruction. `tFirstMmio - tReady` is the startup of the core
 *             itself: the instruction table, the CSRs, the decode cache, the
 *             guest memory and the program load.
 *   tExit     the core called `finishExec`, so the program is finished and the
 *             figure is printed.
 */

var simulator_sleep = [1, 1, 1];
var simulator_int_inst_delay = 1000;

var t0 = 0;
var tImport = 0;
var tReady = 0;
var tFirstMmio = 0;
var tExit = 0;

var mmio = {
  load: function () {
    return 0;
  },
  store: function () {
    if (!tFirstMmio) tFirstMmio = performance.now();
  },
};

/** Interrupts are off, as in the benchmark harness. */
var intController = {
  interrupt: 0,
  interruptEnabled: 0,
};

var syscall_emulator = {
  run: function () {
    return 0;
  },
};

function getStdin() {
  return -1;
}

function getInteractiveCommand() {
  return "";
}

var stderrLines = [];
var stdoutLines = [];
var resultSent = false;

function sendResult() {
  if (resultSent) return;
  resultSent = true;

  if (!tFirstMmio) {
    postMessage({
      type: "error",
      error: "the guest never wrote to the MMIO window",
      stderr: stderrLines,
      stdout: stdoutLines,
    });
    return;
  }

  postMessage({
    type: "result",
    // `wasmMemory` is a global of the Emscripten glue, and `importScripts`
    // evaluates that glue in the worker scope, so the reservation is readable
    // here. It is the same figure as the initial size in the memory section of
    // the `.wasm` file.
    memoryBytes:
      typeof wasmMemory !== "undefined" && wasmMemory
        ? wasmMemory.buffer.byteLength
        : null,
    fetchMs: tImport - t0,
    moduleMs: tReady - tImport,
    coreInitMs: tFirstMmio - tReady,
    firstInstMs: tFirstMmio - t0,
    exitMs: tExit - t0,
    runMs: tExit - tFirstMmio,
    stderr: stderrLines,
    stdout: stdoutLines,
  });
}

function finishExec() {
  tExit = performance.now();
  sendResult();
}

var elfBytes = null;
var elfPath = null;

function initFS() {
  // `preRun` runs after the instantiation and before `main`.
  tReady = performance.now();
  FS.init(null, null, null);
  FS.mkdir("/working");
  FS.writeFile(elfPath, elfBytes);
}

var Module = {
  arguments: [],
  preRun: [initFS],
  print: function (text) {
    stdoutLines.push(text);
  },
  printErr: function (text) {
    stderrLines.push(text);
  },
};

self.Module = Module;

onmessage = function (e) {
  var msg = e.data;
  if (msg.type !== "run") return;

  t0 = performance.now();
  elfPath = "/working/" + msg.elfName;

  fetch(msg.elfUrl)
    .then(function (r) {
      return r.arrayBuffer();
    })
    .then(function (buf) {
      elfBytes = new Uint8Array(buf);
      Module.arguments = msg.args;
      tImport = performance.now();
      importScripts(msg.moduleUrl);
    })
    .catch(function (err) {
      postMessage({ type: "error", error: String(err) });
    });
};
