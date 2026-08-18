/// <reference path="./riscv_rs.generated.d.ts" />

// Globals of the two workers.
//
// Both workers are classic (non-module) scripts: they reach the WASM glue and
// the Emscripten runtime through globals that `importScripts` installs. Only
// what the workers actually touch is declared here, so a name nobody declared
// stays an error rather than silently becoming `any`.

/**
 * The guest program's argument vector and output sink.
 *
 * The simulator worker runs a wasm-bindgen module, not an Emscripten one, so
 * this is all it needs: the arguments it was started with, and somewhere to
 * send the guest's stdout and stderr.
 */
interface GuestIoModule {
  arguments: string[];
  print?(text: string): void;
  printErr?(text: string): void;
}

/**
 * The Emscripten module object the clang worker configures before it loads
 * clang or lld. Those two really are Emscripten builds.
 */
interface EmscriptenModule extends GuestIoModule {
  thisProgram?: string;
  instantiateWasm?(
    imports: WebAssembly.Imports,
    successCallback: (
      instance: WebAssembly.Instance,
      module: WebAssembly.Module,
    ) => void,
  ): Record<string, never> | false;
  // Optional: the simulator worker's module is a plain output sink, because
  // the simulator is a wasm-bindgen build with no Emscripten runtime to hook.
  preRun?: Array<() => void>;
  postRun?: Array<() => void>;
}

/** The guest files the worker was given, as `File` objects. */
declare var files: File[];

/** The loaded simulator, or undefined until a program is loaded. */
declare var wasmSimulator: wasm_bindgen.Simulator | undefined;

interface WorkerGlobalScope {
  execFinished?: boolean;
  executionStartTime?: number;
  wasmMemory?: WebAssembly.Memory;
  wasmSimulator?: wasm_bindgen.Simulator | undefined;
  precompiledRiscvModule?: WebAssembly.Module | null;
  Module?: EmscriptenModule;
  files?: File[];
  wasm_bindgen?: typeof wasm_bindgen;
  notifyUnknownSyscall?: (
    sys_num: number,
    a0: number,
    a1: number,
    a2: number,
    a3: number,
  ) => void;
}

declare namespace wasm_bindgen {
  /**
   * Instantiate the module without waiting. The `no-modules` target leaves it
   * out of the generated declarations, so it is named here.
   */
  function initSync(
    module: WebAssembly.Module | { module: WebAssembly.Module },
  ): InitOutput;
}

/** Emscripten's virtual filesystem, installed by `clang.js` and `ld.lld.js`. */
declare const FS: {
  mount(type: unknown, options: unknown, mountpoint: string): void;
  unmount(mountpoint: string): void;
  mkdir(path: string): void;
  unlink(path: string): void;
  symlink(target: string, linkpath: string): void;
  readdir(path: string): string[];
  readFile(path: string): Uint8Array;
};

/** The WORKERFS backend, which mounts `File` objects read-only. */
declare const WORKERFS: unknown;
