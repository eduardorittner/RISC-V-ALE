var expected_result = "none";
/** @type {File[]} */
var files = [];
var current_op = "none";
/** @type {WebAssembly.Module | null} */
var precompiledClangModule = null;
/** @type {WebAssembly.Module | null} */
var precompiledLldModule = null;

/**
 * The only way this worker talks to the main thread. The parameter type is what
 * makes a message the main thread does not handle a compile error.
 *
 * @param {ClangToMainMessage} msg
 */
function post(msg) {
  postMessage(msg);
}

/**
 * The `default` branch of an exhaustive switch over an IPC union. A member no
 * case handles gives `value` a real type in place of `never`, and `tsc` fails.
 *
 * @param {never} value
 */
function assert_unreachable(value) {
  console.error("Unhandled IPC message:", value);
}

onmessage = function (e) {
  /** @type {MainToClangMessage} */
  const msg = e.data;
  switch (msg.type) {
    case "init_modules":
      precompiledClangModule = msg.clangModule;
      precompiledLldModule = msg.lldModule;
      break;
    case "add_files":
      files = msg.files;
      break;
    case "clang_c":
      current_op = "clang_c";
      expected_result = msg.out_filename;
      Module.arguments = [
        "-cc1",
        "-triple",
        "riscv32--",
        "-emit-obj",
        "-mrelax-all",
        "-disable-free",
        "-disable-llvm-verifier",
        "-discard-value-names",
        "-main-file-name",
        "main_file",
        "-mrelocation-model",
        "static",
        "-mthread-model",
        "posix",
        "-mframe-pointer=all",
        "-fmath-errno",
        "-fno-rounding-math",
        "-mconstructor-aliases",
        "-nostdsysteminc",
        "-target-feature",
        "+m",
        "-target-feature",
        "+a",
        "-target-feature",
        "+f",
        "-target-feature",
        "+d",
        "-target-feature",
        "-relax",
        "-target-abi",
        "ilp32d",
        "-fno-split-dwarf-inlining",
        "-debugger-tuning=gdb",
        "-resource-dir",
        "/",
        "-internal-isystem",
        "include",
        "-fdebug-compilation-dir",
        "/",
        "-ferror-limit",
        "19",
        "-fno-signed-char",
        "-fgnuc-version=4.2.1",
        "-fobjc-runtime=gcc",
        "-fcolor-diagnostics",
        "-faddrsig",
        "-x",
        "c",
        msg.args,
      ].flat();
      importScripts("clang.js");
      break;

    case "clang_s":
      current_op = "clang_s";
      expected_result = msg.out_filename;
      Module.arguments = [
        "-cc1as",
        "-triple",
        "riscv32--",
        "-filetype",
        "obj",
        "-main-file-name",
        "main_file",
        "-target-feature",
        "+m",
        "-target-feature",
        "+a",
        "-target-feature",
        "+f",
        "-target-feature",
        "+d",
        "-target-feature",
        "-relax",
        "-fdebug-compilation-dir",
        "/",
        "-dwarf-debug-producer",
        "clang, version, 10.0.0-4ubuntu1, ",
        "-dwarf-version=4",
        "-mrelocation-model",
        "static",
        "-target-abi",
        "ilp32d",
        msg.args,
      ].flat();
      importScripts("clang.js");
      break;

    case "ld":
      current_op = "ld";
      expected_result = msg.out_filename;
      Module.thisProgram = "ld.lld";
      Module.arguments = ["--threads=1", msg.args].flat();
      importScripts("ld.lld.js");
      break;

    case "fs":
      break;

    default:
      assert_unreachable(msg);
  }
};

function initFS() {
  try {
    FS.unmount("/working");
  } catch (e) {}
  try {
    FS.mkdir("/working");
  } catch (e) {}
  if (expected_result && expected_result !== "none") {
    try {
      FS.unlink("/" + expected_result);
    } catch (e) {}
  }
  if (files) {
    FS.mount(
      WORKERFS,
      {
        files: files, // Array of File objects or FileList
      },
      "/working",
    );
    for (let index = 0; index < files.length; index++) {
      if (files[index].name != expected_result) {
        const linkName = "/" + files[index].name.replace(" ", "_");
        try {
          FS.unlink(linkName);
        } catch (e) {}
        try {
          FS.symlink("/working/" + files[index].name, linkName);
        } catch (e) {}
      }
    }
  }
}

function returnResult() {
  if (FS.readdir("/").includes(expected_result))
    post({ type: "file", file: FS.readFile(expected_result) });
  else post({ type: "file", file: -1 });
}

/** @type {EmscriptenModule} */
var Module = {
  arguments: ["--version"],
  instantiateWasm: function (imports, successCallback) {
    var mod =
      current_op === "ld" ? precompiledLldModule : precompiledClangModule;
    if (mod) {
      WebAssembly.instantiate(mod, imports)
        .then(function (instance) {
          successCallback(instance, mod);
        })
        .catch(function (err) {
          console.error("Precompiled WASM instantiation error:", err);
        });
      return {}; // Non-false return signals async WASM instantiation to Emscripten
    }
    return false; // Fallback to standard Emscripten fetch
  },
  preRun: [initFS],
  print: function (text) {
    post({ type: "stdio", stdioNumber: 1, msg: text });
  },
  printErr: function (text) {
    post({ type: "stdio", stdioNumber: 2, msg: text });
  },
  postRun: [returnResult],
};
