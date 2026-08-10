import { simulator_controller } from "./simulator.js";
import { compiler } from "./compiler.js";

export class WebTerminal {
  constructor(container, badge) {
    this.stdio_ch = new BroadcastChannel("stdio_channel" + window.uniq_id);
    this.sim_status_ch = new BroadcastChannel(
      "simulator_status" + window.uniq_id,
    );
    this.container = container;
    this.firstOpen = true;
    this.term = $("#xterm-container").terminal(
      {
        whisper: function (...args) {
          args = args.map((e) => e.trim().replace(" ", "_"));
          simulator_controller.start_execution(args);
        },
        cc: function (...args) {
          compiler.cc(args);
        },
        as: function (...args) {
          compiler.as(args);
        },
        ld: function (...args) {
          compiler.ld(args);
        },
        ls: function () {
          for (
            let index = 0;
            index < simulator_controller.last_loaded_files.length;
            index++
          ) {
            const element = simulator_controller.last_loaded_files[index];
            this.echo(element.name);
          }
        },
        close: function (arg1, arg2) {},
      },
      {
        checkArity: false,
        prompt: "$ ",
        greetings: "Welcome to RISC-V ALE",
      },
    );
    this.term.parent = this;

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
        this.term.echo(this.pending_stdout.replace(/\n$/, ""));
        this.pending_stdout = "";
      }
      if (this.pending_stderr.length > 0) {
        this.term.echo(
          `[[;darkred;]${this.pending_stderr.replace(/\n$/, "")}]`,
        );
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

            this.term.echo(
              `--------------------------------------------------`,
            );
            this.term.echo(`Program Execution Complete`);
            this.term.echo(`  • Time Elapsed:       ${timeFormatted}`);
            this.term.echo(`  • Total Instructions: ${instFormatted}`);
            this.term.echo(
              `  • Execution Speed:    ${mipsFormatted} MIPS (${ipsFormatted} inst/sec)`,
            );
            if (s.finalPC) {
              this.term.echo(`  • Final PC:           0x${s.finalPC}`);
            }
            this.term.echo(`  • Exit Code (a0):     ${s.exitCode}`);
            this.term.echo(
              `--------------------------------------------------`,
            );
          }
          if (this.running_mode) {
            this.term.pop();
            this.running_mode = false;
          }
        }
        if (e.data.status.starting_exec) {
          this.flush_render();
          this.term.echo(`$ whisper ${e.data.status.args.join(" ")}`);
          this.term.history().append(`whisper ${e.data.status.args.join(" ")}`);
        }
      } else if (e.data.type == "sim_log") {
        this.flush_render();
        this.term.echo("[[;yellow;] (LOG) " + e.data.msg + "]");
      } else if (e.data.type == "clang_status") {
        if (e.data.status.starting) {
          this.flush_render();
          this.term.echo(
            "$ " + e.data.status.tool + " " + e.data.status.args.join(" "),
          );
          this.enter_wait_mode();
        } else {
          this.flush_render();
          this.term.pop();
        }
      }
    }.bind(this);

    this.stdio_ch.onmessage = function (e) {
      if (e.data.origin == "clang") {
        this.flush_render();
        this.term.echo(e.data.data);
      } else if (e.data.fh == 1) {
        this.pending_stdout += e.data.data;
        this.schedule_render();
      } else if (e.data.fh == 2) {
        this.pending_stderr += e.data.data;
        this.schedule_render();
      } else if (e.data.fh == -1 && e.data.debug) {
        this.flush_render();
        this.term.echo("[[;yellow;]>>> ]" + e.data.cmd);
      }
    }.bind(this);
  }

  enter_wait_mode() {
    this.term.push(function (stdin) {}, {
      prompt: "",
      history: false,
      keymap: {
        "CTRL+C": function (e, original) {
          original();
        },
        "CTRL+D": function (e, original) {},
      },
    });
  }

  // async call_clang(op, args){
  //   this.enter_wait_mode();
  //   let file = await compiler[op](args);
  //   if(file){
  //     console.log(file);
  //     compiler.load_new_file(file);
  //     simulator_controller.load_new_file(file);
  //     this.term.pop();
  //     return true
  //   }
  //   this.term.pop();
  //   return false
  // }

  enter_input_mode() {
    this.term.push(
      function (stdin) {
        this.parent.stdio_ch.postMessage({ fh: 0, data: stdin + "\n" });
      },
      {
        prompt: "",
        history: false,
        keymap: {
          "CTRL+C": function (e, original) {
            simulator_controller.stop_execution();
            original();
          },
          "CTRL+D": function (e, original) {
            // this.parent.sim_ctrl_ch.postMessage({dst:'bus', cmd: "stop_simulator"});
          },
        },
      },
    );
  }

  enter_debug_mode() {
    this.term.push(
      function (stdin) {
        let cmd = stdin.trim().split(" ")[0];
        switch (cmd) {
          case "write-stdin":
            this.parent.stdio_ch.postMessage({
              fh: 0,
              data: stdin.slice(11).trimStart() + "\n",
            });
            break;

          case "help":
            this.echo(
              `RISC-V ALE commands:\n\nwrite-stdin string\n\tWrites a string to the stdin (file descritor = 0)\n\nSweRV Commands:\n`,
            );
            this.parent.stdio_ch.postMessage({
              fh: -1,
              debug: true,
              cmd: stdin,
            });
            break;

          default:
            this.parent.stdio_ch.postMessage({
              fh: -1,
              debug: true,
              cmd: stdin,
            });
            break;
        }
      },
      {
        prompt: "[[;yellow;]>>> ]",
        keymap: {
          "CTRL+C": function (e, original) {
            simulator_controller.stop_execution();
            original();
          },
          "CTRL+D": function (e, original) {
            // this.parent.sim_ctrl_ch.postMessage({dst:'bus', cmd: "stop_simulator"});
          },
        },
      },
    );
  }

  processCmd() {}

  openTerminal() {
    if (this.firstOpen) {
    }
  }

  setSTDIN(value) {
    this.stdio_ch.postMessage({ fh: -1, init_stdin: true, data: value + "\n" });
  }

  getSTDOUT() {}

  getSTDERR() {}
}
