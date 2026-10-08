/*jshint esversion: 9 */

import {simulator_controller} from "./simulator.js";
import {compiler} from "./compiler.js";
import {instrument_source, read_line_table} from "./dwarf_line.js";
import {new_asm_state, highlight_asm_line} from "./asm_highlight.js";

/**
 * The file name extension of the programs the source view can show, when the
 * settings page gives no other one.
 *
 * The view shows the file that the user loaded, and not what the simulator
 * executes. A compiled language keeps its source in no file that reaches the
 * simulator, so a `.c` file has no line here.
 *
 * @type {string}
 */
const DEFAULT_SOURCE_EXTENSION = ".s";

/**
 * The names of the files that a debug build makes.
 *
 * None of them ends with the extension of a source, an object or an ELF file
 * of the settings page. The auto-compile of the RUN button looks for those
 * extensions, so a debug build cannot get into the program that the RUN
 * button makes.
 */
const DEBUG_SOURCE_SUFFIX = ".dbg.asm";
const DEBUG_OBJECT_SUFFIX = ".dbg.obj";
const DEBUG_PROGRAM = "debug.elf";

/** The states of a debug session. */
const NO_SESSION = "no session";

/**
 * The assembly file of the program, with one line for each line of the file.
 *
 * The view holds a `div` for each line, and not one block of text, because
 * each line carries a breakpoint control and, at a stop, the marker of the
 * program counter.
 */
class SourceView {
  /**
   * @param {HTMLElement} container the element that holds the lines
   * @param {HTMLSelectElement} picker the control that names the file to show
   */
  constructor(container, picker) {
    this.container = container;
    this.picker = picker;
    /**
     * The file that the lines on screen come from. A new set of loaded files
     * gives a new `File` object, so this test also finds a file that changed
     * and kept its name.
     * @type {?File}
     */
    this.rendered_file = null;
    /**
     * The name of the file that the user picked, which the view keeps while
     * that file stays in the loaded set.
     * @type {?string}
     */
    this.selected_name = null;
    /** The names in the picker, to not build it again for the same set. */
    this.picker_names = null;
    /** The number of the newest refresh, which ends the older ones. */
    this.refresh_count = 0;
    /**
     * The breakpoints of each file, as line numbers. A breakpoint belongs to
     * the file and not to the session, so it lives through a restart.
     * @type {Map<string, Set<number>>}
     */
    this.breakpoints = new Map();
    /**
     * The lines of each file that have an address. Only such a line can hold
     * a breakpoint. The map is empty until a debug build gives the line
     * table, and then every line accepts a breakpoint.
     * @type {Map<string, Set<number>>}
     */
    this.runnable = new Map();
    /** The line of the program counter, or null. */
    this.current = null;
    this.picker.onchange = function () {
      this.selected_name = this.picker.value;
      this.refresh();
    }.bind(this);
    // The gutter of a line is the breakpoint control. One listener on the
    // container serves every line, and a line that the view draws later needs
    // no listener of its own.
    this.container.addEventListener("click", function (event) {
      const gutter = event.target.closest(".dbg-src-gutter");
      if(!gutter || !this.container.contains(gutter)) return;
      const row = gutter.parentElement;
      this.toggle_breakpoint(Number(row.dataset.line));
    }.bind(this));
  }

  /**
   * The extension of an assembly file. The auto-compile options hold it,
   * because the compiler uses the same setting to find the files to assemble.
   *
   * @returns {string}
   */
  source_extension() {
    const field = /** @type {HTMLInputElement} */ (document.getElementById("asm_ext"));
    const extension = field ? field.value.trim() : "";
    return extension === "" ? DEFAULT_SOURCE_EXTENSION : extension.toLowerCase();
  }

  /**
   * The loaded files that this view can show.
   *
   * @returns {File[]}
   */
  source_files() {
    const extension = this.source_extension();
    return simulator_controller.last_loaded_files.filter(
      file => file.name.toLowerCase().endsWith(extension)
    );
  }

