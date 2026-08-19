export class MMIO {
  constructor(size) {
    this.sharedBuffer = new ArrayBuffer(size);
    this.memory = [];
    this.memory[1] = new Uint8Array(this.sharedBuffer);
    this.memory[2] = new Uint16Array(this.sharedBuffer);
    this.memory[4] = new Uint32Array(this.sharedBuffer);
    this.size = this.sharedBuffer.byteLength;
  }

  reset() {
    this.memory[4].fill(0);
  }

  load(addr, size) {
    addr &= 0xffff;
    return this.memory[size][(addr / size) | 0];
  }

  store(addr, size, value) {
    addr &= 0xffff;
    this.memory[size][(addr / size) | 0] = value;
    if (typeof simulator_controller !== "undefined" && simulator_controller) {
      simulator_controller.add_mmio_update(addr, size, value);
    }
  }

  update_store(addr, size, value) {
    addr &= 0xffff;
    this.memory[size][(addr / size) | 0] = value;
  }
}

/**
 * The `default` branch of an exhaustive switch over an IPC union.
 *
 * When every member is handled, `value` narrows to `never` and the call type
 * checks. A member that no case handles gives it a real type, and `tsc` fails:
 * that is how a drift between a sender and a receiver is caught.
 *
 * @param {never} value
 */
function assert_unreachable(value) {
  console.error("Unhandled IPC message:", value);
}

class SimulatorController {
  constructor() {
    // Debug settings outlive a worker: each run gets a fresh one, and
    // `replay_debug_state` sends these to it.
    this.debug_mode_enabled = false;
    /** @type {Set<number>} */
    this.breakpoints = new Set();
    /** True once the current worker has run a program to its end. */
    this.worker_dirty = false;
    /**
     * Custom syscalls a device installed, keyed by number. A worker only lives
     * for one run, so they are replayed into each new one.
     * @type {Map<number, string>}
     */
    this.custom_syscalls = new Map();
    /**
     * Input that arrived before the next run started. The worker that receives
     * it is replaced at the start of that run, which would otherwise throw the
     * input away.
     */
    this.pending_stdin = "";
    // The debugger UI installs these; they stay null while no view is open.
    /** @type {((state: wasm_bindgen.DebuggerSnapshot) => void) | null} */
    this.onDebugState = null;
    /** @type {((addr: number, bytes: number[]) => void) | null} */
    this.onDebugMemData = null;
    /** @type {((items: wasm_bindgen.DisassembledInst[]) => void) | null} */
    this.onDebugDisasmData = null;
    /** @type {((addr: number, active: boolean) => void) | null} */
    this.onDebugBpUpdated = null;
    if (typeof window === "undefined") {
      this.stdio_ch = { postMessage: () => {}, onmessage: null };
      this.sim_status_ch = { postMessage: () => {}, onmessage: null };
      this.bus_ch = { postMessage: () => {}, onmessage: null };
      this.bus_freq_limit = 1000;
      this.int_cont_freq_scale = 25;
      this.last_loaded_files = [];
      return;
    }
    const uniq_id = window.uniq_id || "";
    this.stdio_ch = new BroadcastChannel("stdio_channel" + uniq_id);
    this.sim_status_ch = new BroadcastChannel("simulator_status" + uniq_id);
    this.bus_ch = new BroadcastChannel("bus_channel" + uniq_id);
    this.bus_freq_limit = 1000;
    this.int_cont_freq_scale = 25;
    this.last_loaded_files = [];
    this._executionResolve = null;
    this.riscvModule = null;
    this.initPromise = null;
    this.idle_worker = null;
    window.__ale__ = {
      uniq_id: uniq_id,
      sim_status_ch: this.sim_status_ch,
    };
    this.init_wasm_cache().then(() => {
      if (!this.simulator) {
        this.startSimulator();
      }
      this.prewarm_idle_worker();
    });
    this.stdio_ch.onmessage = (e) => {
      /** @type {StdioChannelMessage} */
      const msg = e.data;
      if (msg.fh == 0) {
        this.send_stdin(msg.data);
      } else if (msg.fh === -1 && "debug" in msg) {
        this.post_to_worker({ type: "interactive", cmd: msg.cmd });
      } else if (msg.fh === -1 && "init_stdin" in msg) {
        this.send_stdin(msg.data);
      }
    };
  }

  /**
   * The only way this file talks to the simulator worker. The parameter type is
   * what makes a message the worker does not handle a compile error.
   *
   * @param {MainToSimulatorMessage} msg
   */
  post_to_worker(msg) {
    if (this.simulator) this.simulator.postMessage(msg);
  }

