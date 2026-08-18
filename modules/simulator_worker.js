/*jshint esversion: 6 */

var stdinBuffer = new Uint8Array([]);
var non_blocking_io = false;
var interactiveBufferString = "";
var syscall_delay = 0;
var simulator_int_inst_delay = 1000;
/** @type {WebAssembly.Module | null} */
var precompiledRiscvModule = null;

// Debug settings live in the worker, not in the WASM simulator: the user sets
// them before a program is loaded, and `load_binary` builds a fresh CPU that
// knows nothing about them.
var debug_mode_enabled = false;
var breakpoints = new Set();
/** True once `pkg/riscv_rs.js` has been imported into this worker. */
var wasm_glue_loaded = false;

// ─── Run slice scheduler ────────────────────────────────────────────────────
//
// A run is a chain of short `run_slice` calls joined by `setTimeout`, so the
// worker keeps answering messages while a guest program runs. Without it a
// single `run_full` call owns the thread until the program stops, and an
// infinite loop in guest code wedges the worker for ever.

/** True between the start of a run and the moment it finishes or stops. */
var run_active = false;
/** True while a `run_pause` holds the slice chain. */
var run_paused = false;
/** True when the chain must not restart (breakpoint, guard, failure). */
var run_stopped = false;
/** Instructions executed in the current run, across all slices. */
var run_total_instructions = 0;

/** Instructions per slice. Adapted so one slice lands in the target window. */
var slice_budget = 200000;
/** Delay between slices, in milliseconds. */
var slice_delay = 0;
/** True while the frequency limiter drives the budget instead of the timer. */
var freq_limited = false;

// A slice should take between these two values, in milliseconds: short enough
// that the worker answers a message well inside one frame, long enough that the
// scheduler is not a measurable part of the run.
const SLICE_TARGET_MIN_MS = 8;
const SLICE_TARGET_MAX_MS = 16;
const SLICE_TARGET_MID_MS = 12;
const SLICE_BUDGET_MIN = 10000;
const SLICE_BUDGET_MAX = 20000000;
/** Instruction total after which a run is treated as an infinite loop. */
const RUN_INSTRUCTION_LIMIT = 2000000000;

/**
 * The only way this worker talks to the main thread. The parameter type is what
 * makes a message the main thread does not handle a compile error.
 *
 * @param {SimulatorToMainMessage} msg
 */
function post(msg) {
  postMessage(msg);
}

/**
 * The `default` branch of an exhaustive switch over an IPC union. A member no
 * case handles gives `value` a real type in place of `never`, and `tsc` fails.
 *
 * @param {never} value
 */
function assert_unreachable(value) {
  console.error("Unhandled IPC message:", value);
}