  /**
   * Put the names of `files` in the picker and keep the selection on the file
   * that the user picked. The picker stays hidden while the set is empty, and
   * a set of one name shows which file the lines come from.
   *
   * @param {File[]} files
   */
  update_picker(files) {
    const names = files.map(file => file.name);
    const key = names.join("\n");
    if (key !== this.picker_names) {
      this.picker_names = key;
      this.picker.textContent = "";
      for (const name of names) {
        const option = document.createElement("option");
        option.value = name;
        option.textContent = name;
        this.picker.appendChild(option);
      }
    }
    if (!names.includes(this.selected_name)) {
      this.selected_name = names.length ? names[0] : null;
    }
    this.picker.hidden = names.length === 0;
    if (this.selected_name !== null) this.picker.value = this.selected_name;
  }

  /**
   * Show `text` in place of the lines. The view uses this for a set of files
   * that holds no assembly, and for a file that it cannot read.
   *
   * @param {string} text
   */
  show_message(text) {
    this.container.textContent = "";
    this.container.classList.add("text-muted");
    const message = document.createElement("p");
    message.className = "dbg-src-message mb-0";
    message.textContent = text;
    this.container.appendChild(message);
  }

  /**
   * The message for a set of loaded files that holds no assembly file.
   *
   * @returns {string}
   */
  empty_message() {
    if (simulator_controller.last_loaded_files.length === 0) {
      return "No program is loaded. Use the Load File button, or open a sample program from the Home page.";
    }
    return `The source view shows assembly files only. Load the ${this.source_extension()} file of the program, because a C file and an object file keep no source for this view.`;
  }

  /**
   * Draw one line of the view for each line of `text`.
   *
   * @param {string} text the contents of the file
   */
  render(text) {
    const lines = text.split("\n");
    // The highlighter reads one line at a time, and this object carries the
    // one state that a line gives to the line after it: a block comment that
    // is open at the end of the line.
    const highlight = new_asm_state();
    // A file that ends with a line break gives one empty element more, which
    // is the position after the last line and not a line of the file.
    if (lines.length > 1 && lines[lines.length - 1] === "") lines.pop();
    const rows = document.createDocumentFragment();
    for (let index = 0; index < lines.length; index++) {
      const number = index + 1;
      const row = document.createElement("div");
      row.className = "dbg-src-line";
      row.dataset.line = String(number);
      const gutter = document.createElement("span");
      gutter.className = "dbg-src-gutter";
      gutter.textContent = String(number);
      const code = document.createElement("span");
      code.className = "dbg-src-text";
      // The file is user input. The highlighter makes DOM nodes and sets
      // `textContent` on each one, so the line stays text.
      highlight_asm_line(code, lines[index], highlight);
      row.appendChild(gutter);
      row.appendChild(code);
      rows.appendChild(row);
    }
    this.container.textContent = "";
    this.container.classList.remove("text-muted");
    this.container.appendChild(rows);
    this.container.scrollTop = 0;
    this.draw_marks();
  }

  /** The row of a line of the file on screen. */
  row_of(line) {
    return this.container.querySelector(`.dbg-src-line[data-line="${line}"]`);
  }

  /** The breakpoints of the file on screen. */
  breakpoint_set(name) {
    const file = name || this.selected_name;
    if (!file) return new Set();
    if (!this.breakpoints.has(file)) this.breakpoints.set(file, new Set());
    return this.breakpoints.get(file);
  }

  /**
   * The breakpoints of every file, as `{file, line}` pairs. The page turns
   * them into addresses with the line table of the build.
   */
  all_breakpoints() {
    const all = [];
    for (const [file, lines] of this.breakpoints) {
      for (const line of lines) all.push({file, line});
    }
    return all;
  }

  /**
   * Put a breakpoint on a line, or take it away. A line with no address holds
   * no breakpoint: the program counter never reaches it.
   *
   * @param {number} line
   */
  toggle_breakpoint(line) {
    if (!this.selected_name || !line) return;
    const runnable = this.runnable.get(this.selected_name);
    if (runnable && !runnable.has(line)) return;
    const points = this.breakpoint_set();
    if (points.has(line)) points.delete(line);
    else points.add(line);
    // One line changes. A full draw would lose the scroll position and the
    // click that comes after it.
    this.draw_marks(this.row_of(line));
    if (this.on_breakpoints) this.on_breakpoints();
  }

  /**
   * The lines of each file that hold an instruction, from the line table of
   * the build. A breakpoint on a line that is gone stays in the set, so that
   * it comes back when the line comes back.
   *
   * @param {Map<string, Set<number>>} runnable
   */
  set_runnable(runnable) {
    this.runnable = runnable;
    this.draw_marks();
  }

