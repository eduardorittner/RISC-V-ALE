declare namespace wasm_bindgen {
    /* tslint:disable */
    /* eslint-disable */
    /**
     * Result of one `run_slice` call.
     */
    export interface SliceOutcome {
        status: SliceStatus;
        /**
         * Instructions executed in this slice.
         */
        steps: number;
        pc: number;
        exit_code: number;
    }

    /**
     * Why a run slice gave control back to the host.
     */
    export type SliceStatus = "running" | "halted" | "trapped" | "breakpoint";

    export interface DebuggerSnapshot {
        pc: number;
        gpr: number[];
        fpr: number[];
        csrs: number[];
        step_count: number;
        is_halted: boolean;
        is_breakpoint: boolean;
        hit_address: number;
        /**
         * Exit status the guest stopped with. Nonzero after a trap.
         */
        exit_code: number;
        /**
         * True when execution stopped on a trap instead of a clean exit.
         */
        trapped: boolean;
    }

    export interface DisassembledInst {
        address: number;
        opcode_hex: string;
        asm_text: string;
        is_compressed: boolean;
        label: string | undefined;
    }


    export class Simulator {
        free(): void;
        [Symbol.dispose](): void;
        add_breakpoint(addr: number): void;
        clear_breakpoints(): void;
        debug_step(): DebuggerSnapshot;
        debug_step_out(): DebuggerSnapshot;
        debug_step_over(): DebuggerSnapshot;
        disassemble_range(start_addr: number, len: number): DisassembledInst[];
        get_snapshot_js(is_breakpoint: boolean, hit_address: number): DebuggerSnapshot;
        get_symbol_at(addr: number): string | undefined;
        has_custom_syscalls(): boolean;
        load_binary(binary_bytes: Uint8Array, args_js: Array<any>): number;
        constructor();
        read_memory_range(addr: number, len: number): Uint8Array;
        remove_breakpoint(addr: number): void;
        run_full(): number;
        /**
         * Run at most `budget` instructions and report why the slice ended. The
         * browser worker calls this in a `setTimeout` chain, so the message queue
         * keeps its turn while a program runs.
         */
        run_slice(budget: number): SliceOutcome;
        /**
         * Run until a breakpoint, a halt or a trap stops the guest.
         *
         * This drives `run_slice`, which keeps the whole gap inside the CPU's
         * inner loop. It used to call `step_instruction` once per instruction,
         * paying the full per-step entry and exit — the breakpoint test, the
         * halt test and the error formatting — for every instruction between the
         * current PC and the breakpoint. A continue across a ten-million
         * instruction gap is the common case in a debug session.
         */
        run_until_breakpoint(): DebuggerSnapshot;
        set_debug_mode(enabled: boolean): void;
        set_has_custom_syscalls(enabled: boolean): void;
        write_memory_byte(addr: number, val: number): void;
        write_register(reg_idx: number, val: number): void;
    }

    export function run_riscv_binary(binary_bytes: Uint8Array, args_js: Array<any>): number;

}
declare type InitInput = RequestInfo | URL | Response | BufferSource | WebAssembly.Module;

declare interface InitOutput {
    readonly memory: WebAssembly.Memory;
    readonly __wbg_simulator_free: (a: number, b: number) => void;
    readonly run_riscv_binary: (a: number, b: number, c: number) => number;
    readonly simulator_add_breakpoint: (a: number, b: number) => void;
    readonly simulator_clear_breakpoints: (a: number) => void;
    readonly simulator_debug_step: (a: number) => number;
    readonly simulator_debug_step_out: (a: number) => number;
    readonly simulator_debug_step_over: (a: number) => number;
    readonly simulator_disassemble_range: (a: number, b: number, c: number, d: number) => void;
    readonly simulator_get_snapshot_js: (a: number, b: number, c: number) => number;
    readonly simulator_get_symbol_at: (a: number, b: number, c: number) => void;
    readonly simulator_has_custom_syscalls: (a: number) => number;
    readonly simulator_load_binary: (a: number, b: number, c: number, d: number) => number;
    readonly simulator_new: () => number;
    readonly simulator_read_memory_range: (a: number, b: number, c: number, d: number) => void;
    readonly simulator_remove_breakpoint: (a: number, b: number) => void;
    readonly simulator_run_full: (a: number) => number;
    readonly simulator_run_slice: (a: number, b: number) => number;
    readonly simulator_run_until_breakpoint: (a: number) => number;
    readonly simulator_set_debug_mode: (a: number, b: number) => void;
    readonly simulator_set_has_custom_syscalls: (a: number, b: number) => void;
    readonly simulator_write_memory_byte: (a: number, b: number, c: number) => void;
    readonly simulator_write_register: (a: number, b: number, c: number) => void;
    readonly __wbindgen_export: (a: number, b: number) => number;
    readonly __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
    readonly __wbindgen_export3: (a: number, b: number, c: number) => void;
    readonly __wbindgen_add_to_stack_pointer: (a: number) => number;
}

/**
 * If `module_or_path` is {RequestInfo} or {URL}, makes a request and
 * for everything else, calls `WebAssembly.instantiate` directly.
 *
 * @param {{ module_or_path: InitInput | Promise<InitInput> }} module_or_path - Passing `InitInput` directly is deprecated.
 *
 * @returns {Promise<InitOutput>}
 */
declare function wasm_bindgen (module_or_path?: { module_or_path: InitInput | Promise<InitInput> } | InitInput | Promise<InitInput>): Promise<InitOutput>;
