import { simulator_controller } from "./simulator.js";
import { compiler } from "./compiler.js";
import { base64ToArrayBuffer } from "./utils.js";

export class Connection {
  constructor() {
    this.operations = {
      load_file: {
        desc: "Load file",
        f: this.load_file_from_base64.bind(this),
      },
      load_files_from_array: {
        desc: "Load files from array",
        f: this.load_files_from_array.bind(this),
      },
      load_add_file: {
        desc: "Load Add. file",
        f: this.load_add_file_from_base64.bind(this),
      },
      echo: { desc: "Echo", f: this.echo.bind(this) },
      start_assistant: {
        desc: "Start Assistant Script",
        f: this.start_assistant.bind(this),
      },
    };
  }

  send(data) {}

  /**
   * True when `cmd` names an operation this connection actually exposes.
   * Anything else is ignored: the page receives messages from arbitrary
   * senders, so an unrecognised command must never reach a handler.
   */
  is_valid_cmd(cmd) {
    return (
      !!cmd &&
      typeof cmd.op === "string" &&
      Object.prototype.hasOwnProperty.call(this.operations, cmd.op)
    );
  }

  run_remote_cmd(cmd) {
    if (!this.is_valid_cmd(cmd)) {
      console.warn("Ignoring unknown remote command:", cmd && cmd.op);
      return false;
    }
    this.operations[cmd.op].f(cmd.params);
    return true;
  }

  load_add_file_from_base64(params) {
    var bytes = base64ToArrayBuffer(params.str64);
    var blob = new Blob([bytes], { type: "application/binary" });
    let file = new File([blob], params.name);
    simulator_controller.load_new_file(file);
  }

  load_files_from_array(files) {
    simulator_controller.load_files(files);
    compiler.set_file_array(simulator_controller.last_loaded_files);
  }

  load_file_from_base64(params) {
    var bytes = base64ToArrayBuffer(params.str64);
    var blob = new Blob([bytes], { type: "application/binary" });
    let file = new File([blob], params.name);
    simulator_controller.load_files([file]);
    compiler.set_file_array(simulator_controller.last_loaded_files);
  }

  start_assistant() {
    document.getElementById("assistant_run_button").click();
  }

  echo(data) {
    this.send(data);
  }
}

class Window_postMessage extends Connection {
  constructor(isTrusted = false) {
    super();
    this.isTrusted = isTrusted;
    window.onmessage = this.msg_handle.bind(this);
  }

  msg_handle(msg) {
    const cmd = msg && msg.data && msg.data.cmd;
    if (!this.is_valid_cmd(cmd)) {
      // Other scripts and extensions post unrelated messages to this window.
      // Drop anything that is not a command we recognise, without throwing.
      return;
    }
    if (this.isTrusted || window.origin == msg.origin) {
      this.run_remote_cmd(cmd);
    } else {
      this.confirmation_dialog(
        String(msg.data.name || "An unidentified page"),
        msg.origin,
        this.operations[cmd.op].desc,
        cmd,
      );
    }
  }

  async confirmation_dialog(name, origin, operation, cmd) {
    const confirmed = await Toast.confirm({
      title: `Remote Command Received`,
      text: `${name} is trying to execute a remote command in the simulator. Do you wish to proceed?\n\nOperation: ${operation}\nOrigin: ${origin}`,
      icon: "fas fa-exclamation-triangle",
      okText: "Proceed",
      cancelText: "Cancel",
    });
    if (confirmed) {
      this.run_remote_cmd(cmd);
    }
  }

  send(data) {
    if (data.constructor.name !== "ArrayBuffer") {
      window.parent.postMessage(data);
    }
  }
}

export class LocalReport extends Connection {
  constructor() {
    super();
    this.restart();
  }

  restart() {
    this.log = [];
    this.report = { log: this.log };
    this.dataLog = [];
    this.dataLogSizes = [];
  }

  send(data) {
    if (data.constructor.name === "ArrayBuffer") {
      this.dataLog.push(data);
      this.dataLogSizes.push(data.byteLength);
      this.log[this.log.length - 1]["data_log_idx"] = this.dataLog.length - 1;
    } else {
      this.log.push(data);
    }
  }

  generate_report() {
    let header = new Uint32Array(this.dataLogSizes.length + 2);
    header[0] = this.dataLogSizes.length + 2;
    let reportJson = new TextEncoder("utf-8").encode(
      JSON.stringify(this.report),
    );
    header[1] = reportJson.byteLength;
    header.set(this.dataLogSizes, 2);
    let blob = new Blob([header, reportJson, this.dataLog].flat(), {
      type: "application/octet-stream",
    });
    return blob;
  }
}

export const conn = new Connection();
export const win_postmessage = new Window_postMessage();
