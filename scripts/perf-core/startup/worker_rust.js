/*jshint esversion: 6 */
"use strict";

/**
 * The Rust core (`riscv-rs`) in a worker, timed instead of measured.
 *
 * This is the control for the startup metric, in the same way that the Rust
 * core is the control for the throughput metric. The module is the same
 * fixture that `page/worker_rust.js` uses.
 *
 * The difference from the benchmark worker: this worker is new for each
 * repetition. A startup measurement must be a cold start, and the second
 * repetition in one worker would find the module already compiled and
 * instantiated. The throughput harness keeps one Rust worker for the whole
 * session, and `page/worker_rust.js` says why that is right for throughput.
 *
 * The timestamps have the same meaning as in `worker_cpp.js`: `firstInstMs`
 * ends when the guest writes to the MMIO window, which `probe.elf` does on its
 * third instruction.
 */

var t0 = 0;
var tImport = 0;
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

var intController = {
  interrupt: 0,
  interruptEnabled: 0,
};

var stdoutText = [];
var stderrText = [];

var stdout_decoder = new TextDecoder("utf-8", { fatal: false });
var stderr_decoder = new TextDecoder("utf-8", { fatal: false });

function jsPrint(msg) {
  stdoutText.push(msg);
}

function jsPrintErr(msg) {
  stderrText.push(msg);
}

function jsWriteStdout(bytes) {
  jsPrint(stdout_decoder.decode(bytes, { stream: true }));
}

function jsWriteStderr(bytes) {
  jsPrintErr(stderr_decoder.decode(bytes, { stream: true }));
}

function jsExternalInterrupt() {
  return intController.interrupt;
}

function jsInterruptEnabled() {
  return intController.interruptEnabled;
}

function jsGetIntInstDelay() {
  return 1000;
}

function jsReadMMIO(addr, size) {
  return mmio.load(addr, size);
}

function jsWriteMMIO(addr, size, val) {
  mmio.store(addr, size, val);
}

function readFromStdin() {
  return -1;
}

function readInteractiveCommand() {
  return 0;
}

function customSyscall() {
  return 0;
}

function notifyUnknownSyscall() {}

self.jsPrint = jsPrint;
self.jsPrintErr = jsPrintErr;
self.jsWriteStdout = jsWriteStdout;
self.jsWriteStderr = jsWriteStderr;
self.jsExternalInterrupt = jsExternalInterrupt;
self.jsInterruptEnabled = jsInterruptEnabled;
self.jsGetIntInstDelay = jsGetIntInstDelay;
self.jsReadMMIO = jsReadMMIO;
self.jsWriteMMIO = jsWriteMMIO;
self.readFromStdin = readFromStdin;
self.readInteractiveCommand = readInteractiveCommand;
self.customSyscall = customSyscall;
self.notifyUnknownSyscall = notifyUnknownSyscall;

onmessage = function (e) {
  var msg = e.data;
  if (msg.type !== "run") return;

  t0 = performance.now();

  fetch(msg.elfUrl)
    .then(function (r) {
      return r.arrayBuffer();
    })
    .then(function (elfBuffer) {
      return fetch(msg.wasmUrl)
        .then(function (r) {
          return r.arrayBuffer();
        })
        .then(function (wasmBytes) {
          tImport = performance.now();
          importScripts(msg.glueUrl);
          var bindgen =
            typeof wasm_bindgen !== "undefined"
              ? wasm_bindgen
              : self.wasm_bindgen;
          var wasmExports = bindgen.initSync(new WebAssembly.Module(wasmBytes));
          self.wasmMemory = wasmExports.memory;
          // The module is instantiated. This is the same point as the `preRun`
          // hook of the C++ worker.
          var tReady = performance.now();

          var sim = new bindgen.Simulator();
          sim.load_binary(new Uint8Array(elfBuffer), msg.args);
          sim.run_slice(0xffffffff);
          tExit = performance.now();
          sim.free();

          if (!tFirstMmio) {
            postMessage({
              type: "error",
              error: "the guest never wrote to the MMIO window",
              stderr: stderrText,
              stdout: stdoutText,
            });
            return;
          }

          postMessage({
            type: "result",
            memoryBytes: self.wasmMemory.buffer.byteLength,
            fetchMs: tImport - t0,
            moduleMs: tReady - tImport,
            coreInitMs: tFirstMmio - tReady,
            firstInstMs: tFirstMmio - t0,
            exitMs: tExit - t0,
            runMs: tExit - tFirstMmio,
            stderr: stderrText,
            stdout: stdoutText,
          });
        });
    })
    .catch(function (err) {
      postMessage({
        type: "error",
        error: String(err && err.stack ? err.stack : err),
      });
    });
};