onmessage = function (e) {
  /** @type {MainToSimulatorMessage} */
  const msg = e.data;
  switch (msg.type) {
    case "init_modules":
      precompiledRiscvModule = msg.riscvModule || msg.whisperModule;
      break;
    case "stdin":
      let new_stdin = new TextEncoder().encode(msg.stdin);
      let new_stdin_buffer = new Uint8Array(
        new_stdin.length + stdinBuffer.length,
      );
      new_stdin_buffer.set(stdinBuffer);
      new_stdin_buffer.set(new_stdin, stdinBuffer.length);
      stdinBuffer = new_stdin_buffer;
      break;
    case "non_blocking_io":
      non_blocking_io = msg.value;
      break;
    case "interactive":
      interactiveBufferString += msg.cmd;
      break;
    case "interrupt":
      intController.changeState(msg.state);
      break;
    case "add_files":
      files = msg.files;
      break;
    case "start":
      self.execFinished = false;
      self.executionStartTime = performance.now();
      Module.arguments = msg.args;
      if (msg.args.includes("--interactive")) {
        post({
          type: "status",
          status: { running: true, debugging: true },
        });
      } else {
        post({ type: "status", status: { running: true } });
      }
      runSimulation();
      break;

    case "sync":
      bus_sync.merge(msg.buffer);
      break;

    case "load_syscall":
      syscall_emulator.register(Number(msg.number), msg.code);
      if (typeof wasmSimulator !== "undefined" && wasmSimulator) {
        wasmSimulator.set_has_custom_syscalls(true);
      }
      break;

    case "disable_syscall":
      syscall_emulator.unregister(Number(msg.number));
      if (typeof wasmSimulator !== "undefined" && wasmSimulator) {
        wasmSimulator.set_has_custom_syscalls(syscall_emulator.has_syscalls());
      }
      break;

    case "interrupt_enabled":
      intController.interrupt_enabled = msg.value;
      break;

    case "set_freq_limit":
      let value = msg.value;
      if (value >= 1000) {
        freq_limited = false;
        syscall_delay = 0;
        slice_delay = 0;
        slice_budget = Math.max(SLICE_BUDGET_MIN, slice_budget);
      } else {
        // One slice every 16 ms carries the instructions the requested
        // frequency allows in that interval.
        freq_limited = true;
        syscall_delay = 30;
        slice_delay = 16;
        slice_budget = Math.max(1, Math.round(value * 0.016));
      }
      break;
    case "set_int_delay":
      simulator_int_inst_delay = msg.value;
      break;

    // The debug mode and the breakpoints are worker state, not simulator state:
    // the user sets them before a program exists, and they must survive the
    // next `load_binary`. They are recorded here and replayed in
    // `setupSimulation`.
    case "debug_enable":
      debug_mode_enabled = msg.enabled;
      if (typeof wasmSimulator !== "undefined" && wasmSimulator) {
        wasmSimulator.set_debug_mode(msg.enabled);
      }
      post({ type: "debug_status", enabled: msg.enabled });
      break;

    case "debug_set_bp":
      if (msg.active) {
        breakpoints.add(msg.addr);
      } else {
        breakpoints.delete(msg.addr);
      }
      if (typeof wasmSimulator !== "undefined" && wasmSimulator) {
        if (msg.active) {
          wasmSimulator.add_breakpoint(msg.addr);
        } else {
          wasmSimulator.remove_breakpoint(msg.addr);
        }
      }
      post({
        type: "debug_bp_updated",
        addr: msg.addr,
        active: msg.active,
      });
      break;

    case "debug_clear_bps":
      breakpoints.clear();
      if (typeof wasmSimulator !== "undefined" && wasmSimulator) {
        wasmSimulator.clear_breakpoints();
      }
      break;

    case "debug_step":
      with_simulator((sim) =>
        post({ type: "debug_state", state: sim.debug_step() }),
      );
      break;

    case "debug_step_over":
      with_simulator((sim) =>
        post({ type: "debug_state", state: sim.debug_step_over() }),
      );
      break;

    case "debug_step_out":
      with_simulator((sim) =>
        post({ type: "debug_state", state: sim.debug_step_out() }),
      );
      break;

    case "debug_continue":
      with_simulator((sim) =>
        post({ type: "debug_state", state: sim.run_until_breakpoint() }),
      );
      break;

    case "debug_pause":
    case "run_pause":
      pause_run();
      break;

    case "run_resume":
      resume_run();
      break;

    case "debug_read_mem":
      with_simulator((sim) =>
        post({
          type: "debug_mem_data",
          addr: msg.addr,
          bytes: Array.from(sim.read_memory_range(msg.addr, msg.len)),
        }),
      );
      break;

    case "debug_poke_reg":
      with_simulator((sim) => {
        sim.write_register(msg.reg, msg.val);
        post({
          type: "debug_state",
          state: sim.get_snapshot_js(false, 0),
        });
      });
      break;

    case "debug_poke_mem":
      with_simulator((sim) => {
        sim.write_memory_byte(msg.addr, msg.val);
        post({
          type: "debug_mem_data",
          addr: msg.addr,
          bytes: Array.from(sim.read_memory_range(msg.addr, 64)),
        });
      });
      break;

    case "debug_disasm":
      with_simulator((sim) =>
        post({
          type: "debug_disasm_data",
          items: sim.disassemble_range(msg.addr, msg.len),
        }),
      );
      break;

    case "debug_get_snapshot":
      with_simulator((sim) =>
        post({
          type: "debug_state",
          state: sim.get_snapshot_js(false, 0),
        }),
      );
      break;

    default:
      assert_unreachable(msg);
  }
};

