let wasm_bindgen = (function(exports) {
    let script_src;
    if (typeof document !== 'undefined' && document.currentScript !== null) {
        script_src = new URL(document.currentScript.src, location.href).toString();
    }

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
        /**
         * @param {number} addr
         */
        add_breakpoint(addr) {
            wasm.simulator_add_breakpoint(this.__wbg_ptr, addr);
        }
        clear_breakpoints() {
            wasm.simulator_clear_breakpoints(this.__wbg_ptr);
        }
        /**
         * @returns {DebuggerSnapshot}
         */
        debug_step() {
            const ret = wasm.simulator_debug_step(this.__wbg_ptr);
            return takeObject(ret);
        }
        /**
         * @returns {DebuggerSnapshot}
         */
        debug_step_out() {
            const ret = wasm.simulator_debug_step_out(this.__wbg_ptr);
            return takeObject(ret);
        }
        /**
         * @returns {DebuggerSnapshot}
         */
        debug_step_over() {
            const ret = wasm.simulator_debug_step_over(this.__wbg_ptr);
            return takeObject(ret);
        }
        /**
         * @param {number} start_addr
         * @param {number} len
         * @returns {DisassembledInst[]}
         */
        disassemble_range(start_addr, len) {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.simulator_disassemble_range(retptr, this.__wbg_ptr, start_addr, len);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayJsValueFromWasm0(r0, r1).slice();
                wasm.__wbindgen_export3(r0, r1 * 4, 4);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @param {boolean} is_breakpoint
         * @param {number} hit_address
         * @returns {DebuggerSnapshot}
         */
        get_snapshot_js(is_breakpoint, hit_address) {
            const ret = wasm.simulator_get_snapshot_js(this.__wbg_ptr, is_breakpoint, hit_address);
            return takeObject(ret);
        }
        /**
         * @param {number} addr
         * @returns {string | undefined}
         */
        get_symbol_at(addr) {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.simulator_get_symbol_at(retptr, this.__wbg_ptr, addr);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                let v1;
                if (r0 !== 0) {
                    v1 = getStringFromWasm0(r0, r1).slice();
                    wasm.__wbindgen_export3(r0, r1 * 1, 1);
                }
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @returns {boolean}
         */
        has_custom_syscalls() {
            const ret = wasm.simulator_has_custom_syscalls(this.__wbg_ptr);
            return ret !== 0;
        }
        /**
         * @param {Uint8Array} binary_bytes
         * @param {Array<any>} args_js
         * @returns {number}
         */
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
        /**
         * @param {number} addr
         * @param {number} len
         * @returns {Uint8Array}
         */
        read_memory_range(addr, len) {
            try {
                const retptr = wasm.__wbindgen_add_to_stack_pointer(-16);
                wasm.simulator_read_memory_range(retptr, this.__wbg_ptr, addr, len);
                var r0 = getDataViewMemory0().getInt32(retptr + 4 * 0, true);
                var r1 = getDataViewMemory0().getInt32(retptr + 4 * 1, true);
                var v1 = getArrayU8FromWasm0(r0, r1).slice();
                wasm.__wbindgen_export3(r0, r1 * 1, 1);
                return v1;
            } finally {
                wasm.__wbindgen_add_to_stack_pointer(16);
            }
        }
        /**
         * @param {number} addr
         */
        remove_breakpoint(addr) {
            wasm.simulator_remove_breakpoint(this.__wbg_ptr, addr);
        }
        /**
         * @returns {number}
         */
        run_full() {
            const ret = wasm.simulator_run_full(this.__wbg_ptr);
            return ret;
        }
        /**
         * Run at most `budget` instructions and report why the slice ended. The
         * browser worker calls this in a `setTimeout` chain, so the message queue
         * keeps its turn while a program runs.
         * @param {number} budget
         * @returns {SliceOutcome}
         */
        run_slice(budget) {
            const ret = wasm.simulator_run_slice(this.__wbg_ptr, budget);
            return takeObject(ret);
        }
        /**
         * Run until a breakpoint, a halt or a trap stops the guest.
         *
         * This drives `run_slice`, which keeps the whole gap inside the CPU's
         * inner loop. It used to call `step_instruction` once per instruction,
         * paying the full per-step entry and exit — the breakpoint test, the
         * halt test and the error formatting — for every instruction between the
         * current PC and the breakpoint. A continue across a ten-million
         * instruction gap is the common case in a debug session.
         * @returns {DebuggerSnapshot}
         */
        run_until_breakpoint() {
            const ret = wasm.simulator_run_until_breakpoint(this.__wbg_ptr);
            return takeObject(ret);
        }
        /**
         * @param {boolean} enabled
         */
        set_debug_mode(enabled) {
            wasm.simulator_set_debug_mode(this.__wbg_ptr, enabled);
        }
        /**
         * @param {boolean} enabled
         */
        set_has_custom_syscalls(enabled) {
            wasm.simulator_set_has_custom_syscalls(this.__wbg_ptr, enabled);
        }
        /**
         * @param {number} addr
         * @param {number} val
         */
        write_memory_byte(addr, val) {
            wasm.simulator_write_memory_byte(this.__wbg_ptr, addr, val);
        }
        /**
         * @param {number} reg_idx
         * @param {number} val
         */
        write_register(reg_idx, val) {
            wasm.simulator_write_register(this.__wbg_ptr, reg_idx, val);
        }
    }
    if (Symbol.dispose) Simulator.prototype[Symbol.dispose] = Simulator.prototype.free;
    exports.Simulator = Simulator;

    /**
     * @param {Uint8Array} binary_bytes
     * @param {Array<any>} args_js
     * @returns {number}
     */
    function run_riscv_binary(binary_bytes, args_js) {
        const ptr0 = passArray8ToWasm0(binary_bytes, wasm.__wbindgen_export);
        const len0 = WASM_VECTOR_LEN;
        const ret = wasm.run_riscv_binary(ptr0, len0, addHeapObject(args_js));
        return ret;
    }
    exports.run_riscv_binary = run_riscv_binary;
    function __wbg_get_imports() {
        const import0 = {
            __proto__: null,
            __wbg_Error_92b29b0548f8b746: function(arg0, arg1) {
                const ret = Error(getStringFromWasm0(arg0, arg1));
                return addHeapObject(ret);
            },
            __wbg_String_8564e559799eccda: function(arg0, arg1) {
                const ret = String(getObject(arg1));
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
            __wbg_customSyscall_e98c12230ea68946: function(arg0, arg1, arg2, arg3, arg4) {
                const ret = customSyscall(arg0, arg1, arg2, arg3, arg4);
                return ret;
            },
            __wbg_error_a6fa202b58aa1cd3: function(arg0, arg1) {
                let deferred0_0;
                let deferred0_1;
                try {
                    deferred0_0 = arg0;
                    deferred0_1 = arg1;
                    console.error(getStringFromWasm0(arg0, arg1));
                } finally {
                    wasm.__wbindgen_export3(deferred0_0, deferred0_1, 1);
                }
            },
            __wbg_get_507a50627bffa49b: function(arg0, arg1) {
                const ret = getObject(arg0)[arg1 >>> 0];
                return addHeapObject(ret);
            },
            __wbg_jsExternalInterrupt_3f0d8d5dfdcef834: function() {
                const ret = jsExternalInterrupt();
                return ret;
            },
            __wbg_jsGetIntInstDelay_fbeceabb0f474f91: function() {
                const ret = jsGetIntInstDelay();
                return ret;
            },
            __wbg_jsInterruptEnabled_782b210431078bba: function() {
                const ret = jsInterruptEnabled();
                return ret;
            },
            __wbg_jsPrintErr_678b35b2d8db7452: function(arg0, arg1) {
                jsPrintErr(getStringFromWasm0(arg0, arg1));
            },
            __wbg_jsReadMMIO_2f2f76eddfab19b8: function(arg0, arg1) {
                const ret = jsReadMMIO(arg0 >>> 0, arg1 >>> 0);
                return ret;
            },
            __wbg_jsWriteMMIO_0542fcbc6c32d31f: function(arg0, arg1, arg2) {
                jsWriteMMIO(arg0 >>> 0, arg1 >>> 0, arg2 >>> 0);
            },
            __wbg_jsWriteStderr_9b1c16652ec0f224: function(arg0, arg1) {
                jsWriteStderr(getArrayU8FromWasm0(arg0, arg1));
            },
            __wbg_jsWriteStdout_913f6abcf12e7109: function(arg0, arg1) {
                jsWriteStdout(getArrayU8FromWasm0(arg0, arg1));
            },
            __wbg_length_370319915dc99107: function(arg0) {
                const ret = getObject(arg0).length;
                return ret;
            },
            __wbg_new_227d7c05414eb861: function() {
                const ret = new Error();
                return addHeapObject(ret);
            },
            __wbg_new_32b398fb48b6d94a: function() {
                const ret = new Array();
                return addHeapObject(ret);
            },
            __wbg_new_da52cf8fe3429cb2: function() {
                const ret = new Object();
                return addHeapObject(ret);
            },
            __wbg_notifyUnknownSyscall_211650ff2908b334: function(arg0, arg1, arg2, arg3, arg4) {
                notifyUnknownSyscall(arg0 >>> 0, arg1 >>> 0, arg2 >>> 0, arg3 >>> 0, arg4 >>> 0);
            },
            __wbg_readFromStdin_e6341eb86c251110: function(arg0, arg1) {
                const ret = readFromStdin(arg0 >>> 0, arg1 >>> 0);
                return ret;
            },
            __wbg_set_6be42768c690e380: function(arg0, arg1, arg2) {
                getObject(arg0)[takeObject(arg1)] = takeObject(arg2);
            },
            __wbg_set_8a16b38e4805b298: function(arg0, arg1, arg2) {
                getObject(arg0)[arg1 >>> 0] = takeObject(arg2);
            },
            __wbg_stack_3b0d974bbf31e44f: function(arg0, arg1) {
                const ret = getObject(arg1).stack;
                const ptr1 = passStringToWasm0(ret, wasm.__wbindgen_export, wasm.__wbindgen_export2);
                const len1 = WASM_VECTOR_LEN;
                getDataViewMemory0().setInt32(arg0 + 4 * 1, len1, true);
                getDataViewMemory0().setInt32(arg0 + 4 * 0, ptr1, true);
            },
            __wbindgen_cast_0000000000000001: function(arg0) {
                // Cast intrinsic for `F64 -> Externref`.
                const ret = arg0;
                return addHeapObject(ret);
            },
            __wbindgen_cast_0000000000000002: function(arg0, arg1) {
                // Cast intrinsic for `Ref(String) -> Externref`.
                const ret = getStringFromWasm0(arg0, arg1);
                return addHeapObject(ret);
            },
            __wbindgen_cast_0000000000000003: function(arg0) {
                // Cast intrinsic for `U64 -> Externref`.
                const ret = BigInt.asUintN(64, arg0);
                return addHeapObject(ret);
            },
            __wbindgen_object_clone_ref: function(arg0) {
                const ret = getObject(arg0);
                return addHeapObject(ret);
            },
            __wbindgen_object_drop_ref: function(arg0) {
                takeObject(arg0);
            },
        };
        return {
            __proto__: null,
            "./riscv_rs_bg.js": import0,
        };
    }

    const SimulatorFinalization = (typeof FinalizationRegistry === 'undefined')
        ? { register: () => {}, unregister: () => {} }
        : new FinalizationRegistry(ptr => wasm.__wbg_simulator_free(ptr, 1));

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

    function getArrayJsValueFromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        const mem = getDataViewMemory0();
        const result = [];
        for (let i = ptr; i < ptr + 4 * len; i += 4) {
            result.push(takeObject(mem.getUint32(i, true)));
        }
        return result;
    }

    function getArrayU8FromWasm0(ptr, len) {
        ptr = ptr >>> 0;
        return getUint8ArrayMemory0().subarray(ptr / 1, ptr / 1 + len);
    }

    let cachedDataViewMemory0 = null;
    function getDataViewMemory0() {
        if (cachedDataViewMemory0 === null || cachedDataViewMemory0.buffer.detached === true || (cachedDataViewMemory0.buffer.detached === undefined && cachedDataViewMemory0.buffer !== wasm.memory.buffer)) {
            cachedDataViewMemory0 = new DataView(wasm.memory.buffer);
        }
        return cachedDataViewMemory0;
    }

    function getStringFromWasm0(ptr, len) {
        return decodeText(ptr >>> 0, len);
    }

    let cachedUint8ArrayMemory0 = null;
    function getUint8ArrayMemory0() {
        if (cachedUint8ArrayMemory0 === null || cachedUint8ArrayMemory0.byteLength === 0) {
            cachedUint8ArrayMemory0 = new Uint8Array(wasm.memory.buffer);
        }
        return cachedUint8ArrayMemory0;
    }

    function getObject(idx) { return heap[idx]; }

    let heap = new Array(1024).fill(undefined);
    heap.push(undefined, null, true, false);

    let heap_next = heap.length;

    function isLikeNone(x) {
        return x === undefined || x === null;
    }

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
            if (offset !== 0) {
                arg = arg.slice(offset);
            }
            ptr = realloc(ptr, len, len = offset + arg.length * 3, 1) >>> 0;
            const view = getUint8ArrayMemory0().subarray(ptr + offset, ptr + len);
            const ret = cachedTextEncoder.encodeInto(arg, view);

            offset += ret.written;
            ptr = realloc(ptr, len, offset, 1) >>> 0;
        }

        WASM_VECTOR_LEN = offset;
        return ptr;
    }

    function takeObject(idx) {
        const ret = getObject(idx);
        dropObject(idx);
        return ret;
    }

    let cachedTextDecoder = new TextDecoder('utf-8', { ignoreBOM: true, fatal: true });
    cachedTextDecoder.decode();
    function decodeText(ptr, len) {
        return cachedTextDecoder.decode(getUint8ArrayMemory0().subarray(ptr, ptr + len));
    }

    const cachedTextEncoder = new TextEncoder();

    if (!('encodeInto' in cachedTextEncoder)) {
        cachedTextEncoder.encodeInto = function (arg, view) {
            const buf = cachedTextEncoder.encode(arg);
            view.set(buf);
            return {
                read: arg.length,
                written: buf.length
            };
        };
    }

    let WASM_VECTOR_LEN = 0;

    let wasmModule, wasmInstance, wasm;
    function __wbg_finalize_init(instance, module) {
        wasmInstance = instance;
        wasm = instance.exports;
        wasmModule = module;
        cachedDataViewMemory0 = null;
        cachedUint8ArrayMemory0 = null;
        return wasm;
    }

    async function __wbg_load(module, imports) {
        if (typeof Response === 'function' && module instanceof Response) {
            if (typeof WebAssembly.instantiateStreaming === 'function') {
                try {
                    return await WebAssembly.instantiateStreaming(module, imports);
                } catch (e) {
                    const validResponse = module.ok && expectedResponseType(module.type);

                    if (validResponse && module.headers.get('Content-Type') !== 'application/wasm') {
                        console.warn("`WebAssembly.instantiateStreaming` failed because your server does not serve Wasm with `application/wasm` MIME type. Falling back to `WebAssembly.instantiate` which is slower. Original error:\n", e);

                    } else { throw e; }
                }
            }

            const bytes = await module.arrayBuffer();
            return await WebAssembly.instantiate(bytes, imports);
        } else {
            const instance = await WebAssembly.instantiate(module, imports);

            if (instance instanceof WebAssembly.Instance) {
                return { instance, module };
            } else {
                return instance;
            }
        }

        function expectedResponseType(type) {
            switch (type) {
                case 'basic': case 'cors': case 'default': return true;
            }
            return false;
        }
    }

    function initSync(module) {
        if (wasm !== undefined) return wasm;


        if (module !== undefined) {
            if (Object.getPrototypeOf(module) === Object.prototype) {
                ({module} = module)
            } else {
                console.warn('using deprecated parameters for `initSync()`; pass a single object instead')
            }
        }

        const imports = __wbg_get_imports();
        if (!(module instanceof WebAssembly.Module)) {
            module = new WebAssembly.Module(module);
        }
        const instance = new WebAssembly.Instance(module, imports);
        return __wbg_finalize_init(instance, module);
    }

    async function __wbg_init(module_or_path) {
        if (wasm !== undefined) return wasm;


        if (module_or_path !== undefined) {
            if (Object.getPrototypeOf(module_or_path) === Object.prototype) {
                ({module_or_path} = module_or_path)
            } else {
                console.warn('using deprecated parameters for the initialization function; pass a single object instead')
            }
        }

        if (module_or_path === undefined && script_src !== undefined) {
            module_or_path = script_src.replace(/\.js$/, "_bg.wasm");
        }
        const imports = __wbg_get_imports();

        if (typeof module_or_path === 'string' || (typeof Request === 'function' && module_or_path instanceof Request) || (typeof URL === 'function' && module_or_path instanceof URL)) {
            module_or_path = fetch(module_or_path);
        }

        const { instance, module } = await __wbg_load(await module_or_path, imports);

        return __wbg_finalize_init(instance, module);
    }

    return Object.assign(__wbg_init, { initSync }, exports);
})({ __proto__: null });
