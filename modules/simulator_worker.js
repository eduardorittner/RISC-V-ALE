/*jshint esversion: 6 */

var stdinBuffer = new Uint8Array([]);
var non_blocking_io = false;
var interactiveBufferString = "";
var syscall_delay = 30;
var simulator_sleep = [1, 1, 1]; // int, read, write
var simulator_int_inst_delay = 1000;

// ─── The state of a debug session ───────────────────────────────────────────
// `debug_session` is set by the start message. The other three hold what the
// page asked for and what the core answered. See "The debugger" below.
var debug_session = false;
var debug_ready = false;
var debug_running = false;
var debug_ended = false;
var debug_breakpoints = new Set();

onmessage = function(e) {
  switch(e.data.type){
    case "code_load":
      files = e.data.code;
      break;
    case "start_sim":  
      importScripts("whisper.js");
      break;
    case "stdin":
      let new_stdin = new TextEncoder("utf-8").encode(e.data.stdin);
      let new_stdin_buffer = new Uint8Array(new_stdin.length + stdinBuffer.length);
      new_stdin_buffer.set(stdinBuffer)
      new_stdin_buffer.set(new_stdin, stdinBuffer.length)
      stdinBuffer = new_stdin_buffer;
      console.log(stdinBuffer);
      break;
    case "non_blocking_io":
      non_blocking_io = e.data.value;
      break;
    case "interactive":
      interactiveBufferString += e.data.cmd;
      break;
    case "interrupt":
      intController.changeState(e.data.state);
      break;
    case "add_files":
      files = e.data.files;
      break;
    case "start":
      console.log(e.data.args);
      Module.arguments = e.data.args;
      // A debug session runs no instruction by itself. `aleStartRunLoop` sees
      // this flag and waits for a command of the page instead.
      debug_session = !!e.data.debug;
      if(e.data.args.includes("--interactive")){
        postMessage({type:"status", status:{running:true, debugging:true}});
      }else{
        postMessage({type:"status", status:{running:true, debug: debug_session}});
      } 
      importScripts("whisper.js");
      break;

    case "dbg_step":
      dbgStep();
      break;

    case "dbg_run":
      dbgRun(e.data.breakpoints);
      break;

    case "dbg_stop":
      dbgStop();
      break;

    case "dbg_mem":
      dbgViewMem(e.data.addr, e.data.len);
      break;

    case "dbg_find":
      dbgFindData(e.data.addr, e.data.forward, e.data.gap);
      break;

    case 'sync':
      // The bytes that a device wrote. The message gets no answer: the worker
      // flushes its own output, see `BusSync`.
      bus_sync.merge(e.data.buffer);
      break;

    case "load_syscall":
      syscall_emulator.register(parseInt(e.data.number), e.data.code);
      break;

    case "disable_syscall":
      syscall_emulator.unregister(parseInt(e.data.number));
      break;

    case 'interrupt_enabled':
      intController.interrupt_enabled = e.data.value;
      break;
    
    case 'set_freq_limit':
      let value = e.data.value;
      if(value == 1000){
        simulator_sleep[2] = 1;
      }else{
        simulator_sleep[2] = 1000*(1/value);
      } 
      break;
    case "set_int_delay":
      simulator_int_inst_delay = e.data.value;
      break;
  }
};

class MMIO{
  constructor(size){
    this.sharedBuffer = new ArrayBuffer(size);
    this.memory = [];
    this.memory[1] = new Uint8Array(this.sharedBuffer);
    this.memory[2] = new Uint16Array(this.sharedBuffer);
    this.memory[4] = new Uint32Array(this.sharedBuffer);
    this.size = this.sharedBuffer.byteLength;
  }

  load(addr, size){
    addr &= 0xFFFF;
    if(addr > this.size){
      postMessage({type: "sim_log", subtype: "error", msg: "MMIO Access Error"});
    }
    return this.memory[size][(addr/size) | 0];
  }

  store(addr, size, value){
    addr &= 0xFFFF;
    if(addr > this.size){
      postMessage({type: "sim_log", subtype: "error", msg: "MMIO Access Error"});
    }
    this.memory[size][(addr/size) | 0] = value;
    bus_sync.add_mmio_update(addr, size, value);
  }