/**
 * Run `handler` against the loaded simulator, or answer that no program is
 * loaded. No debug command may fail in silence.
 *
 * @param {(sim: any) => void} handler
 */
function with_simulator(handler) {
  if (typeof wasmSimulator === "undefined" || !wasmSimulator) {
    post({ type: "debug_error", reason: "no_program" });
    return;
  }
  handler(wasmSimulator);
}

class MMIO {
  constructor(size) {
    this.sharedBuffer = new ArrayBuffer(size);
    this.memory = [];
    this.memory[1] = new Uint8Array(this.sharedBuffer);
    this.memory[2] = new Uint16Array(this.sharedBuffer);
    this.memory[4] = new Uint32Array(this.sharedBuffer);
    this.size = this.sharedBuffer.byteLength;
  }

  load(addr, size) {
    addr &= 0xffff;
    if (addr > this.size) {
      post({
        type: "sim_log",
        subtype: "error",
        msg: "MMIO Access Error",
      });
    }
    return this.memory[size][(addr / size) | 0];
  }

  store(addr, size, value) {
    addr &= 0xffff;
    if (addr > this.size) {
      post({
        type: "sim_log",
        subtype: "error",
        msg: "MMIO Access Error",
      });
    }
    this.memory[size][(addr / size) | 0] = value;
    bus_sync.add_mmio_update(addr, size, value);
  }

  update_store(addr, size, value) {
    addr &= 0xffff;
    this.memory[size][(addr / size) | 0] = value;
  }
}

var mmio = new MMIO(0x10000);

class BusSync {
  constructor(mmio) {
    this.mmio = mmio;
    this.stdout_buffer = "";
    this.stderr_buffer = "";
    this.mmio_buffer = new Uint8Array(0x10000);
    this.dirty_flags = new Uint8Array(0x10000);
    this.dirty_indices = new Uint32Array(0x10000);
    this.dirty_count = 0;
    this.is_dirty = false;
    this.last_flush_time = performance.now();
    this.flush_interval_ms = 16;
    this.max_buffer_size = 4096;
  }

  add_mmio_update(addr, size, value) {
    for (let i = 0; i < size; i++) {
      const idx = (addr + i) & 0xffff;
      this.mmio_buffer[idx] = (value >> (i * 8)) & 0xff;
      if (this.dirty_flags[idx] === 0) {
        this.dirty_flags[idx] = 1;
        this.dirty_indices[this.dirty_count++] = idx;
      }
    }
    this.is_dirty = true;
    // A device must see the write even when the program never prints. The
    // flush stays rate-limited by `flush_interval_ms`, so the cost is low.
    this.check_auto_flush();
  }

  add_stdout(text) {
    this.stdout_buffer += text;
    this.is_dirty = true;
    this.check_auto_flush();
  }

  add_stderr(text) {
    this.stderr_buffer += text;
    this.is_dirty = true;
    this.check_auto_flush();
  }

  check_auto_flush() {
    const now = performance.now();
    const buffer_len = this.stdout_buffer.length + this.stderr_buffer.length;
    if (
      buffer_len >= this.max_buffer_size ||
      now - this.last_flush_time >= this.flush_interval_ms
    ) {
      this.sync();
    }
  }

