import { simulator_controller } from "./simulator.js";
import { compiler } from "./compiler.js";

export class WebTerminal {
  constructor(container, badge) {
    this.stdio_ch = new BroadcastChannel("stdio_channel" + window.uniq_id);
    this.sim_status_ch = new BroadcastChannel(
      "simulator_status" + window.uniq_id,
    );
    this.container = container || document.getElementById("xterm-container");
    this.firstOpen = true;

    // Initialize xterm.js instance
    const TerminalClass =
      window.Terminal || (window.xterm && window.xterm.Terminal);
    const FitAddonClass =
      (window.FitAddon && window.FitAddon.FitAddon) || window.FitAddon;

    if (!TerminalClass) {
      console.error("xterm.js library not loaded");
    }

    this.term = new TerminalClass({
      cursorBlink: true,
      fontFamily: "Courier Prime, Consolas, monospace",
      fontSize: 14,
      theme: {
        background: "#000000",
        foreground: "#ffffff",
        cursor: "#ffffff",
      },
    });

    if (FitAddonClass) {
      this.fitAddon = new FitAddonClass();
      this.term.loadAddon(this.fitAddon);
    }

    this.term.open(this.container);

    // Initial fit attempt
    this.fitTerminal();

    // Shell state
    this.modeStack = [];
    this.currentMode = "shell";
    this.inputLine = "";
    this.promptStr = "$ ";
    this.running_mode = false;

    // Print greeting
    this.term.writeln("Welcome to RISC-V ALE");
    this.writePrompt();

    // Data input listener
    this.term.onData((data) => this.handleTermData(data));

    this.pending_stdout = "";
    this.pending_stderr = "";
    this.render_scheduled = false;

    this.schedule_render = function () {
      if (this.render_scheduled) return;
      this.render_scheduled = true;
      if (typeof requestAnimationFrame === "function") {
        requestAnimationFrame(() => this.flush_render());
      } else {
        setTimeout(() => this.flush_render(), 16);
      }
    }.bind(this);

    this.flush_render = function () {
      this.render_scheduled = false;
      if (this.pending_stdout.length > 0) {
        // Stream stdout directly so VT100/ANSI escape codes are rendered natively by xterm
        const formatted = this.pending_stdout.replace(/\r?\n/g, "\r\n");
        this.term.write(formatted);
        this.pending_stdout = "";
      }
      if (this.pending_stderr.length > 0) {
        const formatted = this.pending_stderr.replace(/\r?\n/g, "\r\n");
        // Dark red text for stderr (\x1b[31m)
        this.term.write(`\x1b[31m${formatted}\x1b[0m`);
        this.pending_stderr = "";
      }
    }.bind(this);

    this.sim_status_ch.onmessage = function (e) {
      if (e.data.type == "status") {
        if (e.data.status.running && !this.running_mode) {
          this.running_mode = true;
          if (e.data.status.debugging) {
            this.enter_debug_mode();
          } else {
            this.enter_input_mode();
          }
        }
        if (e.data.status.stopping || e.data.status.finish) {
          this.flush_render();
          if (e.data.status.finish && e.data.status.stats) {
            const s = e.data.status.stats;
            console.log("[RISC-V ALE Stats]", s);
            const timeFormatted =
              s.elapsedTimeMs >= 1000
                ? (s.elapsedTimeMs / 1000).toFixed(3) + " s"
                : s.elapsedTimeMs.toFixed(2) + " ms";
            const instFormatted = (s.totalInstructions || 0).toLocaleString();
            const ipsFormatted = (s.ips || 0).toLocaleString();
            const mipsFormatted = s.mips || 0;

            this.term.writeln(
              `--------------------------------------------------`,
            );
            this.term.writeln(`Program Execution Complete`);
            this.term.writeln(`  • Time Elapsed:       ${timeFormatted}`);
            this.term.writeln(`  • Total Instructions: ${instFormatted}`);
            this.term.writeln(
              `  • Execution Speed:    ${mipsFormatted} MIPS (${ipsFormatted} inst/sec)`,
            );
            if (s.finalPC) {
              this.term.writeln(`  • Final PC:           0x${s.finalPC}`);
            }
            this.term.writeln(`  • Exit Code (a0):     ${s.exitCode}`);
            this.term.writeln(
              `--------------------------------------------------`,
            );
          }
          if (this.running_mode) {
            this.popMode();
            this.running_mode = false;
          }
        }
        if (e.data.status.starting_exec) {
          this.flush_render();
          this.term.writeln(`$ riscv ${e.data.status.args.join(" ")}`);
        }
      } else if (e.data.type == "sim_log") {
        this.flush_render();
        this.term.writeln(`\x1b[33m (LOG) ${e.data.msg}\x1b[0m`);
      } else if (e.data.type == "clang_status") {
        if (e.data.status.starting) {
          this.flush_render();
          this.term.writeln(
            `$ ${e.data.status.tool} ${e.data.status.args.join(" ")}`,
          );
          this.enter_wait_mode();
        } else {
          this.flush_render();
          this.popMode();
        }
      }
    }.bind(this);

    this.stdio_ch.onmessage = function (e) {
      if (e.data.origin == "clang") {
        this.flush_render();
        const msg = String(e.data.data).replace(/\r?\n/g, "\r\n");
        this.term.write(msg);
      } else if (e.data.fh == 1) {
        this.pending_stdout += e.data.data;
        this.schedule_render();
      } else if (e.data.fh == 2) {
        this.pending_stderr += e.data.data;
        this.schedule_render();
      } else if (e.data.fh == -1 && e.data.debug) {
        this.flush_render();
        this.term.writeln(`\x1b[33m>>> \x1b[0m${e.data.cmd}`);
      }
    }.bind(this);

    window.addEventListener("resize", () => {
      this.fitTerminal();
    });
  }