  update_store(addr, size, value){
    addr &= 0xFFFF;
    this.memory[size][(addr/size) | 0] = value;
  }
}

var mmio = new MMIO(0x10000);

/*
 * ─── The bus between the core and the page ──────────────────────────────────
 *
 * The output of the program and the MMIO bytes that the core wrote go to the
 * page in one `sync` message. The worker sends it on its own: after each
 * slice of a run, with each state of a debug session, and at the end of the
 * program. A long slice does not wait for its end: a write flushes by itself
 * when the buffer is large or when `flush_interval_ms` passed since the last
 * flush, so the terminal and the devices stay live.
 *
 * A `sync` message of the page carries the bytes that a device wrote. The
 * worker merges them and does not answer. An answer to every message made a
 * ping-pong with no delay between the two threads, which kept both at full
 * load for the life of the worker, also while a debug session was stopped.
 */
class BusSync{
  constructor(mmio){
    this.mmio = mmio;
    this.stdout_buffer = "";
    this.stderr_buffer = "";
    this.mmio_buffer = new Uint8Array(0x10000);
    this.dirty_flags = new Uint8Array(0x10000);
    this.dirty_indices = new Uint32Array(0x10000);
    this.dirty_count = 0;
    this.last_flush_time = performance.now();
    this.flush_interval_ms = 16;
    this.max_buffer_size = 4096;
  }

  add_mmio_update(addr, size, value){
    for (let i = 0; i < size; i++) {
      const idx = (addr + i) & 0xFFFF;
      this.mmio_buffer[idx] = (value >> (i*8)) & 0xFF;
      if(this.dirty_flags[idx] === 0){
        this.dirty_flags[idx] = 1;
        this.dirty_indices[this.dirty_count++] = idx;
      }
    }
    // A device must see the write also when the program never prints.
    this.check_auto_flush();
  }

  add_stdout(text){
    this.stdout_buffer += `${text}\n`;
    this.check_auto_flush();
  }

  add_stderr(text){
    this.stderr_buffer += `${text}\n`;
    this.check_auto_flush();
  }

  /** Flush when the buffer is large or when the last flush is old. */
  check_auto_flush(){
    const buffer_len = this.stdout_buffer.length + this.stderr_buffer.length;
    if(buffer_len >= this.max_buffer_size ||
       performance.now() - this.last_flush_time >= this.flush_interval_ms){
      this.sync();
    }
  }

  /** Take the bytes that a device wrote. A byte that the core wrote since the
   *  last flush keeps its value: the processor has priority. */
  merge(extern_mmio_buffer){
    if(!extern_mmio_buffer) return;
    for (const i in extern_mmio_buffer) {
      if(this.dirty_flags[i] === 0){
        this.mmio.memory[1][i] = extern_mmio_buffer[i];
      }
    }
  }

  /** Send what the buffers hold. Nothing to send: no message. */
  sync(){
    if(this.stdout_buffer.length === 0 && this.stderr_buffer.length === 0 &&
       this.dirty_count === 0){
      return;
    }
    let mmio_updates = null;
    if(this.dirty_count > 0){
      mmio_updates = {};
      for (let i = 0; i < this.dirty_count; i++) {
        const idx = this.dirty_indices[i];
        mmio_updates[idx] = this.mmio_buffer[idx];
        this.dirty_flags[idx] = 0;
      }
      this.dirty_count = 0;
    }
    postMessage({type: "sync", mmio_buffer: mmio_updates, stdout: this.stdout_buffer,
                 stderr: this.stderr_buffer});
    this.stdout_buffer = "";
    this.stderr_buffer = "";
    this.last_flush_time = performance.now();
  }

}

var bus_sync = new BusSync(mmio);

class InterruptionController{
  constructor(){
    this.state = 0;
    this.interrupt_enabled = 1;
  }

  changeState(state){
    this.state = state;
  }

  get interrupt(){
    let res = this.state;
    this.state = 0;
    return res;
  }

  get interruptEnabled(){
    return this.interrupt_enabled;
  }
}

class SyscallEmulator{
  constructor(){
    this.syscalls = [];
  }

  register(number, code){
    this.syscalls[number] = code;
  }