  merge(extern_mmio_buffer) {
    if (!extern_mmio_buffer) return;
    const keys = Object.keys(extern_mmio_buffer);
    for (let k = 0; k < keys.length; k++) {
      const idx = keys[k];
      const value = extern_mmio_buffer[idx];
      if (this.dirty_flags[idx] === 0) {
        // processor priority
        this.mmio.memory[1][idx] = value;
      }
    }
  }

  sync() {
    if (
      !this.is_dirty &&
      this.stdout_buffer.length === 0 &&
      this.stderr_buffer.length === 0 &&
      this.dirty_count === 0
    ) {
      return;
    }
    let mmio_updates = null;
    if (this.dirty_count > 0) {
      mmio_updates = {};
      for (let i = 0; i < this.dirty_count; i++) {
        const idx = this.dirty_indices[i];
        mmio_updates[idx] = this.mmio_buffer[idx];
        this.dirty_flags[idx] = 0;
      }
      this.dirty_count = 0;
    }
    post({
      type: "sync",
      mmio_buffer: mmio_updates,
      stdout: this.stdout_buffer,
      stderr: this.stderr_buffer,
    });
    this.stdout_buffer = "";
    this.stderr_buffer = "";
    this.is_dirty = false;
    this.last_flush_time = performance.now();
  }
}

var bus_sync = new BusSync(mmio);

class InterruptionController {
  constructor() {
    this.state = 0;
    this.interrupt_enabled = 1;
  }

  changeState(state) {
    this.state = state;
  }

  get interrupt() {
    let res = this.state;
    this.state = 0;
    return res;
  }

  get interruptEnabled() {
    return this.interrupt_enabled;
  }
}

class SyscallEmulator {
  constructor() {
    this.syscalls = {};
  }

  register(number, code) {
    try {
      this.syscalls[number] = new Function(
        "a0",
        "a1",
        "a2",
        "a3",
        "a7",
        "sendMessage",
        "postMessage",
        code,
      );
    } catch (e) {
      console.warn(
        `Failed to pre-compile syscall ${number}, falling back to string:`,
        e,
      );
      this.syscalls[number] = code;
    }
  }

  unregister(number) {
    delete this.syscalls[number];
  }

  has_syscalls() {
    return (
      typeof this.syscalls === "object" &&
      this.syscalls !== null &&
      Object.keys(this.syscalls).length > 0
    );
  }

  run(a0, a1, a2, a3, a7) {
    const fn = this.syscalls[a7];
    if (fn !== undefined) {
      var sendMessage = function (msg) {
        post({ type: "device_message", syscall: a7, message: msg });
        if (syscall_delay) {
          let start = performance.now();
          while (performance.now() - start < syscall_delay);
        }
      };
      if (typeof fn === "function") {
        fn(a0, a1, a2, a3, a7, sendMessage, postMessage);
      } else {
        eval(fn);
      }
      return a0;
    } else {
      var text = "Invalid syscall: " + a7;
      post({ type: "sim_log", subtype: "error", msg: text });
      return 0;
    }
  }
}

var syscall_emulator = new SyscallEmulator();
var intController = new InterruptionController();

/**
 * Take up to `count` bytes of buffered stdin, or -1 when the guest has to wait.
 *
 * @param {number} count
 * @returns {Uint8Array | -1}
 */
function getStdin(count) {
  if (stdinBuffer.length == 0 && !non_blocking_io) {
    wait_for_input_alert();
    return -1;
  }
  var res = stdinBuffer.slice(0, count);
  stdinBuffer = stdinBuffer.slice(count);
  return res;
}

var last_wait_for_input_alert_sent = 0;
function wait_for_input_alert() {
  bus_sync.sync();
  if (performance.now() - last_wait_for_input_alert_sent > 5000) {
    post({
      type: "sim_log",
      subtype: "info",
      msg: "Waiting for Input...",
    });
    last_wait_for_input_alert_sent = performance.now();
  }
}

function getInteractiveCommand() {
  let res = interactiveBufferString;
  interactiveBufferString = "";
  return res;
}