  fitTerminal() {
    try {
      let cols = 80;
      let rows = 24;

      if (this.fitAddon) {
        const dims = this.fitAddon.proposeDimensions();
        if (
          dims &&
          dims.cols > 0 &&
          dims.rows > 0 &&
          Number.isInteger(dims.cols) &&
          Number.isInteger(dims.rows)
        ) {
          cols = dims.cols;
          rows = dims.rows;
        } else if (
          this.container &&
          this.container.clientWidth > 0 &&
          this.container.clientHeight > 0
        ) {
          const charMeasure = this.container.querySelector(
            ".xterm-char-measure-element",
          );
          const rect = charMeasure ? charMeasure.getBoundingClientRect() : null;
          const charWidth = rect && rect.width > 0 ? rect.width : 9;
          const charHeight = rect && rect.height > 0 ? rect.height : 17;

          cols = Math.max(
            20,
            Math.floor((this.container.clientWidth - 12) / charWidth),
          );
          rows = Math.max(
            5,
            Math.floor((this.container.clientHeight - 12) / charHeight),
          );
        }
      }

      if (cols > 0 && rows > 0) {
        const canvas = this.container.querySelector("canvas");
        if (canvas && (canvas.width === 300 || canvas.height === 150)) {
          // Force dimension shift to trigger canvas buffer allocation
          this.term.resize(cols + 1, rows + 1);
        }
        this.term.resize(cols, rows);
      }
    } catch (e) {
      console.warn("fitTerminal error:", e);
    }
  }

  writePrompt() {
    if (this.promptStr) {
      this.term.write(this.promptStr);
    }
  }

  pushMode(mode, promptStr = "") {
    this.modeStack.push({ mode: this.currentMode, promptStr: this.promptStr });
    this.currentMode = mode;
    this.promptStr = promptStr;
    this.inputLine = "";
    this.writePrompt();
  }

