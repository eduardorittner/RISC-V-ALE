/*jshint esversion: 6 */
"use strict";

/**
 * The C++ core (whisper) in a dedicated classic worker.
 *
 * The worker is one-shot, because the Emscripten module runs `main` at load
 * and stops the runtime at exit. The page starts a new worker for each
 * repetition.
 *
 * The globals below are the ones the `EM_JS` shims call by name. Section 13
 * of `local/rs-cpp.md` lists them. `Hart.cpp` calls `mmio`,
 * `simulator_sleep`, `simulator_int_inst_delay`, `intController` and
 * `finishExec`; `Syscall.cpp` calls `syscall_emulator` and `getStdin`;
 * `Interactive.cpp` calls `getInteractiveCommand`.
 */

/** Sleep durations for the interrupt, the read and the write paths. */
var simulator_sleep = [1, 1, 1];
var simulator_int_inst_delay = 1000;

/** No device is on the bus in the benchmark. */
var mmio = {
  load: function () {
    return 0;
  },
  store: function () {},
};

/**
 * Interrupts are off. `jsInterruptEnabled` therefore reports 0, and the run
 * loop of the core never reaches its `emscripten_sleep` call. This keeps the
 * measurement a core-against-core measurement.
 */
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

/** Every line the core wrote to stderr. The measured figure is in one of them. */
var stderrLines = [];
var stdoutLines = [];
var resultSent = false;

/**
 * The line `Hart::reportInstsPerSec` writes. The `inst/s` field comes from the
 * unrounded elapsed time, so it is the figure to read; the printed seconds
 * carry only two decimal places.
 */
var RETIRED_LINE = /Retired\s+(\d+)\s+instructions?\s+in\s+([\d.]+)s\s+(\d+)\s+inst\/s/;

function sendResult() {
  if (resultSent) return;
  resultSent = true;

  var line = null;
  for (var i = 0; i < stderrLines.length; i++) {
    if (RETIRED_LINE.test(stderrLines[i])) {
      line = stderrLines[i];
    }
  }

  if (!line) {
    postMessage({
      type: "error",
      error: "no 'Retired ... inst/s' line on stderr",
      stderr: stderrLines,
      stdout: stdoutLines,
    });
    return;
  }

  var m = RETIRED_LINE.exec(line);
  postMessage({
    type: "result",
    instructions: Number(m[1]),
    seconds: Number(m[2]),
    instPerSec: Number(m[3]),
    stderr: stderrLines,
    stdout: stdoutLines,
  });
}

/** `jsSimStop` calls this when the core has printed its figure. */
function finishExec() {
  sendResult();
}

var elfBytes = null;
var elfPath = null;

/** The Emscripten `preRun` hook. It puts the workload into the module file system. */
function initFS() {
  FS.init(null, null, null);
  FS.mkdir("/working");
  FS.writeFile(elfPath, elfBytes);
}

/**
 * The Emscripten `postRun` hook, which runs directly after `main`.
 *
 * A module without Asyncify (step 8 of `local/optimize-whisper.md`) does not
 * run the program inside `main`. `main` sets the session up and returns, and
 * the host then calls `_ale_run_slice(budget)`. A budget of 0 means no limit.
 *
 * Interrupts are off in the benchmark, so the core has no reason to stop: the
 * whole program runs inside one call. The figure that the core prints
 * therefore covers the same work as it did with Asyncify, and the two
 * measurements are comparable. A module with Asyncify has no
 * `_ale_run_slice`, and then this function does nothing.
 */
function aleRun() {
  if (typeof Module._ale_run_slice !== "function") return;
  var ALE_RAN = 1,
    ALE_WAIT = 2;
  var status = Module._ale_run_slice(0);
  while (status === ALE_RAN) {
    status = Module._ale_run_slice(0);
  }
  if (status === ALE_WAIT) {
    postMessage({
      type: "error",
      error: "the core waits for input, which a benchmark workload never does",
    });
  }
}

var Module = {
  arguments: [],
  preRun: [initFS],
  postRun: [aleRun],
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

  elfPath = "/working/" + msg.elfName;

  fetch(msg.elfUrl)
    .then(function (r) {
      return r.arrayBuffer();
    })
    .then(function (buf) {
      elfBytes = new Uint8Array(buf);
      Module.arguments = msg.args;
      // The module runs `main` as soon as it is instantiated.
      importScripts(msg.moduleUrl);
    })
    .catch(function (err) {
      postMessage({ type: "error", error: String(err) });
    });
};