function customSyscall(a0, a1, a2, a3, a7) {
  try {
    if (
      typeof syscall_emulator !== "undefined" &&
      syscall_emulator.syscalls &&
      syscall_emulator.syscalls[a7] !== undefined
    ) {
      var ret = syscall_emulator.run(a0, a1, a2, a3, a7);
      return ret !== undefined ? ret : 1;
    }
  } catch (e) {
    console.error("Error in customSyscall:", e);
  }
  return 0;
}

function notifyUnknownSyscall(sys_num, a0, a1, a2, a3) {
  var formatVal = function (v) {
    return v < 0 ? `${v}` : `0x${(v >>> 0).toString(16)}`;
  };
  var text = `Syscall Number: ${sys_num}\nArguments: a0=${formatVal(a0)}, a1=${formatVal(a1)}, a2=${formatVal(a2)}, a3=${formatVal(a3)}`;
  post({
    type: "message",
    msg: {
      type: "error",
      title: "Unknown Syscall Error",
      text: text,
      delay: 8000,
    },
  });
}
self.notifyUnknownSyscall = notifyUnknownSyscall;

function jsExternalInterrupt() {
  return typeof intController !== "undefined" ? intController.interrupt : 0;
}

function jsInterruptEnabled() {
  return typeof intController !== "undefined"
    ? intController.interruptEnabled
    : 1;
}

function jsGetIntInstDelay() {
  return typeof simulator_int_inst_delay !== "undefined"
    ? simulator_int_inst_delay
    : 1000;
}

function jsReadMMIO(addr, size) {
  return typeof mmio !== "undefined" ? mmio.load(addr, size) : 0;
}

function jsWriteMMIO(addr, size, val) {
  if (typeof mmio !== "undefined") mmio.store(addr, size, val);
}

function readFromStdin(buf_ptr, count) {
  if (typeof getStdin !== "function") return -1;
  var input = getStdin(count);
  if (input === -1 || !input) return -1;
  if (typeof self.wasmMemory !== "undefined") {
    new Uint8Array(self.wasmMemory.buffer).set(input, buf_ptr);
  }
  return input.length;
}

function readInteractiveCommand(pstr) {
  if (typeof getInteractiveCommand !== "function") return 0;
  var cmd = getInteractiveCommand();
  if (!cmd) return 0;
  if (typeof self.wasmMemory !== "undefined") {
    var encoder = new TextEncoder();
    var bytes = encoder.encode(cmd + "\0");
    new Uint8Array(self.wasmMemory.buffer).set(bytes, pstr);
  }
  return 1;
}

function jsPrint(msg) {
  /** @type {EmscriptenModule} */
  var currentMod = self.Module || Module;
  if (typeof currentMod.print === "function") {
    // The guest bytes go through unchanged: a write without a trailing newline
    // must leave the cursor on the same line.
    currentMod.print(msg);
  } else {
    console.log(msg);
  }
}

function jsPrintErr(msg) {
  /** @type {EmscriptenModule} */
  var currentMod = self.Module || Module;
  if (typeof currentMod.printErr === "function") {
    currentMod.printErr(msg);
  } else {
    console.warn(msg);
  }
}

function getBinaryBytes() {
  var filename = null;
  /** @type {EmscriptenModule} */
  var currentMod = self.Module || Module;
  if (currentMod.arguments && currentMod.arguments.length > 0) {
    for (var i = 0; i < currentMod.arguments.length; i++) {
      var arg = currentMod.arguments[i];
      if (
        !arg.startsWith("-") &&
        arg !== "/working" &&
        !arg.startsWith("/working/")
      ) {
        filename = arg;
        break;
      }
    }
  }
  if (typeof files !== "undefined" && files && files.length > 0) {
    var reader = new FileReaderSync();
    if (filename) {
      for (var j = 0; j < files.length; j++) {
        var fname = files[j].name;
        if (
          fname === filename ||
          fname.replace(/ /g, "_") === filename ||
          filename.endsWith(fname)
        ) {
          return new Uint8Array(reader.readAsArrayBuffer(files[j]));
        }
      }
    }
    return new Uint8Array(reader.readAsArrayBuffer(files[0]));
  }
  return new Uint8Array([]);
}

