/*jshint esversion: 6 */
"use strict";

/**
 * The C++ core (whisper) in a worker, with every startup phase timed.
 *
 * `worker_cpp.js` of this directory divides the time to the first instruction
 * into two parts: the module (fetch, compile, instantiate) and the core
 * startup. The core startup is the largest part and it is one number there.
 * This worker divides it further.
 *
 * It needs a module that `-DALE_TIME_STARTUP` built. That module records a
 * mark at each phase of its own startup and writes one
 * `ALE_TIME <name> <ms>` line for each mark after the program ends. The clock
 * is `emscripten_get_now()`, which Emscripten implements as
 * `performance.now()`, so a mark of the module and a timestamp of this worker
 * are on one clock with one origin.
 *
 * The worker adds the timestamps that only JavaScript can take:
 *
 *   js.t0          the worker has the run message. Nothing is fetched yet.
 *   js.elfFetched  the ELF is in memory and `importScripts` is about to start.
 *   js.preRun      the Emscripten `preRun` hook. The module is instantiated.
 *   js.fsWritten   `preRun` is finished: the ELF is in MEMFS.
 *   js.postRun     the Emscripten `postRun` hook, so `main` has returned.
 *   js.firstMmio   the guest wrote to the MMIO window, on its third
 *                  instruction. This is the time to the first instruction.
 *   js.exit        the core called `finishExec`.
 *   js.sliceEnd    `_ale_run_slice` returned for the last time.
 */

var simulator_sleep = [1, 1, 1];
var simulator_int_inst_delay = 1000;

var marks = [];

function jsMark(name) {
  marks.push({ name: name, ms: performance.now() });
}

var mmio = {
  load: function () {
    return 0;
  },
  store: function () {
    if (!mmioSeen) {
      mmioSeen = true;
      jsMark("js.firstMmio");
    }
  },
};
var mmioSeen = false;

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

  // The module writes its marks to the standard error after the program ends.
  var moduleMarks = [];
  for (var i = 0; i < stderrLines.length; i++) {
    var parts = String(stderrLines[i]).split(" ");
    if (parts[0] === "ALE_TIME" && parts.length >= 3) {
      moduleMarks.push({ name: parts[1], ms: Number(parts[2]) });
    }
  }

  if (!mmioSeen) {
    postMessage({
      type: "error",
      error: "the guest never wrote to the MMIO window",
      stderr: stderrLines,
      stdout: stdoutLines,
    });
    return;
  }

  if (!moduleMarks.length) {
    postMessage({
      type: "error",
      error:
        "the module wrote no ALE_TIME line: it was not built with " +
        "-DALE_TIME_STARTUP",
      stderr: stderrLines,
      stdout: stdoutLines,
    });
    return;
  }

  postMessage({
    type: "result",
    memoryBytes:
      typeof wasmMemory !== "undefined" && wasmMemory
        ? wasmMemory.buffer.byteLength
        : null,
    marks: marks.concat(moduleMarks).sort(function (a, b) {
      return a.ms - b.ms;
    }),
    stderr: stderrLines.filter(function (l) {
      return String(l).indexOf("ALE_TIME ") !== 0;
    }),
    stdout: stdoutLines,
  });
}

function finishExec() {
  jsMark("js.exit");
  // The result goes out after the slice returns, so that the dump of the
  // module marks (which happens inside the slice) is already in stderrLines.
}

var elfBytes = null;
var elfPath = null;

function initFS() {
  jsMark("js.preRun");
  FS.init(null, null, null);
  FS.mkdir("/working");
  FS.writeFile(elfPath, elfBytes);
  jsMark("js.fsWritten");
}

function aleRun() {
  jsMark("js.postRun");
  if (typeof Module._ale_run_slice !== "function") {
    postMessage({
      type: "error",
      error: "the module has no _ale_run_slice: it was built with Asyncify",
    });
    return;
  }
  var status = Module._ale_run_slice(0);
  while (status === 1) {
    status = Module._ale_run_slice(0);
  }
  jsMark("js.sliceEnd");
  sendResult();
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

  jsMark("js.t0");
  elfPath = "/working/" + msg.elfName;

  fetch(msg.elfUrl)
    .then(function (r) {
      return r.arrayBuffer();
    })
    .then(function (buf) {
      elfBytes = new Uint8Array(buf);
      Module.arguments = msg.args;
      jsMark("js.elfFetched");
      importScripts(msg.moduleUrl);
    })
    .catch(function (err) {
      postMessage({ type: "error", error: String(err) });
    });
};
