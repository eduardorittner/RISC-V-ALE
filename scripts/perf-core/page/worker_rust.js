/*jshint esversion: 6 */
"use strict";

/**
 * The Rust core (`riscv-rs`) in a dedicated classic worker.
 *
 * The Rust module is a fixture. It is the control: it runs in every benchmark
 * session, so the target figures move with the machine. Section 5 of
 * `local/optimize-whisper.md` gives the rule.
 *
 * This worker stays alive across the repetitions, which the C++ worker cannot
 * do. The difference is not a convenience. It is what each core does in the
 * application:
 *
 *  - The Rust core runs one `run_slice` call for each slice of a `setTimeout`
 *    chain (`modules/simulator_worker.js` on main), so a long program calls
 *    the function many times. V8 compiles a WebAssembly function with the
 *    baseline tier (Liftoff) on the first call and with the optimizing tier
 *    (TurboFan) after that, and it does not replace the code of a call that
 *    is already running. The first `run_slice` call is therefore a baseline
 *    figure and every later call is an optimized figure. Measured on this
 *    machine: 133 MIPS on the first call and 225 MIPS after it.
 *  - The C++ core runs its whole program inside one `main` call, so the
 *    harness must start a new worker for each repetition. Its inner loop
 *    calls many small functions millions of times, and V8 optimizes those
 *    callees while the outer loop runs, so the C++ core reaches its
 *    optimized speed inside one run.
 *
 * Section 13 of `local/rs-cpp.md` describes the same arrangement. The globals
 * below are the ones the module resolves by name;
 * `crates/riscv-rs/src/host_imports.rs` declares them.
 */

var mmio = {
  load: function () {
    return 0;
  },
  store: function () {},
};

/** Interrupts are off, in the same way as in the C++ worker. */
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

/** The wasm-bindgen namespace, after `importScripts` has declared it. */
var bindgen = null;

/**
 * Load the glue and the module one time. `importScripts` declares
 * `wasm_bindgen`, so a second call in the same worker throws.
 */
function ensureModule(msg) {
  if (bindgen) return Promise.resolve();
  return fetch(msg.wasmUrl)
    .then(function (r) {
      return r.arrayBuffer();
    })
    .then(function (wasmBytes) {
      importScripts(msg.glueUrl);
      bindgen =
        typeof wasm_bindgen !== "undefined" ? wasm_bindgen : self.wasm_bindgen;
      var wasmExports = bindgen.initSync(new WebAssembly.Module(wasmBytes));
      self.wasmMemory = wasmExports.memory;
    });
}

onmessage = function (e) {
  var msg = e.data;
  if (msg.type !== "run") return;

  ensureModule(msg)
    .then(function () {
      return fetch(msg.elfUrl).then(function (r) {
        return r.arrayBuffer();
      });
    })
    .then(function (elfBuffer) {
      var sim = new bindgen.Simulator();
      sim.load_binary(new Uint8Array(elfBuffer), msg.args);

      // One slice with an unlimited budget, so the measured region is the
      // inner loop and not the slice scheduler. Program load is not on the
      // clock.
      var t0 = performance.now();
      var outcome = sim.run_slice(0xffffffff);
      var t1 = performance.now();
      sim.free();

      var seconds = (t1 - t0) / 1000;
      postMessage({
        type: "result",
        instructions: outcome.steps,
        seconds: seconds,
        instPerSec: Math.round(outcome.steps / seconds),
        status: outcome.status,
        stdout: stdoutText,
        stderr: stderrText,
      });
    })
    .catch(function (err) {
      postMessage({
        type: "error",
        error: String(err && err.stack ? err.stack : err),
      });
    });
};