/**
 * Load the WASM module and the guest binary. It runs no instructions, so the
 * cost of a run is paid entirely by the slice chain.
 *
 * @returns {string[]} the argument list the run was started with
 */
function setupSimulation() {
  // `importScripts` declares `wasm_bindgen`, so a second call in the same
  // worker throws. A worker can now run more than one program, for example a
  // debug session that halts and is then started again.
  if (!wasm_glue_loaded) {
    importScripts("pkg/riscv_rs.js");
    wasm_glue_loaded = true;
  }
  const bindgen =
    typeof wasm_bindgen !== "undefined" ? wasm_bindgen : self.wasm_bindgen;
  const { Simulator, initSync } = bindgen;

  var wasmModule = self.precompiledRiscvModule;
  if (!wasmModule) {
    var xhr = new XMLHttpRequest();
    xhr.open("GET", "pkg/riscv_rs_bg.wasm", false);
    xhr.responseType = "arraybuffer";
    xhr.send(null);
    wasmModule = new WebAssembly.Module(xhr.response);
  }
  const wasmExports = initSync(wasmModule);
  self.wasmMemory = wasmExports.memory;

  var binaryBytes = getBinaryBytes();
  /** @type {EmscriptenModule} */
  var currentMod = self.Module || Module;
  var args = currentMod.arguments || [];

  // The WASM instance is shared between runs in this worker, so the previous
  // simulator has to give its memory back.
  if (self.wasmSimulator) {
    try {
      self.wasmSimulator.free();
    } catch (e) {
      console.warn("Failed to free the previous simulator:", e);
    }
    self.wasmSimulator = null;
  }

  self.wasmSimulator = new Simulator();
  self.wasmSimulator.load_binary(binaryBytes, args);
  // `load_binary` builds a fresh CPU, so the custom-syscall flag and the debug
  // settings have to be written after it, not before.
  self.wasmSimulator.set_has_custom_syscalls(syscall_emulator.has_syscalls());
  self.wasmSimulator.set_debug_mode(debug_mode_enabled);
  breakpoints.forEach((addr) => self.wasmSimulator.add_breakpoint(addr));
  return args;
}

function runSimulation() {
  try {
    const args = setupSimulation();

    if (args.includes("--interactive") || debug_mode_enabled) {
      self.wasmSimulator.set_debug_mode(true);
      let snapshot = self.wasmSimulator.get_snapshot_js(false, 0);
      post({ type: "debug_state", state: snapshot });
      return;
    }

    start_run();
  } catch (e) {
    run_active = false;
    reportSimulatorFailure(e);
  }
}

function start_run() {
  run_active = true;
  run_paused = false;
  run_stopped = false;
  run_total_instructions = 0;
  schedule_slice();
}

/**
 * A zero-delay yield the browser does not clamp.
 *
 * `setTimeout(f, 0)` is forced to 4 ms once the timers nest, which on a 12 ms
 * slice costs a third of the run. A `MessagePort` task hands the message queue
 * its turn without that floor.
 */
const yield_channel =
  typeof MessageChannel === "function" ? new MessageChannel() : null;
if (yield_channel) {
  yield_channel.port1.onmessage = function () {
    run_one_slice();
  };
}

/** Queue the next slice, giving the message queue a turn before it runs. */
function schedule_slice() {
  if (!run_active || run_paused || run_stopped) return;
  if (slice_delay > 0 || !yield_channel) {
    setTimeout(run_one_slice, slice_delay);
  } else {
    yield_channel.port2.postMessage(0);
  }
}

