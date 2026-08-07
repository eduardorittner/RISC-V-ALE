class MMIO{
  constructor(size){
    this.sharedBuffer = new ArrayBuffer(size);
    this.memory = [];
    this.memory[1] = new Uint8Array(this.sharedBuffer);
    this.memory[2] = new Uint16Array(this.sharedBuffer);
    this.memory[4] = new Uint32Array(this.sharedBuffer);
    this.size = this.sharedBuffer.byteLength;
  }

  reset(){
    this.memory[4].fill(0)
  }

  load(addr, size){
    addr &= 0xFFFF;
    return this.memory[size][(addr/size) | 0];
  }
  
  store(addr, size, value){
    addr &= 0xFFFF;
    this.memory[size][(addr/size) | 0] = value;
    simulator_controller.add_mmio_update(addr, size, value);
  }

  update_store(addr, size, value){
    addr &= 0xFFFF;
    this.memory[size][(addr/size) | 0] = value;
  }
}

class SimulatorController{
  constructor(){
    this.stdio_ch = new BroadcastChannel("stdio_channel" + window.uniq_id);
    this.sim_status_ch = new BroadcastChannel('simulator_status' + window.uniq_id);
    this.bus_ch = new BroadcastChannel('bus_channel' + window.uniq_id);
    this.bus_freq_limit = 1000;
    this.int_cont_freq_scale = 25;
    this.last_loaded_files = []
    this._executionResolve = null;
    this.whisperModule = null;
    this.initPromise = null;
    this.idle_worker = null;
    window.__ale__ = {
      uniq_id: window.uniq_id,
      sim_status_ch: this.sim_status_ch,
    };
    this.init_wasm_cache().then(() => {
      if (!this.simulator) {
        this.startSimulator();
      }
      this.prewarm_idle_worker();
    });
    this.stdio_ch.onmessage = function (e) {
      if(e.data.fh==0){ // stdin
        if (this.simulator) this.simulator.postMessage({type: "stdin", stdin: e.data.data});
      }else if(e.data.debug){
        if (this.simulator) this.simulator.postMessage({type: "interactive", cmd: e.data.cmd});
      }else if(e.data.init_stdin){
        if (this.simulator) this.simulator.postMessage({type: "stdin", stdin: e.data.data});
      }
    }.bind(this);
  }