  unregister(number){
    delete this.syscalls[number];
  }

  run(a0, a1, a2, a3, a7){
    if(a7 in this.syscalls){
      var sendMessage = function(msg){
        postMessage({type: "device_message", syscall: a7, message: msg});
        if(syscall_delay){
          let start = performance.now();
          while(performance.now() - start < syscall_delay);
        }
      };
      eval(this.syscalls[a7]);
      return a0;
    }else{
      var text = "Invalid syscall: " + a7;
      postMessage({type: "sim_log", subtype: "error", msg: text});
      return 0;
    }
  }
}

var syscall_emulator = new SyscallEmulator();
var intController = new InterruptionController();


function getStdin (count){
  if(stdinBuffer.length == 0 && !non_blocking_io){
    wait_for_input_alert();
    return -1;
  }
  var res = stdinBuffer.slice(0, count);
  stdinBuffer = stdinBuffer.slice(count);
  return res;
}

var last_wait_for_input_alert_sent = 0;
function wait_for_input_alert(){
  if(performance.now() - last_wait_for_input_alert_sent > 5000){
    postMessage({type: "sim_log", subtype: "info", msg: "Waiting for Input..."});
    last_wait_for_input_alert_sent = performance.now();
  }
}

function getInteractiveCommand (){
  let res = interactiveBufferString;
  interactiveBufferString = "";
  return res;
}

function initFS() {
  console.log(files);
  FS.init(null, null, null);
  FS.mkdir('/working');
  if(files){
    FS.mount(WORKERFS, {
      files: files, // Array of File objects or FileList
    }, '/working');
    for (let index = 0; index < files.length; index++) {
      FS.symlink('/working/' + files[index].name, '/' + files[index].name.replace(" ", "_"));
    }
  }
}

function finishExec() {
  // Send the output that is still in the buffer before the host sees the
  // stop.
  bus_sync.sync();
  // A debug session keeps its worker after the program ends, so that the page
  // can still show the last state. The host reads this flag and does not
  // restart. `modules/simulator.js` holds the other half.
  postMessage({type:"status", status:{finish:true, debug: debug_session}});
}

/*
 * ─── The slice loop ─────────────────────────────────────────────────────────
 *
 * Step 8 of `local/optimize-whisper.md` took Asyncify out of the module, so
 * the core cannot sleep. `main` sets the session up and returns, and this loop
 * calls `_ale_run_slice(budget)` until the program is finished. The messages
 * of the host arrive between two slices, which is what the sleep did before.
 *
 * The budget is the period of the interrupt test of the core
 * (`simulator_int_inst_delay` + 1), which is what the frequency control of the
 * application sets. The simulated frequency therefore does not change: the
 * core tests for an interrupt one time for each slice, at the same
 * instruction count as before, and the delay between two slices is the same
 * `simulator_sleep[0]` that the core slept.
 *
 * With interrupts off there is nothing to test, so the budget is 0 (no limit)
 * and the program runs in one slice, which is the fastest way.
 *
 * A module with Asyncify has no `_ale_run_slice` and runs the program inside
 * `main`. Then this loop does nothing and the worker behaves as before.
 */
var ALE_DONE = 0, ALE_RAN = 1, ALE_WAIT = 2;

function aleSliceBudget(){
  if(!intController.interruptEnabled) return 0;
  return simulator_int_inst_delay + 1;
}

function aleRunLoop(){
  var status = Module._ale_run_slice(aleSliceBudget());
  // The output of the slice goes to the page now, not with the next message.
  bus_sync.sync();
  if(status === ALE_DONE) return;
  // ALE_WAIT: the core waits for the host, either for a character on the
  // standard input or for a command of the interactive shell.
  var delay = status === ALE_WAIT ? 10 : simulator_sleep[0];
  setTimeout(aleRunLoop, delay);
}

function aleStartRunLoop(){
  if(typeof Module._ale_run_slice !== "function"){
    if(debug_session) postDebugFailure(["_ale_run_slice"]);
    return;
  }
  if(debug_session){
    // A module without the debug API cannot answer a step. The page must hear
    // that now: a session that says nothing looks like a session that is slow.
    var missing = aleDebugApiMissing();
    if(missing.length){
      postDebugFailure(missing);
      return;
    }
    // The program is loaded and no instruction has run. The hart is at its
    // entry point, which is where a debug session starts.
    debug_ready = true;
    postDebugState("ready");
    return;
  }
  aleRunLoop();
}