function pause_run() {
  if (run_active) {
    run_paused = true;
    bus_sync.sync();
  }
  if (typeof wasmSimulator !== "undefined" && wasmSimulator) {
    post({
      type: "debug_state",
      state: wasmSimulator.get_snapshot_js(false, 0),
    });
  } else {
    post({ type: "debug_error", reason: "no_program" });
  }
}

function resume_run() {
  if (!run_active || !run_paused) return;
  run_paused = false;
  schedule_slice();
}

/**
 * Keep one slice inside the target window. A slice that is too short wastes a
 * timer turn; one that is too long makes the worker unresponsive again.
 */
function adapt_slice_budget(elapsed_ms) {
  let factor;
  if (elapsed_ms <= 0.25) {
    factor = 4;
  } else if (
    elapsed_ms < SLICE_TARGET_MIN_MS ||
    elapsed_ms > SLICE_TARGET_MAX_MS
  ) {
    factor = Math.min(4, Math.max(0.25, SLICE_TARGET_MID_MS / elapsed_ms));
  } else {
    return;
  }
  slice_budget = Math.min(
    SLICE_BUDGET_MAX,
    Math.max(SLICE_BUDGET_MIN, Math.round(slice_budget * factor)),
  );
}

function run_one_slice() {
  if (!run_active || run_paused || run_stopped) return;

  let outcome;
  try {
    const started = performance.now();
    outcome = self.wasmSimulator.run_slice(slice_budget);
    if (!freq_limited) adapt_slice_budget(performance.now() - started);
  } catch (e) {
    run_active = false;
    run_stopped = true;
    reportSimulatorFailure(e);
    return;
  }

  bus_sync.sync();
  run_total_instructions += outcome.steps;

  switch (outcome.status) {
    case "halted":
    case "trapped":
      run_active = false;
      finishExec();
      return;

    case "breakpoint":
      run_stopped = true;
      post({
        type: "debug_state",
        state: self.wasmSimulator.get_snapshot_js(true, outcome.pc),
      });
      return;

    default:
      if (run_total_instructions >= RUN_INSTRUCTION_LIMIT) {
        run_active = false;
        run_stopped = true;
        post({
          type: "message",
          msg: {
            type: "error",
            title: "Run Stopped",
            text:
              "The program executed " +
              RUN_INSTRUCTION_LIMIT.toLocaleString() +
              " instructions without stopping. It is most likely an infinite loop.",
            delay: Infinity,
          },
        });
        finishExec();
        return;
      }
      schedule_slice();
  }
}

/**
 * Report a simulator failure to the UI: a visible error notification followed by
 * a finish status flagged as an error, so no success statistics are shown.
 */
function reportSimulatorFailure(e) {
  console.error("riscv-rs execution failure:", e);
  const detail = (e && (e.stack || e.message)) || String(e);
  post({
    type: "message",
    msg: {
      type: "error",
      title: "Simulator Error",
      text: "The simulator stopped unexpectedly.\n" + detail,
      delay: Infinity,
    },
  });
  if (self.execFinished) return;
  self.execFinished = true;
  try {
    bus_sync.sync();
  } catch (syncErr) {
    console.warn("Failed to flush the bus after a simulator failure:", syncErr);
  }
  post({
    type: "status",
    status: { finish: true, error: true, errorMessage: detail },
  });
}

/**
 * Report the end of a run: flush the bus and post the statistics.
 *
 * @param {wasm_bindgen.DebuggerSnapshot} [passedSnapshot] state read before the
 *   call; when absent it is read from the simulator.
 */