  /**
   * Hand input to the worker. While no program runs, it is also kept so a
   * worker replacement at the start of the next run does not lose it.
   *
   * @param {string} data
   */
  send_stdin(data) {
    if (!this._executionResolve) this.pending_stdin += data;
    this.post_to_worker({ type: "stdin", stdin: data });
  }

  /**
   * The only way this file talks to the status channel.
   *
   * @param {SimStatusChannelMessage} msg
   */
  post_status(msg) {
    this.sim_status_ch.postMessage(msg);
  }

  /**
   * The only way this file talks to the stdio channel.
   *
   * @param {StdioChannelMessage} msg
   */
  post_stdio(msg) {
    this.stdio_ch.postMessage(msg);
  }

  async init_wasm_cache() {
    if (this.riscvModule) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const res = await fetch("./modules/pkg/riscv_rs_bg.wasm");
        try {
          if (typeof WebAssembly.compileStreaming === "function") {
            this.riscvModule = await WebAssembly.compileStreaming(res.clone());
            return;
          }
        } catch (e) {}
        const buf = await res.arrayBuffer();
        this.riscvModule = await WebAssembly.compile(buf);
      } catch (err) {
        console.warn(
          "WASM pre-compilation failed, falling back to standard fetching:",
          err,
        );
      }
    })();

    return this.initPromise;
  }

  triggerInterrupt() {
    this.post_to_worker({ type: "interrupt", state: 1 });
  }

  prewarm_idle_worker() {
    if (this.idle_worker) return;
    try {
      const worker = new Worker("./modules/simulator_worker.js");
      if (this.riscvModule) {
        /** @type {MainToSimulatorMessage} */
        const init = { type: "init_modules", riscvModule: this.riscvModule };
        worker.postMessage(init);
      }
      this.idle_worker = worker;
    } catch (e) {
      console.warn("Failed to prewarm idle worker:", e);
    }
  }

  /**
   * Surface a worker-level failure (a thrown exception that escaped the worker,
   * or a message that could not be deserialized) and settle any pending run.
   */
  report_worker_failure(title, detail) {
    console.error(title + ":", detail);
    this.post_status({
      type: "message",
      msg: {
        type: "error",
        title,
        text: String(detail),
        delay: Infinity,
      },
    });
    this.post_status({
      type: "status",
      status: { finish: true, error: true, errorMessage: String(detail) },
    });
    if (this._executionResolve) {
      const resolve = this._executionResolve;
      this._executionResolve = null;
      resolve();
    }
  }

  setup_simulator_listeners(worker) {
    worker.onerror = (e) => {
      // `preventDefault` stops the browser from also logging an uncaught error.
      if (typeof e.preventDefault === "function") e.preventDefault();
      this.report_worker_failure(
        "Simulator Worker Error",
        e.message || "The simulator worker crashed.",
      );
    };

    worker.onmessageerror = () => {
      this.report_worker_failure(
        "Simulator Worker Error",
        "A message from the simulator worker could not be deserialized.",
      );
    };

    worker.onmessage = (e) => {
      /** @type {SimulatorToMainMessage} */
      const msg = e.data;
      switch (msg.type) {
        case "device_message":
          this.bus_ch.postMessage(
            /** @type {BusChannelMessage} */ ({
              so_emulation: true,
              syscall: msg.syscall,
              data: msg.message,
            }),
          );
          break;
        case "sim_log":
        case "message":
          this.post_status(msg);
          break;
        case "status":
          this.post_status(msg);
          if (msg.status.finish) {
            if (this._executionResolve) {
              const resolve = this._executionResolve;
              this._executionResolve = null;
              resolve();
            }
            // The worker keeps the finished program so the debugger can still
            // read its state. The next run replaces the worker instead.
            this.worker_dirty = true;
          }
          break;
        case "sync":
          this.bus_sync(msg);
          break;
        case "debug_state":
          if (typeof this.onDebugState === "function")
            this.onDebugState(msg.state);
          this.post_status({ type: "debug_state", state: msg.state });
          break;
        case "debug_mem_data":
          if (typeof this.onDebugMemData === "function")
            this.onDebugMemData(msg.addr, msg.bytes);
          break;
        case "debug_disasm_data":
          if (typeof this.onDebugDisasmData === "function")
            this.onDebugDisasmData(msg.items);
          break;
        case "debug_bp_updated":
          if (typeof this.onDebugBpUpdated === "function")
            this.onDebugBpUpdated(msg.addr, msg.active);
          break;
        case "debug_status":
          // The worker confirms the mode it now runs in; the UI already shows it.
          break;
        case "debug_error":
          this.post_status({
            type: "message",
            msg: {
              type: "notice",
              title: "Debugger",
              text: "Load and run a program before you use the debugger.",
            },
          });
          break;

        default:
          assert_unreachable(msg);
      }
    };
  }

  startSimulator() {
    if (this.idle_worker) {
      this.simulator = this.idle_worker;
      this.idle_worker = null;
    } else {
      this.simulator = new Worker("./modules/simulator_worker.js");
      if (this.riscvModule) {
        this.simulator.postMessage({
          type: "init_modules",
          riscvModule: this.riscvModule,
        });
      }
    }
    this.setup_simulator_listeners(this.simulator);
    this.replay_worker_state();
    this.worker_dirty = false;
    mmio.reset();
    this.mmio_write_buffer = new Uint8Array(0x10000);
    this.mmio_dirty_flags = new Uint8Array(0x10000);
    this.mmio_dirty_indices = new Uint32Array(0x10000);
    this.mmio_dirty_count = 0;
    this.set_freq_limit(this.bus_freq_limit);
    this.set_int_freq_scale_limit(this.int_cont_freq_scale);
    setTimeout(() => this.prewarm_idle_worker(), 0);
  }

  /**
   * Re-apply everything a freshly created worker cannot know: the syscalls a
   * device installed, the debug session, and input that is still waiting.
   */
  replay_worker_state() {
    this.custom_syscalls.forEach((code, number) => {
      this.post_to_worker({ type: "load_syscall", number, code });
    });
    this.replay_debug_state();
    if (this.pending_stdin) {
      this.post_to_worker({ type: "stdin", stdin: this.pending_stdin });
    }
  }

  /**
   * Send the debug mode and every breakpoint to a worker that has just been
   * created. The controller holds them because a worker only lives for one run.
   */
  replay_debug_state() {
    if (!this.simulator) return;
    if (this.debug_mode_enabled) {
      this.post_to_worker({ type: "debug_enable", enabled: true });
    }
    this.breakpoints.forEach((addr) => {
      this.post_to_worker({ type: "debug_set_bp", addr, active: true });
    });
  }

  /** Replace a worker that already ran a program with a fresh one. */
  replace_simulator() {
    if (this.simulator) this.simulator.terminate();
    this.simulator = null;
    this.startSimulator();
  }

  add_mmio_update(addr, size, value) {
    if (!this.mmio_write_buffer) return;
    for (let i = 0; i < size; i++) {
      const idx = (addr + i) & 0xffff;
      this.mmio_write_buffer[idx] = (value >> (i * 8)) & 0xff;
      if (this.mmio_dirty_flags[idx] === 0) {
        this.mmio_dirty_flags[idx] = 1;
        this.mmio_dirty_indices[this.mmio_dirty_count++] = idx;
      }
    }
    this.flush_mmio();
  }

  flush_mmio() {
    if (this.mmio_dirty_count === 0) return;
    /** @type {Record<string, number>} */
    const updates = {};
    for (let i = 0; i < this.mmio_dirty_count; i++) {
      const idx = this.mmio_dirty_indices[i];
      updates[idx] = this.mmio_write_buffer[idx];
      this.mmio_dirty_flags[idx] = 0;
    }
    this.mmio_dirty_count = 0;
    this.post_to_worker({ type: "sync", buffer: updates });
  }

  /**
   * Fan a worker `sync` out to the page: the text to the stdio channel and the
   * MMIO bytes into the shared buffer the devices read.
   *
   * @param {Extract<SimulatorToMainMessage, {type: "sync"}>} data
   */
  bus_sync(data) {
    if (data.stdout && data.stdout.length > 0)
      this.post_stdio({ fh: 1, data: data.stdout });
    if (data.stderr && data.stderr.length > 0)
      this.post_stdio({ fh: 2, data: data.stderr });
    if (data.mmio_buffer) {
      const keys = Object.keys(data.mmio_buffer);
      for (let k = 0; k < keys.length; k++) {
        const i = keys[k];
        mmio.memory[1][i] = data.mmio_buffer[i];
      }
    }
  }

  async start_execution(args) {
    await this.init_wasm_cache();
    if (!this.simulator) {
      this.startSimulator();
    } else if (this.worker_dirty) {
      // A worker that already ran a program cannot run a second one, so it is
      // replaced here rather than immediately after the previous run. That
      // keeps the finished machine state readable until the next run starts.
      this.replace_simulator();
    }
    // The input is now in the worker that will run the program.
    this.pending_stdin = "";
    this.post_to_worker({ type: "add_files", files: this.last_loaded_files });
    this.post_status({
      type: "status",
      status: { starting_exec: true, args },
    });
    this.post_to_worker({ type: "start", args });
    this.flush_mmio();

    return new Promise((resolve) => {
      this._executionResolve = resolve;
    });
  }

  load_syscall(number, code, desc) {
    this.custom_syscalls.set(number, code);
    if (desc) {
      this.post_status({ type: "load_syscall", number, desc, code });
    }
    this.post_to_worker({ type: "load_syscall", number, code });
  }

  remove_syscall(number) {
    this.custom_syscalls.delete(number);
    this.post_to_worker({ type: "disable_syscall", number });
  }

  load_files(files) {
    this.last_loaded_files = [];
    for (let i = 0; i < files.length; i++) {
      this.last_loaded_files[i] = files[i];
    }
    this.sim_status_ch.postMessage({
      type: "load_file",
      name: this.last_loaded_files[0].name,
      size: this.last_loaded_files[0].size,
    });
  }

  load_new_file(file) {
    for (let index = 0; index < this.last_loaded_files.length; index++) {
      if (this.last_loaded_files[index].name == file.name) {
        this.last_loaded_files[index] = file;
        return;
      }
    }
    this.last_loaded_files.push(file);
  }

  set_int_freq_scale_limit(value) {
    this.int_cont_freq_scale = value;
    this.post_to_worker({
      type: "interrupt_enabled",
      value: value == 0 ? 0 : 1,
    });
    this.post_to_worker({
      type: "set_int_delay",
      value: 2 ** (32 - value) - 1,
    });
  }

  set_freq_limit(value) {
    this.bus_freq_limit = value;
    this.post_to_worker({ type: "set_freq_limit", value });
  }

  restart_simulator() {
    if (this._executionResolve) {
      const resolve = this._executionResolve;
      this._executionResolve = null;
      resolve();
    }
    if (this.simulator) this.simulator.terminate();
    this.post_status({ type: "status", status: { stopping: true } });
    this.startSimulator();
  }

  stop_execution() {
    this.restart_simulator();
  }

  debugEnable(enabled = true) {
    this.debug_mode_enabled = enabled;
    this.post_to_worker({ type: "debug_enable", enabled });
  }

  debugStep() {
    this.post_to_worker({ type: "debug_step" });
  }

  debugStepOver() {
    this.post_to_worker({ type: "debug_step_over" });
  }

  debugStepOut() {
    this.post_to_worker({ type: "debug_step_out" });
  }

  debugContinue() {
    this.post_to_worker({ type: "debug_continue" });
  }

  debugPause() {
    this.post_to_worker({ type: "debug_pause" });
  }

  /** Hold the slice chain of a running program and read back its state. */
  runPause() {
    this.post_to_worker({ type: "run_pause" });
  }

  /** Let a paused slice chain continue. */
  runResume() {
    this.post_to_worker({ type: "run_resume" });
  }

  debugToggleBreakpoint(addr, active) {
    if (active) {
      this.breakpoints.add(addr);
    } else {
      this.breakpoints.delete(addr);
    }
    this.post_to_worker({ type: "debug_set_bp", addr, active });
  }

  debugFetchMemory(addr, len) {
    this.post_to_worker({ type: "debug_read_mem", addr, len });
  }

  debugPokeRegister(reg, val) {
    this.post_to_worker({ type: "debug_poke_reg", reg, val });
  }

  debugPokeMemory(addr, val) {
    this.post_to_worker({ type: "debug_poke_mem", addr, val });
  }

  debugFetchDisassembly(addr, len) {
    this.post_to_worker({ type: "debug_disasm", addr, len });
  }

}

class InterruptController {
  constructor() {}

  interrupt(device_id) {
    if (mmio.load(0xffff0008, 4)) {
      return false;
    }
    mmio.store(0xffff0004, 4, device_id);
    mmio.store(0xffff0008, 4, 1);
    simulator_controller.triggerInterrupt();
    return true;
  }
}

export const mmio = new MMIO(0x10000);
export const simulator_controller = new SimulatorController();
export const interrupt_controller = new InterruptController();
