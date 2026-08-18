// Globals the non-module scripts rely on.
//
// `index.html` loads several plain scripts (the toast, modal, tab and table
// widgets, and two vendored libraries) before the modules, and the page code
// reaches DOM elements through the implicit `id` globals. None of that is
// visible to the compiler on its own. Only what the checked files actually
// touch is declared here: anything else stays an error rather than silently
// becoming `any`.

// ─── Scripts loaded before the modules ─────────────────────────────────────

interface ToastOptions {
  title?: string;
  text?: string;
  /** `Infinity` keeps the toast open until the user dismisses it. */
  delay?: number;
  icon?: string;
  onClick?: (event: Event, api: { update: (opts: ToastOptions) => void }) => void;
}

interface ToastHandle {
  update(options: ToastOptions): void;
  close(): void;
  /** The rendered element, which the escaping tests inspect. */
  elem: HTMLElement;
}

interface ToastConfirmOptions extends ToastOptions {
  okText?: string;
  cancelText?: string;
}

interface ToastApi {
  success(options: ToastOptions): ToastHandle;
  info(options: ToastOptions): ToastHandle;
  error(options: ToastOptions): ToastHandle;
  notice(options: ToastOptions): ToastHandle;
  /** Resolves to true when the user accepts. */
  confirm(options?: ToastConfirmOptions): Promise<boolean>;
}

declare const Toast: ToastApi;

interface ModalApi {
  open(selector: string, options?: { backdrop?: boolean }): void;
  close(selector: string): void;
  isOpen(selector: string): boolean;
  makeDraggable(selector: string, handleSelector: string): void;
}

declare const Modal: ModalApi;

declare class DataTable {
  constructor(selector: string);
  insertRow(spec: { index: number; row: Record<string, unknown> }): void;
}

/** `assets/js/lz-string.min.js`. */
declare const LZString: {
  compressToEncodedURIComponent(input: string): string;
  decompressFromEncodedURIComponent(input: string): string;
};

// ─── Values the modules publish on `window` ────────────────────────────────

interface Window {
  /** Distinguishes the BroadcastChannel names of two pages in one browser. */
  uniq_id?: string;
  /** Handles the embedding page and the test harness reach for. */
  __ale__?: { uniq_id: string; sim_status_ch: BroadcastChannel };
  __ale_perf_ready__?: boolean;
  simulator_controller?: unknown;
  compiler?: unknown;
  web_terminal?: unknown;
  visualDebuggerUI?: unknown;
  loaded_devices?: Map<string, unknown>;
  run_simulator?: (debug: boolean) => Promise<boolean | void>;
  load_device?: (name: string, slot?: number) => Promise<void>;
  remove_device?: (name: string) => void;
  device_action_formatter?: (value: string) => string;
  syscall_action_formatter?: (value: unknown) => string;
  load_syscall?: (value: string) => void;
  /** Backward-compatible aliases of the toast stacks. */
  stackBottomRight?: ToastApi;
  stackBarTop?: ToastApi;
  Toast?: ToastApi;
  Modal?: ModalApi;
  Tabs?: unknown;
  Dropdown?: unknown;
  DataTable?: unknown;
  // xterm.js ships as a minified bundle without declarations; there is nothing
  // more precise to say about these than "whatever the bundle installed".
  Terminal?: any;
  FitAddon?: any;
  xterm?: any;
  VisualDebuggerUI?: unknown;
  files?: File[];
  /** Set only by the injection tests. */
  __pwned?: boolean;
}

// ─── DOM elements the page code reaches by their `id` ──────────────────────

declare const run_button: HTMLButtonElement;
declare const run_with_debug_button: HTMLAnchorElement;
declare const run_options_selector: HTMLButtonElement;
declare const file_select_button: HTMLButtonElement;
declare const assistant_button: HTMLAnchorElement;
declare const codeSelector: HTMLInputElement;
declare const settings_tab: HTMLElement;
declare const settings_nav_item: HTMLElement;
declare const home_tab: HTMLElement;
declare const home_tab_tutorials_list: HTMLUListElement;
declare const home_tab_resources_list: HTMLUListElement;
declare const content_selection: HTMLDivElement;
declare const selected_content: HTMLDivElement;
declare const int_freq_range: HTMLInputElement;
declare const int_freq_range_indicator: HTMLOutputElement;
declare const enable_so_checkbox: HTMLInputElement;
declare const so_stack_pointer_value: HTMLInputElement;
declare const os_tab_stdio_textarea: HTMLTextAreaElement;
declare const os_tab_stdout_radio: HTMLInputElement;
declare const os_tab_stdin_radio: HTMLInputElement;
declare const stdio_file_input: HTMLInputElement;
declare const settings_tab_conf_export_desc: HTMLTextAreaElement;
declare const conf_export_desc_url: HTMLInputElement;
declare const conf_export_assistant_script: HTMLInputElement;

/** One row of the syscall table, as the formatters serialize and read it back. */
interface SyscallTableEntry {
  number: number;
  code: string;
  desc?: string;
  /** Built-in syscalls cannot be switched off. */
  builtin?: boolean;
  checked?: string;
}

declare const os_tab_stdio_refresh: HTMLButtonElement;
declare const os_tab_stdio_upload: HTMLButtonElement;