function finishExec(passedSnapshot) {
  if (self.execFinished) return;
  self.execFinished = true;
  bus_sync.sync();
  let executionEndTime = performance.now();
  let elapsedTimeMs =
    executionEndTime - (self.executionStartTime || executionEndTime);

  let snapshot = passedSnapshot || null;
  if (
    !snapshot &&
    typeof self.wasmSimulator !== "undefined" &&
    self.wasmSimulator
  ) {
    try {
      snapshot = self.wasmSimulator.get_snapshot_js(false, 0);
    } catch (e) {
      console.warn("Failed to get WASM simulator snapshot:", e);
    }
  }

  if (!snapshot) {
    // Without a snapshot there are no statistics to report, and emitting zeroed
    // ones would look like a successful run.
    post({
      type: "message",
      msg: {
        type: "error",
        title: "Simulator Error",
        text: "Execution ended without a machine state snapshot.",
        delay: Infinity,
      },
    });
    post({
      type: "status",
      status: {
        finish: true,
        error: true,
        errorMessage: "Execution ended without a machine state snapshot.",
      },
    });
    return;
  }

  let totalInstructions = snapshot.step_count || 0;
  let elapsedSeconds = elapsedTimeMs / 1000;
  let ips =
    elapsedSeconds > 0 ? Math.round(totalInstructions / elapsedSeconds) : 0;
  let mips =
    elapsedSeconds > 0
      ? Number((totalInstructions / (elapsedSeconds * 1000000)).toFixed(3))
      : 0;
  let finalPC = (snapshot.pc >>> 0).toString(16).padStart(8, "0");
  // The CPU carries the exit status explicitly; a trap sets it to a nonzero
  // value even when a0 happens to hold zero.
  let exitCode =
    typeof snapshot.exit_code === "number"
      ? snapshot.exit_code | 0
      : snapshot.gpr
        ? snapshot.gpr[10] >>> 0
        : 0;
  let trapped = snapshot.trapped === true;

  post({
    type: "status",
    status: {
      finish: true,
      error: trapped,
      errorMessage: trapped
        ? "The program stopped on a trap at PC 0x" + finalPC + "."
        : undefined,
      stats: {
        elapsedTimeMs,
        totalInstructions,
        ips,
        mips,
        finalPC,
        exitCode,
        trapped,
      },
    },
  });
}

var xhr = new XMLHttpRequest();
// The GDB bridge is polled synchronously; the flag keeps the "waiting" notice
// to one message per attempt.
var postGDBWaiting = 0;
function getDebugMsg() {
  postGDBWaiting = 1;
  while (1) {
    try {
      xhr.open("GET", "http://127.0.0.1:5689/gdbInput", false); // synchronous request
      xhr.send(null);
      if (xhr.status === 200) {
        return xhr.responseText;
      }
    } catch (e) {
      if (postGDBWaiting) {
        post({
          type: "sim_log",
          subtype: "info",
          msg: "Waiting for GDB...",
        });
        postGDBWaiting = 0;
      }
    }
  }
}

var xhrS = new XMLHttpRequest();
function sendDebugMsg(msg) {
  postGDBWaiting = 1;
  while (1) {
    try {
      xhrS.open("POST", "http://127.0.0.1:5689/gdbInput", false); // synchronous request
      xhrS.send(msg);
      if (xhrS.status === 200) {
        return;
      }
    } catch (error) {
      if (postGDBWaiting) {
        post({
          type: "sim_log",
          subtype: "info",
          msg: "Waiting for GDB...",
        });
        postGDBWaiting = 0;
      }
    }
  }
}

/** @type {EmscriptenModule} */
var Module = {
  // arguments : ["--version"],
  arguments: [
    "--newlib",
    "/working/ex2",
    "--isa",
    "acdfimsu",
    "--setreg",
    "sp=0x10000",
  ],
  instantiateWasm: function (imports, successCallback) {
    if (precompiledRiscvModule) {
      WebAssembly.instantiate(precompiledRiscvModule, imports)
        .then(function (instance) {
          successCallback(instance, precompiledRiscvModule);
        })
        .catch(function (err) {
          console.error("Precompiled riscv-rs WASM instantiation error:", err);
        });
      return {};
    }
    return false;
  },
  preRun: [],
  print: bus_sync.add_stdout.bind(bus_sync),
  printErr: bus_sync.add_stderr.bind(bus_sync),
};

post({ type: "status", status: { starting: true } });
