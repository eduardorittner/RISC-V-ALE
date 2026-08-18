/**
 * The `default` branch of an exhaustive switch over an IPC union. A member no
 * case handles gives `value` a real type in place of `never`, and `tsc` fails.
 *
 * @param {never} value
 */
function assert_unreachable(value) {
  console.error("Unhandled IPC message:", value);
}

class Compiler {
  constructor() {
    this.timeout = 150000;
    this.loaded_files = [];
    this.stdio_ch = new BroadcastChannel("stdio_channel" + window.uniq_id);
    this.sim_status_ch = new BroadcastChannel(
      "simulator_status" + window.uniq_id,
    );
    this.clangModule = null;
    this.lldModule = null;
    this.initPromise = null;

    // Trigger pre-compilation asynchronously on startup
    setTimeout(() => this.init_wasm_cache(), 0);
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

  /**
   * The only way this file talks to a clang worker.
   *
   * @param {Worker} worker
   * @param {MainToClangMessage} msg
   */
  post_to_worker(worker, msg) {
    worker.postMessage(msg);
  }

  async init_wasm_cache() {
    if (this.clangModule && this.lldModule) return;
    if (this.initPromise) return this.initPromise;

    this.initPromise = (async () => {
      try {
        const [clangRes, lldRes] = await Promise.all([
          fetch("./modules/clang.wasm"),
          fetch("./modules/lld.wasm"),
        ]);

        const compileWasm = async (res) => {
          try {
            if (typeof WebAssembly.compileStreaming === "function") {
              return await WebAssembly.compileStreaming(res.clone());
            }
          } catch (e) {}
          const buf = await res.arrayBuffer();
          return await WebAssembly.compile(buf);
        };

        const [clangModule, lldModule] = await Promise.all([
          compileWasm(clangRes),
          compileWasm(lldRes),
        ]);
        this.clangModule = clangModule;
        this.lldModule = lldModule;
      } catch (err) {
        console.warn(
          "WASM pre-compilation failed, falling back to standard fetching:",
          err,
        );
      }
    })();

    return this.initPromise;
  }

  async get_worker() {
    await this.init_wasm_cache();
    var worker = new Worker("./modules/clang_worker.js");
    if (this.clangModule && this.lldModule) {
      this.post_to_worker(worker, {
        type: "init_modules",
        clangModule: this.clangModule,
        lldModule: this.lldModule,
      });
    }
    return worker;
  }

  setup_worker(w, file_callback) {
    const report_failure = (detail) => {
      console.error("Compiler Worker Error:", detail);
      this.post_status({
        type: "message",
        msg: {
          type: "error",
          title: "Compiler Worker Error",
          text: String(detail),
          delay: Infinity,
        },
      });
      this.post_status({
        type: "clang_status",
        status: { finish: true, error: true },
      });
      // Settle the pending invoke_clang promise so the UI never hangs.
      file_callback(-1);
    };

    w.onerror = function (ev) {
      if (typeof ev.preventDefault === "function") ev.preventDefault();
      report_failure(ev.message || "The compiler worker crashed.");
    };

    w.onmessageerror = function () {
      report_failure(
        "A message from the compiler worker could not be deserialized.",
      );
    };

    w.onmessage = (ev) => {
      /** @type {ClangToMainMessage} */
      const msg = ev.data;
      switch (msg.type) {
        case "stdio":
          this.post_stdio({
            fh: msg.stdioNumber,
            data: msg.msg,
            origin: "clang",
          });
          break;

        case "file":
          file_callback(msg.file);
          break;

        default:
          assert_unreachable(msg);
      }
    };
    this.post_to_worker(w, { type: "add_files", files: this.loaded_files });
  }

  get_output_name(args, def) {
    let idx = args.indexOf("-o");
    if (idx == -1 || args.length < idx + 2) return def;
    return args[idx + 1];
  }

  set_file_array(array) {
    this.loaded_files = array;
  }

  load_files(files) {
    this.loaded_files = [];
    for (let i = 0; i < files.length; i++) {
      this.loaded_files[i] = files[i];
    }
  }

  load_new_file(file) {
    for (let index = 0; index < this.loaded_files.length; index++) {
      if (this.loaded_files[index].name == file.name) {
        this.loaded_files[index] = file;
        return;
      }
    }
    this.loaded_files.push(file);
  }

  async invoke_clang(op, args, out_filename) {
    var worker = await this.get_worker();
    return new Promise((resolve) => {
      var cto = setTimeout(() => {
        worker.terminate();
        this.post_stdio({ fh: 2, data: "Compiler timed out" });
        resolve(-1);
      }, this.timeout);
      var file_callback = (file) => {
        clearTimeout(cto);
        worker.terminate();
        resolve(file);
      };
      this.setup_worker(worker, file_callback);
      this.post_to_worker(worker, { type: op, args, out_filename });
    });
  }

  async auto_compile(c_ext, asm_ext, obj_ext, elf_ext) {
    let compilePromises = [];
    for (let index = 0; index < this.loaded_files.length; index++) {
      const element = this.loaded_files[index];
      const dotIdx = element.name.lastIndexOf(".");
      const baseName =
        dotIdx !== -1 ? element.name.slice(0, dotIdx) : element.name;
      if (element.name.endsWith(c_ext)) {
        compilePromises.push(this.cc([element.name, "-o", baseName + obj_ext]));
      } else if (element.name.endsWith(asm_ext)) {
        compilePromises.push(this.as([element.name, "-o", baseName + obj_ext]));
      }
    }
    await Promise.all(compilePromises);

    let obj_files = [];
    for (let index = 0; index < this.loaded_files.length; index++) {
      const element = this.loaded_files[index];
      if (element.name.endsWith(obj_ext)) {
        obj_files.push(element.name);
      }
    }
    if (obj_files.length > 0) {
      if (await this.ld([obj_files, "-o", "main" + elf_ext].flat())) {
        return "main" + elf_ext;
      }
    }
  }

  async cc(args, load_result = true) {
    this.post_status({
      type: "clang_status",
      status: { starting: true, tool: "cc", args },
    });
    let out_name = this.get_output_name(args, "out.o");
    var bytes = await this.invoke_clang("clang_c", args, out_name);
    this.post_status({
      type: "clang_status",
      status: { finish: true },
    });
    if (bytes === -1) return;
    var blob = new Blob([bytes], { type: "application/binary" });
    var file = new File([blob], out_name);
    if (load_result) this.load_new_file(file);
    return file;
  }

  async as(args, load_result = true) {
    this.post_status({
      type: "clang_status",
      status: { starting: true, tool: "as", args },
    });
    let out_name = this.get_output_name(args, "out.o");
    var bytes = await this.invoke_clang("clang_s", args, out_name);
    this.post_status({
      type: "clang_status",
      status: { finish: true },
    });
    if (bytes === -1) return;
    var blob = new Blob([bytes], { type: "application/binary" });
    var file = new File([blob], out_name);
    if (load_result) this.load_new_file(file);
    return file;
  }

  async ld(args, load_result = true) {
    this.post_status({
      type: "clang_status",
      status: { starting: true, tool: "ld", args },
    });
    let out_name = this.get_output_name(args, "out.x");
    var bytes = await this.invoke_clang("ld", args, out_name);
    this.post_status({
      type: "clang_status",
      status: { finish: true },
    });
    if (bytes === -1) return;
    var blob = new Blob([bytes], { type: "application/binary" });
    var file = new File([blob], out_name);
    if (load_result) this.load_new_file(file);
    return file;
  }
}

export const compiler = new Compiler();
