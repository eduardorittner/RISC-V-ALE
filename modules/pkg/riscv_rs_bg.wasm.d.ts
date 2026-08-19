/* tslint:disable */
/* eslint-disable */
export const memory: WebAssembly.Memory;
export const __wbg_simulator_free: (a: number, b: number) => void;
export const run_riscv_binary: (a: number, b: number, c: number) => number;
export const simulator_add_breakpoint: (a: number, b: number) => void;
export const simulator_clear_breakpoints: (a: number) => void;
export const simulator_debug_step: (a: number) => number;
export const simulator_debug_step_out: (a: number) => number;
export const simulator_debug_step_over: (a: number) => number;
export const simulator_disassemble_range: (a: number, b: number, c: number, d: number) => void;
export const simulator_get_snapshot_js: (a: number, b: number, c: number) => number;
export const simulator_get_symbol_at: (a: number, b: number, c: number) => void;
export const simulator_has_custom_syscalls: (a: number) => number;
export const simulator_load_binary: (a: number, b: number, c: number, d: number) => number;
export const simulator_new: () => number;
export const simulator_read_memory_range: (a: number, b: number, c: number, d: number) => void;
export const simulator_remove_breakpoint: (a: number, b: number) => void;
export const simulator_run_full: (a: number) => number;
export const simulator_run_slice: (a: number, b: number) => number;
export const simulator_run_until_breakpoint: (a: number) => number;
export const simulator_set_debug_mode: (a: number, b: number) => void;
export const simulator_set_has_custom_syscalls: (a: number, b: number) => void;
export const simulator_write_memory_byte: (a: number, b: number, c: number) => void;
export const simulator_write_register: (a: number, b: number, c: number) => void;
export const __wbindgen_export: (a: number, b: number) => number;
export const __wbindgen_export2: (a: number, b: number, c: number, d: number) => number;
export const __wbindgen_export3: (a: number, b: number, c: number) => void;
export const __wbindgen_add_to_stack_pointer: (a: number) => number;
