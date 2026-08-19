/// <reference path="./riscv_rs.generated.d.ts" />

// The IPC contract of RISC-V ALE.
//
// Every message that crosses a worker boundary or a BroadcastChannel is a
// member of one of the unions below. The senders go through a typed helper
// (`post`, `post_to_worker`, ...) and the receivers narrow on the `type` (or
// `fh`) property and end their switch with `assert_unreachable`, so a message
// that one side sends and the other does not handle is a compile error.
//
// The payload types that come from Rust live in `riscv_rs.generated.d.ts`,
// which `make build` rewrites. A field renamed in Rust therefore becomes a
// TypeScript error in the JavaScript that reads it.

// ─── Simulator status ───────────────────────────────────────────────────────

/** Statistics of a finished run. */
interface RunStats {
  elapsedTimeMs: number;
  totalInstructions: number;
  ips: number;
  mips: number;
  finalPC: string;
  exitCode: number;
  trapped: boolean;
}

/**
 * The lifecycle of one simulator worker. Every field is optional: a status
 * message reports only the transitions that happened.
 */
interface SimStatus {
  /** The worker booted and is ready to accept a program. */
  starting?: boolean;
  /** A run was requested; `args` is the command line. */
  starting_exec?: boolean;
  args?: string[];
  /** A program is running. */
  running?: boolean;
  /** The run is an interactive debug session. */
  debugging?: boolean;
  /** The worker is being replaced. */
  stopping?: boolean;
  /** The run ended. */
  finish?: boolean;
  error?: boolean;
  errorMessage?: string;
  stats?: RunStats;
}

/** A user-visible notification. `delay` may be `Infinity` to keep it open. */
interface UserNotification {
  type: "success" | "info" | "error" | "notice";
  title: string;
  text: string;
  delay?: number;
}

// ─── Main thread → simulator worker ────────────────────────────────────────

type MainToSimulatorMessage =
  | { type: "init_modules"; riscvModule?: WebAssembly.Module; whisperModule?: WebAssembly.Module }
  | { type: "start"; args: string[] }
  | { type: "add_files"; files: File[] }
  | { type: "stdin"; stdin: string }
  | { type: "interactive"; cmd: string }
  | { type: "non_blocking_io"; value: boolean }
  | { type: "interrupt"; state: number }
  | { type: "interrupt_enabled"; value: number }
  | { type: "set_freq_limit"; value: number }
  | { type: "set_int_delay"; value: number }
  | { type: "sync"; buffer: Record<string, number> }
  | { type: "load_syscall"; number: number; code: string }
  | { type: "disable_syscall"; number: number }
  | { type: "debug_enable"; enabled: boolean }
  | { type: "debug_step" }
  | { type: "debug_step_over" }
  | { type: "debug_step_out" }
  | { type: "debug_continue" }
  | { type: "debug_pause" }
  | { type: "run_pause" }
  | { type: "run_resume" }
  | { type: "debug_set_bp"; addr: number; active: boolean }
  | { type: "debug_clear_bps" }
  | { type: "debug_read_mem"; addr: number; len: number }
  | { type: "debug_poke_reg"; reg: number; val: number }
  | { type: "debug_poke_mem"; addr: number; val: number }
  | { type: "debug_disasm"; addr: number; len: number }
  | { type: "debug_get_snapshot" };

// ─── Simulator worker → main thread ────────────────────────────────────────

type SimulatorToMainMessage =
  | { type: "status"; status: SimStatus }
  | { type: "sim_log"; subtype: "info" | "error"; msg: string }
  | { type: "message"; msg: UserNotification }
  | { type: "device_message"; syscall: number; message: unknown }
  | {
      type: "sync";
      mmio_buffer: Record<string, number> | null;
      stdout: string;
      stderr: string;
    }
  | { type: "debug_state"; state: wasm_bindgen.DebuggerSnapshot }
  | { type: "debug_error"; reason: "no_program" }
  | { type: "debug_status"; enabled: boolean }
  | { type: "debug_bp_updated"; addr: number; active: boolean }
  | { type: "debug_mem_data"; addr: number; bytes: number[] }
  | { type: "debug_disasm_data"; items: wasm_bindgen.DisassembledInst[] };

// ─── Main thread → clang worker ────────────────────────────────────────────

/** The three tools the clang worker can be asked to run. */
type ClangOperation = "clang_c" | "clang_s" | "ld";

type MainToClangMessage =
  | {
      type: "init_modules";
      clangModule: WebAssembly.Module;
      lldModule: WebAssembly.Module;
    }
  | { type: "add_files"; files: File[] }
  /** The files come from `add_files`; the tool only names its output. */
  | { type: ClangOperation; args: string[]; out_filename: string }
  | { type: "fs" };

// ─── Clang worker → main thread ────────────────────────────────────────────

type ClangToMainMessage =
  | { type: "stdio"; stdioNumber: 1 | 2; msg: string }
  /** `file` is the output bytes, or -1 when the tool produced nothing. */
  | { type: "file"; file: Uint8Array | -1 };

// ─── BroadcastChannel: "simulator_status" ──────────────────────────────────

type SimStatusChannelMessage =
  | { type: "status"; status: SimStatus }
  | { type: "sim_log"; subtype?: "info" | "error"; msg?: string; log?: string }
  | { type: "message"; msg: UserNotification }
  | { type: "debug_state"; state: wasm_bindgen.DebuggerSnapshot }
  | { type: "load_syscall"; number: number; desc: string; code: string }
  | { type: "load_file"; name: string; size: number }
  | { type: "clang_status"; status: ClangStatus };

/** The lifecycle of one compiler invocation. */
interface ClangStatus {
  starting?: boolean;
  tool?: "cc" | "as" | "ld";
  args?: string[];
  finish?: boolean;
  error?: boolean;
}

// ─── BroadcastChannel: "stdio_channel" ─────────────────────────────────────

/**
 * Discriminated on `fh`, the file handle: 0 is stdin, 1 stdout, 2 stderr, and
 * -1 carries the out-of-band interactive traffic.
 */
type StdioChannelMessage =
  | { fh: 0; data: string }
  | { fh: 1 | 2; data: string; origin?: "clang" }
  | { fh: -1; debug: true; cmd: string }
  | { fh: -1; init_stdin: true; data: string };

// ─── BroadcastChannel: "bus_channel" ───────────────────────────────────────

type BusChannelMessage = {
  so_emulation: true;
  syscall: number;
  data: unknown;
};