  /**
   * Mark the line of the program counter, and bring it on screen.
   *
   * @param {?{file: string, line: number}} position
   */
  set_current(position) {
    this.current = position;
    this.draw_marks();
    if (!position || position.file !== this.selected_name) return;
    const row = this.row_of(position.line);
    if (row) row.scrollIntoView({block: "nearest"});
  }

  /**
   * Give each row the classes of its state: a breakpoint, the program
   * counter, and whether the line has an address at all.
   *
   * @param {?Element} only one row, or every row when it is null
   */
  draw_marks(only) {
    const rows = only ? [only] : this.container.querySelectorAll(".dbg-src-line");
    const points = this.breakpoint_set();
    const runnable = this.runnable.get(this.selected_name);
    const current = this.current && this.current.file === this.selected_name
      ? this.current.line : 0;
    for (const row of rows) {
      if (!row) continue;
      const line = Number(row.dataset.line);
      row.classList.toggle("dbg-src-break", points.has(line));
      row.classList.toggle("dbg-src-current", line === current);
      // Without a line table every line takes a breakpoint, because the
      // debugger does not know yet which lines have an address.
      row.classList.toggle("dbg-src-runnable", !runnable || runnable.has(line));
    }
  }

  /**
   * Show the assembly file of the program. The view draws the lines again only
   * for a file that it did not draw, because a redraw loses the scroll
   * position.
   *
   * @returns {Promise<void>}
   */
  async refresh() {
    const files = this.source_files();
    this.update_picker(files);
    const file = files.find(candidate => candidate.name === this.selected_name);
    if (!file) {
      this.rendered_file = null;
      this.show_message(this.empty_message());
      return;
    }
    if (file === this.rendered_file) {
      this.draw_marks();
      return;
    }
    // A read is asynchronous, so a second refresh can start before the first
    // one ends. Only the newest one writes to the view.
    const refresh_id = ++this.refresh_count;
    let text;
    try {
      text = await file.text();
    } catch (error) {
      if (refresh_id !== this.refresh_count) return;
      this.rendered_file = null;
      this.show_message(`${file.name} could not be read: ${error.message}`);
      return;
    }
    if (refresh_id !== this.refresh_count) return;
    this.rendered_file = file;
    this.render(text);
  }
}


/**
 * The Debugger page: the source view, the step and run controls, and the
 * session that they drive.
 *
 * The session is a worker that holds the program between two commands. The
 * module exports the state of the hart, so a command here is a call into
 * WebAssembly and not a line of the interactive shell.
 */
class DebuggerPage {
  constructor() {
    this.source = new SourceView(
      document.getElementById("debug_source_view"),
      /** @type {HTMLSelectElement} */ (document.getElementById("debug_source_file"))
    );
    this.step_button = /** @type {HTMLButtonElement} */ (document.getElementById("debug_step_button"));
    this.run_button = /** @type {HTMLButtonElement} */ (document.getElementById("debug_run_button"));
    this.stop_button = /** @type {HTMLButtonElement} */ (document.getElementById("debug_stop_button"));
    this.status_line = document.getElementById("debug_status");

    /** The state of the session, as the worker reports it. */
    this.state = NO_SESSION;
    /** True while a build or a start is in progress. */
    this.busy = false;
    /** The line table of the program that the session runs. */
    this.line_table = null;
    /** The program counter of the last stop. */
    this.pc = 0;
    /** The disassembly of the instruction at the program counter. */
    this.instruction = "";
    /** The number of instructions that the program retired. */
    this.count = 0;
    /** True while a run of the session is in progress. */
    this.running = false;
    /** True between the start of a session and its first state message. */
    this.starting = false;
    /** Answers the waiter of a start, when the first state arrives. */
    this.resolve_ready = null;

    /**
     * The command line of the program, which `interface_elements.js` sets.
     * The options of the settings page belong to that file, and the debugger
     * must start the program with the same ones as the RUN button.
     * @type {?function(string): string[]}
     */
    this.build_args = null;

    this.source.on_breakpoints = this.on_breakpoint_change.bind(this);
    this.step_button.onclick = this.on_step.bind(this);
    this.run_button.onclick = this.on_run.bind(this);
    this.stop_button.onclick = this.on_stop.bind(this);

    this.status_ch = new BroadcastChannel("simulator_status" + window.uniq_id);
    this.status_ch.onmessage = this.on_message.bind(this);
    this.source.refresh();
    this.draw_controls();
  }