  popMode() {
    if (this.modeStack.length > 0) {
      const prev = this.modeStack.pop();
      this.currentMode = prev.mode;
      this.promptStr = prev.promptStr;
    } else {
      this.currentMode = "shell";
      this.promptStr = "$ ";
    }
    this.inputLine = "";
    this.writePrompt();
  }

  enter_wait_mode() {
    this.pushMode("wait", "");
  }

  enter_input_mode() {
    this.pushMode("input", "");
  }

  enter_debug_mode() {
    this.pushMode("debug", "\x1b[33m>>> \x1b[0m");
  }

  handleTermData(data) {
    if (this.currentMode === "wait") {
      if (data === "\x03") {
        // Ctrl+C
        this.popMode();
      }
      return;
    }

    if (this.currentMode === "input") {
      if (data === "\x03") {
        // Ctrl+C
        simulator_controller.stop_execution();
        return;
      }
      // Send raw keystroke data directly to program stdin
      this.stdio_ch.postMessage({ fh: 0, data: data });
      return;
    }

    // Line editing mode (Shell or Debug mode)
    for (let i = 0; i < data.length; i++) {
      const char = data[i];

      if (char === "\r" || char === "\n") {
        // Enter key
        this.term.write("\r\n");
        const cmd = this.inputLine;
        this.inputLine = "";
        this.executeCommand(cmd);
      } else if (char === "\x7f" || char === "\b") {
        // Backspace
        if (this.inputLine.length > 0) {
          this.inputLine = this.inputLine.slice(0, -1);
          this.term.write("\b \b");
        }
      } else if (char === "\x03") {
        // Ctrl+C
        this.inputLine = "";
        this.term.write("^C\r\n");
        this.writePrompt();
      } else if (char >= " " || char === "\t") {
        // Printable chars
        this.inputLine += char;
        this.term.write(char);
      }
    }
  }

  executeCommand(cmdStr) {
    const trimmed = cmdStr.trim();
    if (!trimmed) {
      this.writePrompt();
      return;
    }

    if (this.currentMode === "debug") {
      let cmd = trimmed.split(" ")[0];
      switch (cmd) {
        case "write-stdin":
          this.stdio_ch.postMessage({
            fh: 0,
            data: trimmed.slice(11).trimStart() + "\n",
          });
          break;
        case "help":
          this.term.writeln(
            `RISC-V ALE commands:\n\nwrite-stdin string\n\tWrites a string to stdin (fd = 0)\n\nSweRV Commands:`,
          );
          this.stdio_ch.postMessage({ fh: -1, debug: true, cmd: trimmed });
          break;
        default:
          this.stdio_ch.postMessage({ fh: -1, debug: true, cmd: trimmed });
          break;
      }
      return;
    }

    // Shell commands
    const parts = trimmed.split(/\s+/);
    const cmd = parts[0];
    const args = parts.slice(1).map((e) => e.trim().replace(" ", "_"));

    switch (cmd) {
      case "riscv":
      case "whisper":
        simulator_controller.start_execution(args);
        break;

      case "cc":
        compiler.cc(args);
        break;

      case "as":
        compiler.as(args);
        break;

      case "ld":
        compiler.ld(args);
        break;

      case "ls":
        for (
          let i = 0;
          i < simulator_controller.last_loaded_files.length;
          i++
        ) {
          this.term.writeln(simulator_controller.last_loaded_files[i].name);
        }
        this.writePrompt();
        break;

      case "clear":
        this.term.clear();
        this.writePrompt();
        break;

      default:
        this.term.writeln(`command not found: ${cmd}`);
        this.writePrompt();
        break;
    }
  }

  openTerminal() {
    requestAnimationFrame(() => {
      this.fitTerminal();
      if (this.term) {
        this.term.refresh(0, this.term.rows - 1);
        this.term.focus();
      }
    });
  }

  setSTDIN(value) {
    this.stdio_ch.postMessage({ fh: -1, init_stdin: true, data: value + "\n" });
  }

  getSTDOUT() {}

  getSTDERR() {}
}