/*
 * ─── The debugger ───────────────────────────────────────────────────────────
 *
 * A debug session does not run by itself. The page sends `dbg_step` and
 * `dbg_run`, and each answer carries the state of the hart: the program
 * counter, the registers, the part of memory that the page asked for with
 * `dbg_mem`, and the bytes that the last instruction read or wrote.
 *
 * The module exports the state (`patches/0008-expose-a-debug-api.patch`), so
 * no command of the interactive shell is on this path. A step is one call of
 * `_ale_run_slice(1)` and the values come from `_ale_pc` and its neighbours.
 *
 * `_ale_pc` after a slice is the address of the instruction that the *next*
 * slice runs. A run therefore tests the breakpoints after each instruction
 * and stops **before** it runs the instruction of a breakpoint.
 *
 * A run gives the worker its event loop back between two tasks, so that a
 * `dbg_stop` message can arrive.
 *
 * The size of a task:
 *
 * With a breakpoint the run takes the program counter after each instruction,
 * so each instruction is a slice of its own. 20,000 of them take some
 * milliseconds, which is the delay of the stop button.
 *
 * Without a breakpoint nothing has to happen between two instructions, so the
 * task is one large slice. A smaller one would make the run slower than the
 * run button: a task has the delay of a timer, which is longer than the slice
 * itself.
 */
var DEBUG_BREAK_CHUNK = 20000;
var DEBUG_FREE_CHUNK = 2000000;

/* The functions of the debug API that a session uses.
 * `patches/0008-expose-a-debug-api.patch` adds them to the module,
 * `patches/0009-record-the-last-memory-access.patch` adds the access ones, and
 * `patches/0010-find-the-parts-of-memory-that-hold-data.patch` adds the
 * search. */
var DEBUG_API = ["_ale_pc", "_ale_reg", "_ale_inst_count", "_ale_disasm",
                 "_ale_text_buffer", "_ale_mem_size", "_ale_mem_buffer",
                 "_ale_read_mem", "_ale_access_kind", "_ale_access_addr",
                 "_ale_access_size", "_ale_find_data"];

/** The number of integer registers of the hart. */
var DEBUG_REG_COUNT = 32;

/** The functions of DEBUG_API that this module does not have. */
function aleDebugApiMissing(){
  return DEBUG_API.filter(function(name){
    return typeof Module[name] !== "function";
  });
}

/**
 * Tell the page that this module cannot hold a debug session. A module without
 * the debug API is nearly always an older copy that the cache of the service
 * worker still answers with.
 */
function postDebugFailure(missing){
  postMessage({
    type: "dbg_state",
    status: "no session",
    pc: 0, count: 0, inst: "", regs: null, mem: null, mem_size: 0,
    access: null, running: false, ended: false,
    error: "The simulator module has no debug API (" + missing.join(", ") +
           "). The browser is answering with an older copy of " +
           "modules/whisper.js. Reload the page and take the update. If " +
           "no update is offered, clear the site data of this page in the " +
           "browser and reload."
  });
}

/**
 * The integer registers of the hart, from x0 to x31.
 *
 * @returns {number[]} each value as an unsigned 32 bit number
 */
function dbgReadRegs(){
  var regs = new Array(DEBUG_REG_COUNT);
  for(var i = 0; i < DEBUG_REG_COUNT; i++) regs[i] = Module._ale_reg(i) >>> 0;
  return regs;
}

/**
 * The bytes that the last instruction read or wrote, which the page marks.
 * It is null when that instruction was not a load or a store. An atomic
 * instruction counts as a write: it reads and then writes the same bytes.
 *
 * @returns {?{addr: number, len: number, write: boolean}}
 */
function dbgReadAccess(){
  var kind = Module._ale_access_kind();
  if(kind === 0) return null;
  return {
    addr: Module._ale_access_addr() >>> 0,
    len: Module._ale_access_size() >>> 0,
    write: kind === 2
  };
}

