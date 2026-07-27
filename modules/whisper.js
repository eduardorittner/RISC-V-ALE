/* Custom Rust Drop-in Replacement for whisper.js (RISC-V ALE) */
(function() {
  // 1. Run preRun hooks (e.g. initFS)
  var mod = self.Module || {};
  if (mod.preRun) {
    for (var i = 0; i < mod.preRun.length; i++) {
      try { mod.preRun[i](); } catch (e) {}
    }
  }

  // 2. Host FFI Callback bindings for Rust WASM
  self.customSyscall = function(a0, a1, a2, a3, a7) {
    if (typeof syscall_emulator !== 'undefined' && syscall_emulator.syscalls && syscall_emulator.syscalls[a7] !== undefined) {
      var ret = syscall_emulator.run(a0, a1, a2, a3, a7);
      return ret !== undefined ? ret : 1;
    }
    return 0;
  };
  self.jsExternalInterrupt = function() {
    return (typeof intController !== 'undefined') ? intController.interrupt : 0;
  };
  self.jsInterruptEnabled = function() {
    return (typeof intController !== 'undefined') ? intController.interruptEnabled : 1;
  };
  self.jsGetIntInstDelay = function() {
    return (typeof simulator_int_inst_delay !== 'undefined') ? simulator_int_inst_delay : 1000;
  };
  self.jsGetSleepDuration = function(type) {
    return (typeof simulator_sleep !== 'undefined') ? simulator_sleep[type] : 0;
  };
  self.jsReadMMIO = function(addr, size) {
    return (typeof mmio !== 'undefined') ? mmio.load(addr, size) : 0;
  };
  self.jsWriteMMIO = function(addr, size, val) {
    if (typeof mmio !== 'undefined') mmio.store(addr, size, val);
  };
  self.jsSimStop = function() {
    if (typeof finishExec === 'function') finishExec();
  };
  self.readFromStdin = function(buf_ptr, count) {
    if (typeof getStdin !== 'function') return -1;
    var input = getStdin(count);
    if (input === -1 || !input) return -1;
    if (typeof self.wasmMemory !== 'undefined') {
      new Uint8Array(self.wasmMemory.buffer).set(input, buf_ptr);
    }
    return input.length;
  };
  self.readInteractiveCommand = function(pstr) {
    if (typeof getInteractiveCommand !== 'function') return 0;
    var cmd = getInteractiveCommand();
    if (!cmd) return 0;
    if (typeof self.wasmMemory !== 'undefined') {
      var encoder = new TextEncoder();
      var bytes = encoder.encode(cmd + "\0");
      new Uint8Array(self.wasmMemory.buffer).set(bytes, pstr);
    }
    return 1;
  };
  self.jsPrint = function(msg) {
    var currentMod = self.Module || {};
    if (typeof currentMod.print === 'function') {
      if (msg.endsWith('\n')) {
        msg = msg.slice(0, -1);
      }
      currentMod.print(msg);
    } else {
      console.log(msg);
    }
  };
  self.jsPrintErr = function(msg) {
    var currentMod = self.Module || {};
    if (typeof currentMod.printErr === 'function') {
      if (msg.endsWith('\n')) {
        msg = msg.slice(0, -1);
      }
      currentMod.printErr(msg);
    } else {
      console.warn(msg);
    }
  };

  // 3. WASM & Bindgen Runtime Glue
  let heap = new Array(1024).fill(undefined);
  heap.push(undefined, null, true, false);
  let heap_next = heap.length;

  function addHeapObject(obj) {
    if (heap_next === heap.length) heap.push(heap.length + 1);
    const idx = heap_next;
    heap_next = heap[idx];
    heap[idx] = obj;
    return idx;
  }

  function dropObject(idx) {
    if (idx < 1028) return;
    heap[idx] = heap_next;
    heap_next = idx;
  }

  function getObject(idx) { return heap[idx]; }

  function takeObject(idx) {
    const ret = getObject(idx);
    dropObject(idx);
    return ret;
  }

  function isLikeNone(x) {
    return x === undefined || x === null;
  }

  let cachedDataViewMemory0 = null;
  function getDataViewMemory0() {
    if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
      cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
    }
    return cachedDataViewMemory0;
  }

  let cachedUint8ArrayMemory0 = null;
  function getUint8ArrayMemory0() {
    if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
      cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
    }
    return cachedUint8ArrayMemory0;
  }

  function getArrayU8FromWasm0(ptr, len) {
    ptr = ptr >>> 0;
    return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
  }

  let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
  cachedTextDecoder.decode();
  let numBytesDecoded = 0;
  function decodeText(ptr, len) {
    numBytesDecoded += len;
    if (numBytesDecoded >= 2146435072) {
      cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
      cachedTextDecoder.decode();
      numBytesDecoded = len;
    }
    return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
  }

  function getStringFromWasm0(ptr, len) {
    return decodeText(ptr >>> 0, len);
  }

  const cachedTextEncoder = new TextEncoder();
  let WASM_VECTOR_LEN = 0;

  function passArray8ToWasm0(arg, malloc) {
    const ptr = malloc(arg.length * 1, 1) >>> 0;
    getUint8ArrayMemory0().set(arg, ptr / 1);
    WASM_VECTOR_LEN = arg.length;
    return ptr;
  }

  function passStringToWasm0(arg, malloc, realloc) {
    if (realloc === undefined) {
      const buf = cachedTextEncoder.encode(arg);
      const ptr = malloc(buf.length, 1) >>> 0;
      getUint8ArrayMemory0().subarray(ptr, ptr + buf.length).set(buf);
      WASM_VECTOR_LEN = buf.length;
      return ptr;
    }
    let len = arg.length;
    let ptr = malloc(len, 1) >>> 0;
    const mem = getUint8ArrayMemory0();
    let offset = 0;
    for (; offset < len; offset++) {
      const code = arg.charCodeAt(offset);
      if (code > 0x7F) break;
      mem[ptr + offset] = code;
    }
    if (offset !== len) {
      if (offset !== 0) arg = arg.slice(offset);
      ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
      const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
      const ret = cachedTextEncoder.encodeInto(arg, view);
      offset += ret.written;
      ptr = realloc(ptr, len, offset, 1) >>> 0;
    }
    WASM_VECTOR_LEN = offset;
    return ptr;
  }

  function debugString(val) {
    const type = typeof val;
    if (type == 'number' || type == 'boolean' || val == null) return `${val}`;
    if (type == 'string') return `"${val}"`;
    if (type == 'symbol') return val.description ? `Symbol(${val.description})` : 'Symbol';
    if (type == 'function') return val.name ? `Function(${val.name})` : 'Function';
    if (Array.isArray(val)) {
      return '[' + val.map(debugString).join(', ') + ']';
    }
    return String(val);
  }

  function handleError(f, args) {
    try {
      return f.apply(this, args);
    } catch (e) {
      wasm.__wbindgen_export3(addHeapObject(e));
    }
  }

  function __wbg_get_imports() {
    const import0 = {
        __proto__: null,
        __wbg_Error_92b29b0548f8b746: function(arg0, arg1) {
            const ret = Error(getStringFromWasm0(arg0, arg1));
            return addHeapObject(ret);
        },
        __wbg___wbindgen_debug_string_c25d447a39f5578f: function(arg0, arg1) {
            const ret = debugString(getObject(arg1));
            const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            const len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_string_get_b0ca35b86a603356: function(arg0, arg1) {
            const obj = getObject(arg1);
            const ret = typeof(obj) === 'string' ? obj : undefined;
            var ptr1 = isLikeNone(ret) ? 0 : passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
            var len1 = WASM_VECTOR_LEN;
            getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
            getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
        },
        __wbg___wbindgen_throw_344f42d3211c4765: function(arg0, arg1) {
            throw new Error(getStringFromWasm0(arg0, arg1));
        },
        __wbg_customSyscall_9668b752672a4a3f: function() { return handleError(function (arg0, arg1, arg2, arg3, arg4) {
            const ret = customSyscall(arg0, arg1, arg2, arg3, arg4);
            return ret;
        }, arguments); },
        __wbg_get_507a50627bffa49b: function(arg0, arg1) {
            const ret = getObject(arg0)[arg1 >>> 0];
            return addHeapObject(ret);
        },
        __wbg_jsExternalInterrupt_d80b4305544acc84: function() {
            const ret = jsExternalInterrupt();
            return ret;
        },
        __wbg_jsGetIntInstDelay_968b86aceef69356: function() {
            const ret = jsGetIntInstDelay();
            return ret;
        },
        __wbg_jsInterruptEnabled_5ea7d9a10e3b0bb3: function() {
            const ret = jsInterruptEnabled();
            return ret;
        },
        __wbg_jsPrintErr_25ab4bd2b42e9094: function(arg0, arg1) {
            jsPrintErr(getStringFromWasm0(arg0, arg1));
        },
        __wbg_jsPrint_67ca962fb8a20bed: function(arg0, arg1) {
            jsPrint(getStringFromWasm0(arg0, arg1));
        },
        __wbg_jsReadMMIO_0084112662d3ea67: function(arg0, arg1) {
            const ret = jsReadMMIO(arg0 >>> 0, arg1 >>> 0);
            return ret;
        },
        __wbg_jsSimStop_dd0f298c99564fb4: function() {
            jsSimStop();
        },
        __wbg_jsWriteMMIO_2f3fffb502ce9634: function(arg0, arg1, arg2) {
            jsWriteMMIO(arg0 >>> 0, arg1 >>> 0, arg2 >>> 0);
        },
        __wbg_length_370319915dc99107: function(arg0) {
            const ret = getObject(arg0).length;
            return ret;
        },
        __wbg_new_32b398fb48b6d94a: function() {
            const ret = new Array();
            return addHeapObject(ret);
        },
        __wbg_new_da52cf8fe3429cb2: function() {
            const ret = new Object();
            return addHeapObject(ret);
        },
        __wbg_readFromStdin_2e4508d259d094e5: function(arg0, arg1) {
            const ret = readFromStdin(arg0 >>> 0, arg1 >>> 0);
            return ret;
        },
        __wbg_set_6be42768c690e380: function(arg0, arg1, arg2) {
            getObject(arg0)[takeObject(arg1)] = takeObject(arg2);
        },
        __wbg_set_8a16b38e4805b298: function(arg0, arg1, arg2) {
            getObject(arg0)[arg1 >>> 0] = takeObject(arg2);
        },
        __wbindgen_cast_0000000000000001: function(arg0) {
            return addHeapObject(arg0);
        },
        __wbindgen_cast_0000000000000002: function(arg0, arg1) {
            return addHeapObject(getStringFromWasm0(arg0, arg1));
        },
        __wbindgen_cast_0000000000000003: function(arg0) {
            return addHeapObject(BigInt.asUintN(64, arg0));
        },
        __wbindgen_object_clone_ref: function(arg0) {
            return addHeapObject(getObject(arg0));
        },
        __wbindgen_object_drop_ref: function(arg0) {
            takeObject(arg0);
        },
    };
    return {
        __proto__: null,
        "./rust_whisper_bg.js": import0,
    };
  }

  const SimulatorFinalization = (typeof FinalizationRegistry === 'undefined')
    ? { register: () => {}, unregister: () => {} }
    : new FinalizationRegistry(ptr => wasm.__wbg_simulator_free(ptr, 1));

  class Simulator {
    __destroy_into_raw() {
        const ptr = this.__wbg_ptr;
        this.__wbg_ptr = 0;
        SimulatorFinalization.unregister(this);
        return ptr;
    }
    free() {
        const ptr = this.__destroy_into_raw();
        wasm.__wbg_simulator_free(ptr, 0);
    }
    add_breakpoint(addr) {
        wasm.simulator_add_breakpoint(this.__wbg_ptr, addr);
    }
    clear_breakpoints() {
        wasm.simulator_clear_breakpoints(this.__wbg_ptr);
    }
    debug_step() {
        const ret = wasm.simulator_debug_step(this.__wbg_ptr);
        return takeObject(ret);
    }
    debug_step_out() {
        const ret = wasm.simulator_debug_step_out(this.__wbg_ptr);
        return takeObject(ret);
    }
    debug_step_over() {
        const ret = wasm.simulator_debug_step_over(this.__wbg_ptr);
        return takeObject(ret);
    }
    disassemble_range(start_addr, len) {
        const ret = wasm.simulator_disassemble_range(this.__wbg_ptr, start_addr, len);
        return takeObject(ret);
    }
    get_snapshot_js(is_breakpoint, hit_address) {
        const ret = wasm.simulator_get_snapshot_js(this.__wbg_ptr, is_breakpoint, hit_address);
        return takeObject(ret);
    }
    load_binary(binary_bytes, args_js) {
        const ptr0 = passArray8ToWasm0(binary_bytes, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.simulator_load_binary(this.__wbg_ptr, ptr0, len0, addHeapObject(args_js));
        return ret >>> 0;
    }
    constructor() {
        const ret = wasm.simulator_new();
        this.__wbg_ptr = ret;
        SimulatorFinalization.register(this, this.__wbg_ptr, this);
        return this;
    }
    read_memory_range(addr, len) {
        try {
            const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
            wasm.simulator_read_memory_range(retptr, this.__wbg_ptr, addr, len);
            var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
            var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
            var v1 = getArrayU8FromWasm0(r0, r1).slice();
            wasm.__wbindgen_export4(r0, r1 * 1, 1);
            return v1;
        } finally {
            wasm.__wbindgen_add_to_stack_pointer(16);
        }
    }
    remove_breakpoint(addr) {
        wasm.simulator_remove_breakpoint(this.__wbg_ptr, addr);
    }
    run_full() {
        const ret = wasm.simulator_run_full(this.__wbg_ptr);
        return ret;
    }
    run_until_breakpoint() {
        const ret = wasm.simulator_run_until_breakpoint(this.__wbg_ptr);
        return takeObject(ret);
    }
    set_debug_mode(enabled) {
        wasm.simulator_set_debug_mode(this.__wbg_ptr, enabled);
    }
    write_memory_byte(addr, val) {
        wasm.simulator_write_memory_byte(this.__wbg_ptr, addr, val);
    }
    write_register(reg_idx, val) {
        wasm.simulator_write_register(this.__wbg_ptr, reg_idx, val);
    }
  }

  self.Simulator = Simulator;

  var wasm;
  function initSync(module) {
    if (wasm !== undefined) return wasm;
    const imports = __wbg_get_imports();
    if (!(module instanceof WebAssembly.Module)) {
      module = new WebAssembly.Module(module);
    }
    const instance = new WebAssembly.Instance(module, imports);
    wasm = instance.exports;
    cachedDataViewMemory0 = null;
    cachedUint8ArrayMemory0 = null;
    return wasm;
  }

  // 4. Binary File Buffer Extractor
  function getBinaryBytes() {
    var currentMod = self.Module || {};
    var args = currentMod.arguments || [];
    var filename = null;
    for (var i = 0; i < args.length; i++) {
      if (args[i] && !args[i].startsWith('-')) {
        filename = args[i].replace('/working/', '').replace(/^\//, '');
        break;
      }
    }
    if (typeof files !== 'undefined' && files && files.length > 0) {
      var reader = new FileReaderSync();
      if (filename) {
        for (var j = 0; j < files.length; j++) {
          var fname = files[j].name;
          if (fname === filename || fname.replace(/ /g, '_') === filename || filename.endsWith(fname)) {
            return new Uint8Array(reader.readAsArrayBuffer(files[j]));
          }
        }
      }
      return new Uint8Array(reader.readAsArrayBuffer(files[0]));
    }
    return new Uint8Array([]);
  }

  // 5. Execution Runner
  try {
    var wasmModule = self.precompiledWhisperModule;
    if (!wasmModule) {
      var xhr = new XMLHttpRequest();
      xhr.open("GET", "whisper.wasm", false);
      xhr.responseType = "arraybuffer";
      xhr.send(null);
      wasmModule = new WebAssembly.Module(xhr.response);
    }
    initSync(wasmModule);
    self.wasmMemory = wasm.memory;
    var binaryBytes = getBinaryBytes();
    var currentMod = self.Module || {};
    var args = currentMod.arguments || [];

    self.wasmSimulator = new Simulator();
    let entryPoint = self.wasmSimulator.load_binary(binaryBytes, args);

    if (args.includes("--interactive") || self.debugModeActive) {
      self.wasmSimulator.set_debug_mode(true);
      let snapshot = self.wasmSimulator.get_snapshot_js(false, 0);
      postMessage({ type: "debug_state", state: snapshot });
    } else {
      self.wasmSimulator.run_full();
    }
  } catch (e) {
    console.error("Rust Whisper execution failure:", e);
    if (typeof finishExec === 'function') finishExec();
  }
})();