  /** The page became visible. */
  open() {
    this.source.refresh();
    this.draw_controls();
  }

  /**
   * The messages of the simulator. The debugger reads the state of a step or
   * a run, and the end of a session.
   */
  on_message(event) {
    const data = event.data;
    if (data.type === "load_file") {
      // The program changed. The session runs the program of before, so it
      // is not the program on screen any more.
      this.end_session();
      this.source.refresh();
      return;
    }
    if (data.type === "status" && data.status.stopping) {
      this.end_session();
      return;
    }
    if (data.type !== "dbg_state") return;
    this.on_debug_state(data);
  }

  /** Forget the session. The worker is gone or runs another program. */
  end_session() {
    // The start of a session restarts the worker, and that stop belongs to
    // the session before it.
    if (this.starting) return;
    if (this.state === NO_SESSION) return;
    this.state = NO_SESSION;
    this.running = false;
    this.line_table = null;
    this.source.set_runnable(new Map());
    this.source.set_current(null);
    this.draw_controls();
  }

  /**
   * One state message of the worker: where the program counter is, and what
   * the session is doing.
   */
  on_debug_state(state) {
    this.starting = false;
    if (this.resolve_ready) {
      this.resolve_ready(state.status !== NO_SESSION);
      this.resolve_ready = null;
    }
    this.state = state.status;
    this.pc = state.pc;
    this.instruction = state.inst;
    this.count = state.count;
    // A step that stops for input leaves the session free, and a run that
    // waits for input keeps it. The worker knows which one it is, so the
    // buttons follow the flag and not the status.
    this.running = state.running;
    if (state.status !== "running") {
      this.source.set_current(this.position_of(state.pc));
    }
    this.draw_controls();
  }

  /** The line of an address, from the line table of the build. */
  position_of(address) {
    if (!this.line_table) return null;
    return this.line_table.line_of(address);
  }

  /** The state of the buttons and the text of the status line. */
  draw_controls() {
    const running = !!this.running;
    this.step_button.disabled = this.busy || running;
    this.run_button.disabled = this.busy || running;
    this.stop_button.disabled = this.busy || !running;
    this.status_line.textContent = this.status_text();
  }

  status_text() {
    if (this.busy) return "building the program...";
    if (this.state === NO_SESSION) {
      return "No session. Step starts the program and stops at its first instruction.";
    }
    if (this.state === "ended") {
      return `Program ended after ${this.count} instructions. Step or Run starts it again.`;
    }
    const parts = [];
    if (this.state === "breakpoint") parts.push("stopped at a breakpoint");
    else if (this.state === "waiting") parts.push("waiting for input");
    else if (this.state === "running") parts.push("running");
    else if (this.state === "ready") parts.push("ready");
    else parts.push("stopped");
    parts.push("pc " + hex(this.pc));
    const position = this.position_of(this.pc);
    if (position) parts.push("line " + position.line);
    if (this.instruction) parts.push(this.instruction);
    parts.push(this.count + " instructions");
    return parts.join("  ·  ");
  }

  /** The addresses of the breakpoints that the view holds. */
  breakpoint_addresses() {
    const addresses = [];
    if (!this.line_table) return addresses;
    for (const point of this.source.all_breakpoints()) {
      const lines = this.line_table.line_to_address.get(point.file);
      if (!lines) continue;
      const address = lines.get(point.line);
      if (address !== undefined) addresses.push(address);
    }
    return addresses;
  }

  /**
   * A breakpoint came or went. A run takes the whole set when it starts, so
   * there is nothing to send to the worker now.
   */
  on_breakpoint_change() {
    this.draw_controls();
  }

  async on_step() {
    const session = await this.ensure_session();
    if (!session) return;
    // A session that this press started stops at the first instruction of the
    // program, which is one state the user has not seen yet. The press that
    // comes after it runs that instruction.
    if (session === "started") return;
    simulator_controller.debug_step();
  }

  async on_run() {
    if (!await this.ensure_session()) return;
    simulator_controller.debug_run(this.breakpoint_addresses());
  }

  on_stop() {
    simulator_controller.debug_stop();
  }