/**
 * The size of the buffer that `_ale_read_mem` fills, in bytes. A read of more
 * bytes takes more than one call.
 */
var DEBUG_MEM_CHUNK = 4096;

/** The most bytes that one request of the page can ask for. */
var DEBUG_MEM_MAX = 16 * DEBUG_MEM_CHUNK;

/**
 * The part of the memory of the guest that the page shows: the address of its
 * first byte and its length. The page sets it with a `dbg_mem` message, and
 * every stop of the session carries the bytes of this part.
 */
var debug_mem_addr = 0;
var debug_mem_len = 0;

/**
 * `len` bytes of the memory of the guest, from the address `addr`.
 *
 * The copy stops at the first address that the hart cannot read, so the
 * answer is shorter than `len` when the part reaches past the end of the
 * memory.
 *
 * @returns {Uint8Array}
 */
function dbgReadMem(addr, len){
  var out = new Uint8Array(len);
  var at = Module._ale_mem_buffer();
  var done = 0;
  while(done < len){
    var want = Math.min(DEBUG_MEM_CHUNK, len - done);
    var got = Module._ale_read_mem((addr + done) >>> 0, want);
    if(got <= 0) break;
    out.set(HEAPU8.subarray(at, at + got), done);
    done += got;
    if(got < want) break;
  }
  return done === len? out : out.slice(0, done);
}

/**
 * The part of memory that the page asked for, with its bytes as they are now.
 * Null while the page asked for none.
 */
function dbgMemWindow(){
  if(debug_mem_len === 0) return null;
  return {addr: debug_mem_addr, bytes: dbgReadMem(debug_mem_addr, debug_mem_len)};
}

/**
 * The page asks for another part of memory. A session that is stopped answers
 * now, with a `dbg_mem` message. A session that runs, or that is not up yet,
 * keeps the request: the state of its next stop carries the bytes.
 */
function dbgViewMem(addr, len){
  debug_mem_addr = addr >>> 0;
  debug_mem_len = Math.min(Math.max(0, len | 0), DEBUG_MEM_MAX);
  if(!debug_ready || debug_running) return;
  var answer = {type: "dbg_mem", mem: null, mem_size: 0};
  try{
    answer.mem = dbgMemWindow();
    answer.mem_size = Module._ale_mem_size();
  }catch(error){
    answer.error = "The simulator module did not answer: " + error;
  }
  postMessage(answer);
}

/**
 * The page asks for a part of memory that holds data: the first part that
 * starts at or after `addr` when `forward` is true, or the last part that
 * starts before it when `forward` is false. A run of `gap` zero bytes ends a
 * part. The module scans the memory of the guest in place, so the answer is
 * a few tens of milliseconds for the whole memory.
 *
 * The answer is a `dbg_found` message with the first address of the part, or
 * null when no part is on that side. A session that runs, or that is not up,
 * answers null too: the core is not free to scan.
 */
function dbgFindData(addr, forward, gap){
  var answer = {type: "dbg_found", addr: null, forward: !!forward};
  if(debug_ready && !debug_running){
    try{
      var found = Module._ale_find_data(addr >>> 0, forward? 1 : 0, gap >>> 0);
      if(found >= 0) answer.addr = found;
    }catch(error){
      answer.error = "The simulator module did not answer: " + error;
    }
  }
  postMessage(answer);
}

function postDebugState(status, extra){
  var state = {
    type: "dbg_state",
    status: status,
    pc: 0,
    count: 0,
    inst: "",
    regs: null,
    mem: null,
    mem_size: 0,
    access: null,
    running: debug_running,
    ended: debug_ended
  };
  try{
    if(debug_ready){
      state.pc = Module._ale_pc() >>> 0;
      state.count = Module._ale_inst_count();
      var len = Module._ale_disasm(state.pc);
      if(len > 0){
        var at = Module._ale_text_buffer();
        state.inst = new TextDecoder().decode(HEAPU8.subarray(at, at + len));
      }
      // A "running" state is the report between two chunks of a run. The page
      // keeps the registers and the memory of the last stop on screen, so the
      // calls into the module would have no reader.
      if(status !== "running"){
        state.regs = dbgReadRegs();
        state.mem = dbgMemWindow();
        state.mem_size = Module._ale_mem_size();
        state.access = dbgReadAccess();
      }
    }
  }catch(error){
    // The page waits for this message. A session that cannot read its state
    // must say so, and not leave the page with a promise that never ends.
    debug_ready = false;
    debug_running = false;
    state.status = "no session";
    state.running = false;
    state.error = "The simulator module did not answer: " + error;
  }
  if(extra) Object.assign(state, extra);
  // The output of the program goes with the state, so the terminal never
  // shows a line after the page says that the step is over.
  bus_sync.sync();
  postMessage(state);
}

