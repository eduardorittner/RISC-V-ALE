class Compiler{
  constructor(){
    this.timeout = 150000;
    this.loaded_files = [];
    // A quiet build does not open the terminal of the page by itself. The
    // debugger builds a second copy of the program and the user is looking at
    // the source, not at the output of the assembler.
    this.quiet = false;
    this.stdio_ch = new BroadcastChannel("stdio_channel" + window.uniq_id);
    this.sim_status_ch = new BroadcastChannel('simulator_status' + window.uniq_id);
  }

  setup_worker(w, file_callback){
    w.onmessage = function (ev) {
      console.log(ev);
      switch (ev.data.type) {
        case 'stdio':
          this.stdio_ch.postMessage({fh:ev.data.stdioNumber,data:ev.data.msg,origin:"clang"});
          break;
        
        case 'file':
          file_callback(ev.data.file);
        default:
          break;
      }
    }.bind(this);
    w.postMessage({type: "add_files", files: this.loaded_files});
  }

  get_output_name(args, def){
    let idx = args.indexOf("-o");
    if(idx == -1 || args.length < idx + 2) return def;
    return args[idx + 1];
  }

  set_file_array(array){
    this.loaded_files = array;
  }

  load_files(files){
    this.loaded_files = [];
    for (let i = 0; i < files.length; i++) {
      this.loaded_files[i] = files[i];
    }
  }

  load_new_file(file){
    for (let index = 0; index < this.loaded_files.length; index++) {
      if(this.loaded_files[index].name == file.name){
        this.loaded_files[index] = file;
        return;
      }
    }
    this.loaded_files.push(file);
  }

  async invoke_clang(op, args, out_filename, in_file){
    var worker = new Worker("./modules/clang_worker.js");
    return new Promise(resolve =>{
      var cto = setTimeout(function () {
        worker.terminate();
        this.stdio_ch.postMessage({fh:2, data: "Compiler timed out", origin:"clang"});
        resolve(-1);
      }.bind(this), this.timeout);
      var file_callback = function (file) {
        clearTimeout(cto);
        worker.terminate();
        resolve(file);
      };
      // A worker that dies sends no message. Without this handler the caller
      // waits for the timeout above, which is 150 seconds of silence, and the
      // reason for the death is in no place that a user can see.
      worker.onerror = function (event) {
        clearTimeout(cto);
        worker.terminate();
        // A worker that cannot load its script answers with an event that
        // carries no message, so the text says what that means.
        var text = event.message
          ? "The compiler stopped: " + event.message
          : "The compiler worker did not start. modules/clang_worker.js, " +
            "modules/clang.js or modules/clang.wasm did not load. A copy of " +
            "one of them in the cache of the browser can be damaged: clear " +
            "the site data of this page and load it again.";
        if(event.filename) text += " (" + event.filename + ":" + event.lineno + ")";
        console.error("[compiler]", text, event);
        this.stdio_ch.postMessage({fh:2, data: text, origin:"clang"});
        resolve(-1);
      }.bind(this);
      this.setup_worker(worker, file_callback);
      worker.postMessage({type: op, args, file: in_file, out_filename});
    });
  }

  /**
   * Run one tool on `files` and give back what it wrote to its error output.
   *
   * The call is for a check and not for a build: the output file goes
   * nowhere, the lines go to the caller and not to the terminal, and the
   * loaded set of the page is not read and not changed. The editor checks a
   * file this way after each pause in typing, so a build of the RUN button or
   * of the debugger can run at the same time.
   *
   * @param {string} op "clang_s" for the assembler, "clang_c" for the C compiler
   * @param {string[]} args the arguments of the tool, with the input and `-o`
   * @param {File[]} files the files that the tool can read
   * @returns {Promise<{ok: boolean, stderr: string[]}>} `ok` is true when the
   *   tool wrote its output file
   */
  diagnose(op, args, files){
    const worker = new Worker("./modules/clang_worker.js");
    const out_name = this.get_output_name(args, "out.o");
    return new Promise(resolve => {
      const stderr = [];
      let done = false;
      let timer = 0;
      const finish = (ok) => {
        if(done) return;
        done = true;
        clearTimeout(timer);
        worker.terminate();
        resolve({ok, stderr});
      };
      timer = setTimeout(() => {
        stderr.push("The compiler timed out");
        finish(false);
      }, this.timeout);
      worker.onmessage = (event) => {
        if(event.data.type === "stdio"){
          if(event.data.stdioNumber === 2) stderr.push(String(event.data.msg));
          return;
        }
        if(event.data.type === "file") finish(event.data.file !== -1);
      };
      worker.onerror = (event) => {
        stderr.push("The compiler stopped: " + (event.message || "the worker did not start"));
        finish(false);
      };
      worker.postMessage({type: "add_files", files});
      worker.postMessage({type: op, args, out_filename: out_name});
    });
  }

  async auto_compile(c_ext, asm_ext, obj_ext, elf_ext){
    let obj_files = [];
    for (let index = 0; index < this.loaded_files.length; index++) {
      const element = this.loaded_files[index];
      if(element.name.endsWith(c_ext)) {
        await this.cc([element.name, "-o", element.name.slice(0, -2) + obj_ext]);
      } else if(element.name.endsWith(asm_ext)) {
        await this.as([element.name, "-o", element.name.slice(0, -2) + obj_ext]);
      }
    }
    for (let index = 0; index < this.loaded_files.length; index++) {
      const element = this.loaded_files[index];
      if(element.name.endsWith(obj_ext)) {
        obj_files.push(element.name);
      }
    }
    if(obj_files.length > 0){
      if(await this.ld([obj_files, "-o", "main" + elf_ext].flat())){
        return "main" + elf_ext;
      }
    }
  }

  async cc(args, load_result=true) {
    this.sim_status_ch.postMessage({type: "clang_status", status:{starting: true, tool: "cc", args, quiet: this.quiet}});
    let out_name = this.get_output_name(args, "out.o");
    var bytes = await this.invoke_clang("clang_c", args, out_name);
    this.sim_status_ch.postMessage({type: "clang_status", status:{finish: true}});
    if(bytes === -1) return;
    var blob = new Blob([bytes], {type: 'application/binary'});
    var file = new File([blob], out_name);
    if(load_result) this.load_new_file(file);
    return file;
  }

  async as(args, load_result=true){
    this.sim_status_ch.postMessage({type: "clang_status", status:{starting: true, tool: "as", args, quiet: this.quiet}});
    let out_name = this.get_output_name(args, "out.o");
    var bytes = await this.invoke_clang("clang_s", args, out_name);
    this.sim_status_ch.postMessage({type: "clang_status", status:{finish: true}});
    if(bytes === -1) return;
    var blob = new Blob([bytes], {type: 'application/binary'});
    var file = new File([blob], out_name);
    if(load_result) this.load_new_file(file);
    return file;
  }

  async ld(args, load_result=true){
    this.sim_status_ch.postMessage({type: "clang_status", status:{starting: true, tool: "ld", args, quiet: this.quiet}});
    let out_name = this.get_output_name(args, "out.x");
    var bytes = await this.invoke_clang("ld", args, out_name);
    this.sim_status_ch.postMessage({type: "clang_status", status:{finish: true}});
    if(bytes === -1) return;
    var blob = new Blob([bytes], {type: 'application/binary'});
    var file = new File([blob], out_name);
    if(load_result) this.load_new_file(file);
    return file;
  }
}

export const compiler = new Compiler();