  /**
   * Make sure that a session runs the program on screen. The answer waits for
   * the first state message of a new session, because a command that the
   * worker takes before it has the program would be lost.
   *
   * @returns {Promise<string|null>} "open" for a session that was already
   *   there, "started" for a new one, null when the program did not build
   */
  async ensure_session() {
    if (this.state !== NO_SESSION && this.state !== "ended") return "open";
    return await this.start_session() ? "started" : null;
  }

  /**
   * Build the program with a line table and start a session that stops at the
   * first instruction.
   *
   * The build is a second one, beside the build of the RUN button: its source
   * carries the `.loc` directives that give the line table, and its files have
   * names that the auto-compile does not take.
   *
   * @returns {Promise<boolean>}
   */
  async start_session() {
    const sources = this.source.source_files();
    if (sources.length === 0) {
      notify("error", "No program", "Load an assembly file before you debug it.");
      return false;
    }
    if (!this.build_args) {
      notify("error", "Debugger", "The page did not finish loading. Reload and try again.");
      return false;
    }
    this.busy = true;
    this.state = NO_SESSION;
    this.source.set_current(null);
    this.draw_controls();
    try {
      const program = await this.build(sources);
      if (!program) return false;
      this.line_table = program.line_table;
      this.source.set_runnable(runnable_lines(program.line_table));
      // The worker of a session holds one program. A new program needs a new
      // worker, and a session that ended still has its own.
      this.starting = true;
      const ready = new Promise(resolve => { this.resolve_ready = resolve; });
      simulator_controller.restart_simulator();
      simulator_controller.load_new_file(program.file);
      simulator_controller.start_execution(this.build_args(DEBUG_PROGRAM), true);
      return await ready;
    } catch (error) {
      notify("error", "The debug session did not start", String(error));
      return false;
    } finally {
      this.starting = false;
      this.busy = false;
      this.draw_controls();
    }
  }

  /**
   * Assemble and link a copy of the program that carries a line table.
   *
   * @param {File[]} sources the assembly files of the program
   * @returns {Promise<?{file: File, line_table: object}>}
   */
  async build(sources) {
    const saved = compiler.loaded_files;
    compiler.quiet = true;
    try {
      const inputs = [];
      for (const source of sources) {
        const text = await source.text();
        const instrumented = instrument_source(text, source.name);
        if (instrumented === null) {
          notify("error", "Debugger",
            `${source.name} has .file or .loc directives of its own, which the debugger cannot add to.`);
          return null;
        }
        inputs.push(new File([instrumented], source.name + DEBUG_SOURCE_SUFFIX,
                             {type: "text/plain"}));
      }
      // The compiler keeps the array it is given and puts each result in it,
      // so it gets a copy of its own. A loop over the array that grows would
      // assemble the object files that the loop before it made.
      compiler.set_file_array(inputs.slice());
      const objects = [];
      for (const input of inputs) {
        const object = input.name.replace(DEBUG_SOURCE_SUFFIX, DEBUG_OBJECT_SUFFIX);
        const result = await compiler.as([input.name, "-o", object]);
        if (!result) {
          notify("error", "The program did not assemble",
            "The terminal holds the message of the assembler.");
          return null;
        }
        objects.push(object);
      }
      const elf = await compiler.ld([objects, "-o", DEBUG_PROGRAM].flat(), false);
      if (!elf) {
        notify("error", "The program did not link",
          "The terminal holds the message of the linker.");
        return null;
      }
      const bytes = new Uint8Array(await elf.arrayBuffer());
      const line_table = read_line_table(bytes);
      if (line_table.rows === 0) {
        notify("notice", "No line table",
          "The program has no line information, so a breakpoint has no address.");
      }
      return {file: elf, line_table};
    } finally {
      compiler.set_file_array(saved);
      compiler.quiet = false;
    }
  }
}


/** The lines of each file that have an address. */
function runnable_lines(line_table) {
  const runnable = new Map();
  for (const [file, lines] of line_table.line_to_address) {
    runnable.set(file, new Set(lines.keys()));
  }
  return runnable;
}


/** An address, as the simulator writes one. */
function hex(value) {
  return "0x" + (value >>> 0).toString(16).padStart(8, "0");
}


/** A message for the user, through the notification stack of the page. */
function notify(kind, title, text) {
  const PNotify = window.PNotify;
  if (!PNotify) {
    console.log(`${title}: ${text}`);
    return;
  }
  PNotify[kind]({title, text, sticker: false, stack: window.stackBottomRight});
}


export const debugger_page = new DebuggerPage();