  async init_wasm_cache() {
    if (this.whisperModule) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const res = await fetch("./modules/whisper.wasm");
        try {
          if (typeof WebAssembly.compileStreaming === "function") {
            this.whisperModule = await WebAssembly.compileStreaming(res.clone());
            return;
          }
        } catch (e) {}
        const buf = await res.arrayBuffer();
        this.whisperModule = await WebAssembly.compile(buf);
      } catch (err) {
        console.warn("WASM pre-compilation failed, falling back to standard fetching:", err);
      }
    })();

    return this.initPromise;
  }

  triggerInterrupt(){
    if (this.simulator) this.simulator.postMessage({type: "interrupt", state: 1});
  }

  prewarm_idle_worker() {
    if (this.idle_worker) return;
    try {
      const worker = new Worker("./modules/simulator_worker.js");
      if (this.whisperModule) {
        worker.postMessage({
          type: "init_modules",
          whisperModule: this.whisperModule
        });
      }
      this.idle_worker = worker;
    } catch (e) {
      console.warn("Failed to prewarm idle worker:", e);
    }
  }

  setup_simulator_listeners(worker) {
    worker.onmessage = function(e){
      switch(e.data.type){
        case 'device_message':
          this.bus_ch.postMessage({so_emulation:true, syscall: e.data.syscall, data: e.data.message});
          break;
        case "sim_log":
          this.sim_status_ch.postMessage(e.data);
          break;
        case "status":
          this.sim_status_ch.postMessage(e.data);
          if(e.data.status.finish){
            if(this._executionResolve){
              const resolve = this._executionResolve;
              this._executionResolve = null;
              resolve();
            }
            setTimeout(() => this.restart_simulator(), 50);
          }
          break;
        case 'sync':
          this.bus_sync(e.data);
          break;
        case 'debug_state':
          if (typeof this.onDebugState === 'function') this.onDebugState(e.data.state);
          this.sim_status_ch.postMessage({ type: 'debug_state', state: e.data.state });
          break;
        case 'debug_mem_data':
          if (typeof this.onDebugMemData === 'function') this.onDebugMemData(e.data.addr, e.data.bytes);
          break;
        case 'debug_disasm_data':
          if (typeof this.onDebugDisasmData === 'function') this.onDebugDisasmData(e.data.items);
          break;
        case 'debug_bp_updated':
          if (typeof this.onDebugBpUpdated === 'function') this.onDebugBpUpdated(e.data.addr, e.data.active);
          break;
          
        default:
          console.log("w: " + e.data);
      }
    }.bind(this);
  }

  startSimulator(){
    if (this.idle_worker) {
      this.simulator = this.idle_worker;
      this.idle_worker = null;
    } else {
      this.simulator = new Worker("./modules/simulator_worker.js");
      if (this.whisperModule) {
        this.simulator.postMessage({
          type: "init_modules",
          whisperModule: this.whisperModule
        });
      }
    }
    this.setup_simulator_listeners(this.simulator);
    mmio.reset();
    this.mmio_write_buffer = new Uint8Array(0x10000);
    this.mmio_dirty_flags = new Uint8Array(0x10000);
    this.mmio_dirty_indices = new Uint32Array(0x10000);
    this.mmio_dirty_count = 0;
    this.set_freq_limit(this.bus_freq_limit);
    this.set_int_freq_scale_limit(this.int_cont_freq_scale);
    setTimeout(() => this.prewarm_idle_worker(), 0);
  }

  add_mmio_update(addr, size, value){
    for (let i = 0; i < size; i++) {
      const idx = (addr + i) & 0xFFFF;
      this.mmio_write_buffer[idx] = (value >> (i*8)) & 0xFF;
      if (this.mmio_dirty_flags[idx] === 0) {
        this.mmio_dirty_flags[idx] = 1;
        this.mmio_dirty_indices[this.mmio_dirty_count++] = idx;
      }
    }
    this.flush_mmio();
  }

  flush_mmio(){
    if (this.mmio_dirty_count === 0) return;
    const updates = {};
    for (let i = 0; i < this.mmio_dirty_count; i++) {
      const idx = this.mmio_dirty_indices[i];
      updates[idx] = this.mmio_write_buffer[idx];
      this.mmio_dirty_flags[idx] = 0;
    }
    this.mmio_dirty_count = 0;
    if (this.simulator) {
      this.simulator.postMessage({type:"sync", buffer: updates});
    }
  }

  bus_sync(data){
    if(data.stdout && data.stdout.length > 0) this.stdio_ch.postMessage({fh:1, data:data.stdout});
    if(data.stderr && data.stderr.length > 0) this.stdio_ch.postMessage({fh:2, data:data.stderr});
    if (data.mmio_buffer) {
      const keys = Object.keys(data.mmio_buffer);
      for (let k = 0; k < keys.length; k++) {
        const i = keys[k];
        mmio.memory[1][i] = data.mmio_buffer[i];
      }
    }
  }

  async start_execution(args){
    await this.init_wasm_cache();
    if (!this.simulator) {
      this.startSimulator();
    }
    this.simulator.postMessage({type: "add_files", files: this.last_loaded_files});
    this.sim_status_ch.postMessage({type: "status", status:{starting_exec: true, args}});
    this.simulator.postMessage({type: "start", args});
    this.flush_mmio();

    return new Promise(resolve => {
      this._executionResolve = resolve;
    });
  }

  load_syscall(number, code, desc){
    if(desc){
      this.sim_status_ch.postMessage({type: "load_syscall", number, desc, code});
    }
    if (this.simulator) this.simulator.postMessage({type: "load_syscall", number, code});
  }

  remove_syscall(number){
    if (this.simulator) this.simulator.postMessage({type: "disable_syscall", number});
  }

  load_files(files){
    this.last_loaded_files = [];
    for (let i = 0; i < files.length; i++) {
      this.last_loaded_files[i] = files[i];
    }
    this.sim_status_ch.postMessage({type: "load_file", name: this.last_loaded_files[0].name, size: this.last_loaded_files[0].size});
  }

  load_new_file(file){
    for (let index = 0; index < this.last_loaded_files.length; index++) {
      if(this.last_loaded_files[index].name == file.name){
        this.last_loaded_files[index] = file;
        return;
      }
    }
    this.last_loaded_files.push(file);
  }

  set_int_freq_scale_limit(value){
    this.int_cont_freq_scale = value;
    if (this.simulator) {
      if(value == 0){
        this.simulator.postMessage({type: "interrupt_enabled", value: 0});
      }else{
        this.simulator.postMessage({type: "interrupt_enabled", value: 1});
      }
      this.simulator.postMessage({type: "set_int_delay", value: (2**(32 - value)) - 1});
    }
  }

  set_freq_limit(value){
    this.bus_freq_limit = value;
    if (this.simulator) this.simulator.postMessage({type: "set_freq_limit", value});
  }

  restart_simulator(){
    if(this._executionResolve){
      const resolve = this._executionResolve;
      this._executionResolve = null;
      resolve();
    }
    if (this.simulator) this.simulator.terminate();
    this.sim_status_ch.postMessage({type:"status", status:{stopping:true}});
    this.startSimulator();
  }

  stop_execution(){
    this.restart_simulator();
  }

  debugEnable(enabled = true) {
    if (this.simulator) this.simulator.postMessage({ type: "debug_enable", enabled });
  }

  debugStep() {
    if (this.simulator) this.simulator.postMessage({ type: "debug_step" });
  }

  debugStepOver() {
    if (this.simulator) this.simulator.postMessage({ type: "debug_step_over" });
  }

  debugStepOut() {
    if (this.simulator) this.simulator.postMessage({ type: "debug_step_out" });
  }

  debugContinue() {
    if (this.simulator) this.simulator.postMessage({ type: "debug_continue" });
  }

  debugPause() {
    if (this.simulator) this.simulator.postMessage({ type: "debug_pause" });
  }

  debugToggleBreakpoint(addr, active) {
    if (this.simulator) this.simulator.postMessage({ type: "debug_set_bp", addr: addr, active: active });
  }

  debugClearBreakpoints() {
    if (this.simulator) this.simulator.postMessage({ type: "debug_clear_bps" });
  }

  debugFetchMemory(addr, len) {
    if (this.simulator) this.simulator.postMessage({ type: "debug_read_mem", addr: addr, len: len });
  }

  debugPokeRegister(reg, val) {
    if (this.simulator) this.simulator.postMessage({ type: "debug_poke_reg", reg: reg, val: val });
  }

  debugPokeMemory(addr, val) {
    if (this.simulator) this.simulator.postMessage({ type: "debug_poke_mem", addr: addr, val: val });
  }

  debugFetchDisassembly(addr, len) {
    if (this.simulator) this.simulator.postMessage({ type: "debug_disasm", addr: addr, len: len });
  }

  debugGetSnapshot() {
    if (this.simulator) this.simulator.postMessage({ type: "debug_get_snapshot" });
  }
}

class InterruptController{
  constructor(){
  }

  interrupt(device_id){
    if(mmio.load(0xFFFF0008, 4)){
      return false;
    }
    mmio.store(0xFFFF0004, 4, device_id);
    mmio.store(0xFFFF0008, 4, 1);
    simulator_controller.triggerInterrupt();
    return true;
  }


}

export const mmio = new MMIO(0x10000);
export const simulator_controller = new SimulatorController();
export const interrupt_controller = new InterruptController();