/** True when the session cannot run an instruction now. */
function dbgBusy(){
  if(!debug_ready || debug_ended){
    postDebugState(debug_ended? "ended" : "no session");
    return true;
  }
  return false;
}

function dbgStep(){
  if(debug_running) return;      // A run owns the core until it stops.
  if(dbgBusy()) return;
  var status = Module._ale_run_slice(1);
  if(status === ALE_DONE){
    debug_ended = true;
    postDebugState("ended");
  }else if(status === ALE_WAIT){
    // The instruction is a read with no input. It did not retire, and it runs
    // again when a character arrives.
    postDebugState("waiting");
  }else{
    postDebugState("stopped");
  }
}

function dbgRun(breakpoints){
  if(debug_running) return;
  debug_breakpoints = new Set(breakpoints || []);
  if(dbgBusy()) return;
  debug_running = true;
  dbgRunChunk();
}

function dbgStop(){
  if(!debug_running) return;
  debug_running = false;
  postDebugState("stopped");
}

function dbgRunChunk(){
  if(!debug_running) return;
  var hunting = debug_breakpoints.size > 0;
  var slices = hunting? DEBUG_BREAK_CHUNK : 1;
  var budget = hunting? 1 : DEBUG_FREE_CHUNK;
  for(var i = 0; i < slices; i++){
    var status = Module._ale_run_slice(budget);
    if(status === ALE_DONE){
      debug_running = false;
      debug_ended = true;
      postDebugState("ended");
      return;
    }
    if(status === ALE_WAIT){
      // The program waits for input. The run goes on, and the next task comes
      // after the host had the time to send a character.
      postDebugState("waiting");
      setTimeout(dbgRunChunk, 10);
      return;
    }
    if(hunting && debug_breakpoints.has(Module._ale_pc() >>> 0)){
      debug_running = false;
      postDebugState("breakpoint");
      return;
    }
  }
  postDebugState("running");
  setTimeout(dbgRunChunk, 0);
}

var xhr = new XMLHttpRequest();
function getDebugMsg(){
  postGDBWaiting = 1;
  while(1){
    try{
      xhr.open("GET", "http://127.0.0.1:5689/gdbInput", false);  // synchronous request
      xhr.send(null);
      if(xhr.status === 200){
        return xhr.responseText;
      }
    }catch(e){
      if(postGDBWaiting){
        postMessage({type: "sim_log", subtype: "info", msg: "Waiting for GDB..."});
        postGDBWaiting = 0;
      }
    }
  }
}

var xhrS = new XMLHttpRequest();
function sendDebugMsg(msg){
  postGDBWaiting = 1;
  while(1){
    try {
      xhrS.open("POST", "http://127.0.0.1:5689/gdbInput", false);  // synchronous request
      xhrS.send(msg);
      if(xhrS.status === 200){
        return;
      }
    } catch (error) {
      if(postGDBWaiting){
        postMessage({type: "sim_log", subtype: "info", msg: "Waiting for GDB..."});
        postGDBWaiting = 0;
      }
    }
  }
}

var Module = {
  // arguments : ["--version"],
  // No "s" and no "u": RISC-V ALE runs machine mode only. The "s" makes
  // Hart::isRvs() true, which makes Hart::run treat every run as complex and
  // use the slow runUntilAddress loop instead of simpleRun.
  arguments : ["--newlib", "/working/ex2", "--isa", "acdfim", "--setreg", "sp=0x10000"],
  preRun : [initFS],
  postRun : [aleStartRunLoop],
  print : bus_sync.add_stdout.bind(bus_sync),
  printErr : bus_sync.add_stderr.bind(bus_sync)
};

postMessage({type:"status", status:{starting:true}});