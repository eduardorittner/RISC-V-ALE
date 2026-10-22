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
 * How long the page waits for the first state of a new session, in
 * milliseconds. The session says "ready" as soon as the module is up, so a
 * longer wait means that something is wrong with the module and not that the
 * program is large.
 */
const START_TIMEOUT = 20000;

/**
 * How long the page waits for one step of the build.
 *
 * The first build of a page downloads the assembler (29 MB) and the linker
 * (16 MB), so a first build on a slow connection is much slower than the
 * builds after it. The limit is therefore high. The disabled Step and Run buttons are
 * what shows that a build is in progress.
 */
const BUILD_TIMEOUT = 180000;

/** The answer of `with_timeout` when the promise did not answer. */
const TIMED_OUT = Symbol("timed out");

/**
 * Wait for `promise`, and give up after `ms`.
 *
 * @template T
 * @param {Promise<T>} promise
 * @param {number} ms
 * @param {string} what the name of the step, for the message
 * @returns {Promise<T>}
 */
async function with_timeout(promise, ms, what){
  let timer = 0;
  const limit = new Promise(resolve => {
    timer = setTimeout(() => resolve(TIMED_OUT), ms);
  });
  const answer = await Promise.race([promise, limit]);
  clearTimeout(timer);
  if (answer === TIMED_OUT) {
    throw new Error(`${what} did not answer in ${Math.round(ms / 1000)} seconds`);
  }
  return answer;
}

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
 * The name that the calling convention gives to each integer register, from
 * x0 to x31.
 *
 * This is the name that the source of the program writes, so it is the name
 * that the view puts first. The number of the register goes beside it: whisper
 * writes `x8` and not `s0` in its own output, and a reader must find the same
 * register in the two places.
 *
 * x8 has a second name, `fp`, which a program with a frame pointer uses. The
 * view gives it the one name `s0`, because `s0` is the name of the register in
 * the table of the calling convention.
 *
 * @type {string[]}
 */
const REGISTER_NAMES = [
  "zero", "ra", "sp", "gp", "tp", "t0", "t1", "t2",
  "s0", "s1", "a0", "a1", "a2", "a3", "a4", "a5",
  "a6", "a7", "s2", "s3", "s4", "s5", "s6", "s7",
  "s8", "s9", "s10", "s11", "t3", "t4", "t5", "t6"
];

/** What a cell shows while no session gives a value. */
const NO_VALUE = "\u2014";

/**
 * The number of columns that the register file can take.
 *
 * Each one divides the thirty-two registers without a remainder, so every
 * column holds the same number of boxes and the grid has no hole at the foot
 * of its last column.
 *
 * @type {number[]}
 */
const REGISTER_COLUMNS = [1, 2, 4, 8];

/**
 * The number forms that a register value can take: how a value of that form
 * reads, and the longest value that the form can write.
 *
 * The view measures a box that holds the longest value to learn how wide a
 * box of that form must be. A width written here would be the width of one
 * font at one size, and the day the font or the size changes the boxes would
 * cut their values.
 *
 * The decimal form is the signed one. A register holds thirty-two bits, and
 * the instruction that reads them says which of the two forms they carry, but
 * the signed form is the one that answers the question a reader of a loop or
 * of a negative immediate has.
 *
 * @type {Object<string, {longest: string, format: function(number): string}>}
 */
const REGISTER_FORMATS = {
  hex: {longest: "0x00000000", format: (value) => hex(value)},
  dec: {longest: "-2147483648", format: (value) => String(value | 0)}
};

/**
 * The order of the words of the switch of a box, which is also the order that
 * the title of a value reads them in.
 *
 * @type {string[]}
 */
const REGISTER_FORMAT_ORDER = ["hex", "dec"];

/** The form that a box takes until its switch says another one. */
const DEFAULT_REGISTER_FORMAT = "hex";

/**
 * The width in pixels of one line of the grid, which the CSS makes from the
 * gap between two boxes and from the border around the grid.
 */
const REGISTER_GRID_LINE = 1;


/**
 * The value of each register of the hart, in hexadecimal.
 *
 * The view holds a cell for each register and writes into it. It does not
 * build the cells again at each stop, because a step changes two or three
 * values of thirty-three, and because a new set of cells would lose the
 * scroll position of the panel.
 */
class RegisterView {
  /**
   * @param {HTMLElement} container the body of the register panel
   */
  constructor(container) {
    this.container = container;
    /**
     * The element that holds the value of each register. Index 0 is the
     * program counter and the indexes 1 to 32 are x0 to x31.
     * @type {HTMLElement[]}
     */
    this.cells = [];
    /**
     * The cell of each register, which takes the mark of a value that
     * changed.
     * @type {HTMLElement[]}
     */
    this.rows = [];
    /** The name of each register, in the order of the cells. */
    this.names = [];
    /**
     * The number form that each cell shows. Index 0 is the program counter,
     * which keeps the hexadecimal form of an address.
     * @type {string[]}
     */
    this.formats = [];
    /**
     * The switch of each box, which is the control that writes `formats`.
     * The program counter has none, so its entry is null.
     * @type {?HTMLElement[]}
     */
    this.switches = [];
    /**
     * The values of the stop before this one, which say which cell changed.
     * It is null for the first stop of a session, where nothing changed yet.
     * @type {?number[]}
     */
    this.previous = null;
    /**
     * The shape that the grid has now, as `rows:box height`. It is empty
     * until the panel takes a size, which it does when the Debugger tab
     * opens.
     */
    this.shape = "";
    /**
     * The width that a box needs for each form, which the view measures the
     * first time it lays the grid out. It is null while no measure holds.
     * @type {?Object<string, number>}
     */
    this.widths = null;
    this.render();
    // The panel takes its size from the window, and the Bootstrap columns put
    // it beside the source view or below it. The shape of the grid follows.
    this.observer = new ResizeObserver(() => this.layout());
    this.observer.observe(this.container);
    // A box is as tall and as wide as its line of text, and the line of text
    // has the size of the font that carries it. The first layout can come
    // before the page has that font, and the box is another size with it, so
    // the measure of the widths goes and the layout runs again.
    if (document.fonts) {
      document.fonts.ready.then(() => {
        this.widths = null;
        this.layout();
      });
    }
  }

  /**
   * Give the grid the shape that fills the panel.
   *
   * The choice is the smallest number of columns that holds the file: the
   * fewer the columns, the more boxes a column holds, and the closer a box is
   * to the height of its one line of text. A column count that the width
   * cannot hold is not a choice, and when no count makes the boxes tall
   * enough, the widest one that the panel holds wins and the panel scrolls.
   */
  layout() {
    const width = this.container.clientWidth;
    // The Debugger tab is hidden until the reader opens it, and a hidden
    // panel has no size to measure.
    if (width === 0) return;
    const box = this.box_height();
    const height = this.file_height();
    const box_width = this.box_width();
    const fits = REGISTER_COLUMNS.filter(
      (columns) => columns * box_width <= width);
    if (fits.length === 0) fits.push(REGISTER_COLUMNS[0]);
    let choice = fits[fits.length - 1];
    for (const columns of fits) {
      const rows = REGISTER_NAMES.length / columns;
      // The lines of the grid take their own place: one between two rows.
      // The lines at the edge belong to the card and to the box of the
      // program counter, which the height here already leaves out.
      if (rows * box + (rows - 1) * REGISTER_GRID_LINE <= height) {
        choice = columns;
        break;
      }
    }
    const rows = REGISTER_NAMES.length / choice;
    const shape = rows + ":" + box;
    if (shape === this.shape) return;
    this.shape = shape;
    this.file.style.setProperty("--dbg-reg-rows", String(rows));
    this.file.style.setProperty("--dbg-reg-box-height", box + "px");
  }

  /**
   * The width in pixels that one box of the grid needs now.
   *
   * Every column of the grid has the width of every other one, so the file
   * needs the width of its widest box: the widest form that a switch holds
   * now. One register in the wider form can therefore give the whole grid
   * fewer columns. That is the price of a switch for each box, and the other
   * way costs more: a column that only the widest box fills makes the grid
   * wider than the panel, and the panel then scrolls to the right at every
   * stop. The two forms are close in width, so the grid keeps its shape
   * through most of the widths that the panel takes.
   *
   * @returns {number}
   */
  box_width() {
    if (this.widths === null) this.widths = this.measure_widths();
    let widest = 0;
    // Index 0 is the program counter, which is not in the grid.
    for (let index = 1; index < this.formats.length; index++) {
      widest = Math.max(widest, this.widths[this.formats[index]]);
    }
    return widest;
  }

  /**
   * The width in pixels that a box needs for the longest value of each form.
   *
   * The measure is a box of the file with the longest value in it, which the
   * page lays out but does not show. It carries the name, the number, the
   * value, the switch, and every gap and padding between them, so the number
   * is the whole box and not a sum of parts.
   *
   * The box goes inside the grid, because the font and the size come from
   * there. It is out of the flow, so it is no box of the grid and the grid
   * does not move for it.
   *
   * @returns {Object<string, number>}
   */
  measure_widths() {
    const probe = /** @type {HTMLElement} */ (this.rows[1].cloneNode(true));
    probe.style.position = "absolute";
    probe.style.visibility = "hidden";
    probe.style.width = "max-content";
    this.grid.appendChild(probe);
    const cell = probe.querySelector(".dbg-reg-value");
    const widths = {};
    for (const name of REGISTER_FORMAT_ORDER) {
      cell.textContent = REGISTER_FORMATS[name].longest;
      widths[name] = Math.ceil(probe.getBoundingClientRect().width);
    }
    probe.remove();
    return widths;
  }

  /**
   * The height in pixels that one box needs for its line of text.
   *
   * The box of the program counter gives the number. It holds the same line
   * as a register box, and the grid does not stretch it, so its height is the
   * height that a register box cannot go below. A number written here instead
   * would be the height of one font at one size, and the panel would overflow
   * the day one of the two changes.
   *
   * @returns {number}
   */
  box_height() {
    // clientHeight leaves out the border of the box, which the boxes of the
    // grid do not have: there the gap draws the line.
    return this.rows[0].clientHeight;
  }

  /**
   * The height in pixels that the grid of the file can take: what the panel
   * holds, less its padding and less the box of the program counter.
   *
   * @returns {number}
   */
  file_height() {
    const panel = getComputedStyle(this.container);
    const pc = this.rows[0];
    const gap = parseFloat(getComputedStyle(pc).marginBottom);
    return this.container.clientHeight
      - parseFloat(panel.paddingTop) - parseFloat(panel.paddingBottom)
      - pc.getBoundingClientRect().height - gap;
  }

  /**
   * Build one cell for each register. The cells carry no value until a session
   * reports one.
   *
   * The program counter is a child of the panel, and the thirty-two registers
   * of the file are children of a box of their own. That box puts them in
   * columns from the top down, so a reader finds x0 to x31 in the order of
   * the table of the calling convention when the eye goes down a column.
   */
  render() {
    const grid = document.createElement("div");
    grid.className = "dbg-regs dbg-regs-idle";
    this.grid = grid;
    this.add_cell(grid, "pc", "");
    const file = document.createElement("div");
    file.className = "dbg-reg-file";
    this.file = file;
    // Sixty-four words of a switch are sixty-four listeners, so the file
    // listens once for all of them. A box that the view builds later needs no
    // listener of its own either.
    file.addEventListener("click", (event) => this.on_switch_click(event));
    file.addEventListener("keydown", (event) => this.on_switch_key(event));
    for (let index = 0; index < REGISTER_NAMES.length; index++) {
      this.add_cell(file, REGISTER_NAMES[index], "x" + index);
    }
    grid.appendChild(file);
    this.container.textContent = "";
    this.container.classList.remove("text-muted");
    this.container.appendChild(grid);
  }

  /**
   * One cell of the view: the name of the register, its number, its value,
   * and the switch that says which form the value takes.
   *
   * @param {HTMLElement} parent the element that takes the cell
   * @param {string} name the name of the calling convention
   * @param {string} number the `x` name, which the program counter does not have
   */
  add_cell(parent, name, number) {
    const at = this.cells.length;
    const row = document.createElement("div");
    row.className = number === "" ? "dbg-reg dbg-reg-pc" : "dbg-reg";
    // The listener of the file reads this to learn which box a word of a
    // switch belongs to.
    row.dataset.index = String(at);
    const label = document.createElement("span");
    label.className = "dbg-reg-name";
    label.textContent = name;
    const index = document.createElement("span");
    index.className = "dbg-reg-number";
    index.textContent = number;
    const value = document.createElement("span");
    value.className = "dbg-reg-value";
    value.textContent = NO_VALUE;
    row.appendChild(label);
    row.appendChild(index);
    row.appendChild(value);
    // The program counter holds an address, which the panels, the terminal
    // and the output of the simulator all write in hexadecimal. A reader must
    // find the same address in each of them, so that box has no switch. The
    // column of the switch stays empty there and the four parts of the boxes
    // keep their line.
    const control = number === "" ? null : this.build_switch(name);
    if (control !== null) row.appendChild(control);
    parent.appendChild(row);
    this.rows.push(row);
    this.cells.push(value);
    this.names.push(name);
    this.switches.push(control);
    this.formats.push(DEFAULT_REGISTER_FORMAT);
    this.apply_format(at);
  }

  /**
   * The switch of one box: the forms, each one in a word of its own short
   * name.
   *
   * One of them holds at a time, so they are a group of radio buttons and not
   * buttons that a reader presses. The group takes one stop of the keyboard,
   * and the arrows walk between the words inside it: a stop for each word
   * would make the panel a wall to anybody who does not use a mouse.
   *
   * @param {string} name the register that the switch belongs to
   * @returns {HTMLElement}
   */
  build_switch(name) {
    const group = document.createElement("span");
    group.className = "dbg-reg-switch";
    group.setAttribute("role", "radiogroup");
    group.setAttribute("aria-label", "The number form of " + name);
    for (const format of REGISTER_FORMAT_ORDER) {
      const word = document.createElement("button");
      word.type = "button";
      word.className = "dbg-reg-form";
      word.dataset.format = format;
      word.setAttribute("role", "radio");
      word.textContent = format;
      group.appendChild(word);
    }
    return group;
  }

  /**
   * A word of a switch takes the form of its box.
   *
   * @param {MouseEvent} event
   */
  on_switch_click(event) {
    const word = /** @type {HTMLElement} */ (event.target).closest(".dbg-reg-form");
    if (word === null) return;
    this.set_format(Number(word.closest(".dbg-reg").dataset.index), word.dataset.format);
  }

  /**
   * The left and right arrows walk the words of one switch, and the word that
   * the walk reaches is the form that the box takes. This is how a group of
   * radio buttons answers the keyboard.
   *
   * @param {KeyboardEvent} event
   */
  on_switch_key(event) {
    const word = /** @type {HTMLElement} */ (event.target).closest(".dbg-reg-form");
    if (word === null) return;
    const step = event.key === "ArrowRight" ? 1 : event.key === "ArrowLeft" ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const count = REGISTER_FORMAT_ORDER.length;
    const at = REGISTER_FORMAT_ORDER.indexOf(word.dataset.format);
    const next = (at + step + count) % count;
    const index = Number(word.closest(".dbg-reg").dataset.index);
    this.set_format(index, REGISTER_FORMAT_ORDER[next]);
    /** @type {HTMLElement} */ (this.switches[index].children[next]).focus();
  }

  /**
   * Show the value of one register in another number form.
   *
   * The switch belongs to the box: a reader asks the question of one register
   * and not of the file. The value does not come again from the session,
   * because the session is stopped and the view already holds it.
   *
   * @param {number} index the box, where 0 is the program counter
   * @param {string} format a key of `REGISTER_FORMATS`
   */
  set_format(index, format) {
    if (index <= 0 || index >= this.formats.length) return;
    if (!(format in REGISTER_FORMATS) || this.formats[index] === format) return;
    this.formats[index] = format;
    this.apply_format(index);
    // A box as wide as the widest form holds the file, so one box in the
    // wider form can give the grid another shape.
    this.layout();
  }

  /**
   * Put the form of one box on screen: the word of the switch that holds, and
   * the value that the cell shows.
   *
   * @param {number} index the box, where 0 is the program counter
   */
  apply_format(index) {
    const group = this.switches[index];
    if (group !== null) {
      for (const word of group.children) {
        const on = /** @type {HTMLElement} */ (word).dataset.format === this.formats[index];
        word.classList.toggle("active", on);
        word.setAttribute("aria-checked", String(on));
        // The group takes one stop of the keyboard, and that stop is the word
        // that holds now.
        /** @type {HTMLElement} */ (word).tabIndex = on ? 0 : -1;
      }
    }
    if (this.previous !== null) this.write_cell(index, this.previous[index]);
  }

  /**
   * Show the registers of a stop, and mark each value that the step or the run
   * changed.
   *
   * @param {number} pc the program counter
   * @param {?number[]} values x0 to x31, or null for a state that carries none
   */
  set_values(pc, values) {
    if (!values) {
      this.clear();
      return;
    }
    const all = [pc >>> 0].concat(values);
    this.grid.classList.remove("dbg-regs-idle");
    for (let index = 0; index < this.cells.length; index++) {
      const value = all[index] >>> 0;
      this.write_cell(index, value);
      // The program counter is not in the mark. Each step moves it, so a mark
      // on it is always there and says nothing.
      if (index > 0) {
        const changed = this.previous !== null && this.previous[index] !== value;
        this.rows[index].classList.toggle("dbg-reg-changed", changed);
      }
    }
    this.previous = all;
  }

  /**
   * Write the value of one cell, in the form that its switch says, and give
   * the cell the title that holds the other two forms.
   *
   * The title sits on the value and not on the box, because the switch is in
   * the box: a title of the box would open over the words that the reader is
   * going to press. The program counter has no title, because the other forms
   * of an address answer no question.
   *
   * @param {number} index the cell, where 0 is the program counter
   * @param {number} value the value of the register, as 32 bits with no sign
   */
  write_cell(index, value) {
    if (index === 0) {
      this.cells[0].textContent = hex(value);
      return;
    }
    const format = this.formats[index];
    this.cells[index].textContent = REGISTER_FORMATS[format].format(value);
    const others = REGISTER_FORMAT_ORDER
      .filter((name) => name !== format)
      .map((name) => REGISTER_FORMATS[name].format(value));
    this.cells[index].title = `${this.names[index]} = ${others.join(" = ")}`;
  }

  /** Forget the values. The session is gone, so none of them is true now. */
  clear() {
    this.previous = null;
    this.grid.classList.add("dbg-regs-idle");
    for (let index = 0; index < this.cells.length; index++) {
      this.cells[index].textContent = NO_VALUE;
      this.rows[index].classList.remove("dbg-reg-changed");
      this.cells[index].removeAttribute("title");
    }
  }
}


/**
 * The number of bytes of memory that the view holds at a time.
 *
 * The session copies this many bytes at each stop, so the number is a cost of
 * every step. It is also the distance that a reader can scroll before the
 * view must ask the session for more.
 */
const MEMORY_WINDOW = 4096;

/**
 * How far the window moves when the scroll comes near one of its edges, in
 * bytes. Half of the window: the lines on screen stay in the window after the
 * move, and the next move is half a window away.
 */
const MEMORY_SHIFT = MEMORY_WINDOW / 2;

/**
 * How near to an edge of the window the scroll must come before the view asks
 * for the part of memory on the other side of the edge, in lines.
 */
const MEMORY_EDGE_LINES = 16;

/**
 * The number of bytes that one line can hold, widest first. The view takes
 * the widest one that the panel holds, so a narrow panel shows eight bytes a
 * line and scrolls no line to the right.
 *
 * Each one divides `MEMORY_WINDOW` and `MEMORY_ALIGN`, so a line always
 * starts at a multiple of its own width.
 */
const MEMORY_LINE_WIDTHS = [16, 8];

/**
 * The number of bytes in one group of a line. One space more than usual
 * stands between two groups, so the eye finds the byte of an offset.
 */
const MEMORY_GROUP = 8;

/** The multiple that the first address of the window is aligned to. */
const MEMORY_ALIGN = 16;

/**
 * The number of zero bytes that divide two parts of memory that hold data.
 *
 * Most of the memory is zero, and the arrows of the panel walk the parts
 * that are not: the headers of the program, its code and data, the heap and
 * the stack. A run of zeros that is shorter than this is inside a part: a
 * word of zeros in a structure is data, and not space between two
 * structures. A page of padding between two sections is longer, so the
 * sections are two parts.
 */
const MEMORY_GAP = 64;

/** The size of the address space of a hart with 32 bit registers. */
const ADDRESS_SPACE = 0x100000000;

/** What a cell shows for a byte that the hart could not read. */
const NO_BYTE = "??";

/** What `MemoryView.shown` holds for a byte that the hart could not read. */
const NO_BYTE_VALUE = -1;

/** What `MemoryView.shown` holds for a cell that no draw wrote yet. */
const NOT_DRAWN = -2;

/**
 * The marks of a cell, as bits. A draw keeps the marks of each cell and
 * writes a class only when its bit changes.
 */
const MARK_NONE = 1;
const MARK_ZERO = 2;
const MARK_CHANGED = 4;
const MARK_READ = 8;
const MARK_WRITE = 16;

/** The marks that both cells of a byte carry, with the class of each one. */
const CELL_MARKS = [
  [MARK_ZERO, "dbg-mem-zero"],
  [MARK_CHANGED, "dbg-mem-changed"],
  [MARK_READ, "dbg-mem-read"],
  [MARK_WRITE, "dbg-mem-write"],
];

/** The two hexadecimal digits of each byte value, made once. */
const HEX_BYTES = Array.from({length: 256}, (_, value) => value.toString(16).padStart(2, "0"));

/**
 * The character of each byte value: the byte itself when it is printable
 * ASCII, and a point for every other value, which is what every dump does.
 */
const PRINTABLE_CHARS = Array.from({length: 256},
  (_, value) => value >= 0x20 && value < 0x7f ? String.fromCharCode(value) : ".");

/** The title of the address field, which says what the field takes. */
const MEMORY_FIELD_HINT =
  "An address, or a register with an offset: 0x10000, sp, sp-16, pc. " +
  "A view at a register follows it from stop to stop, and an empty field " +
  "follows the loads and stores of the program.";


/**
 * The memory of the hart, as a dump: on each line an address, the bytes from
 * that address in hexadecimal, and the same bytes as text.
 *
 * The view holds one window of the memory, which the session copies to it at
 * each stop. A scroll that comes near an edge of the window moves the window,
 * so a reader walks the whole memory with the wheel and meets no edge.
 *
 * At each stop the view marks the bytes that changed since the stop before,
 * and the bytes that the last instruction read or wrote.
 *
 * The field of the panel says where the window is. It takes an address, which
 * pins the view there, or a register, which the view follows from stop to
 * stop. An empty field leaves the view free to follow the loads and stores of
 * the program.
 *
 * The two arrows go to the part of memory that holds data before or after
 * the one on screen, where `MEMORY_GAP` zero bytes end a part. The session
 * finds the part, because the view holds one window of a memory that is
 * mostly zeros, and the view pins itself to its first address.
 */
class MemoryView {
  /**
   * @param {HTMLElement} container the body of the memory panel
   * @param {HTMLInputElement} field the control that names the address
   * @param {HTMLButtonElement} previous_button the arrow to the part before
   * @param {HTMLButtonElement} next_button the arrow to the part after
   */
  constructor(container, field, previous_button, next_button) {
    this.container = container;
    this.field = field;
    this.previous_button = previous_button;
    this.next_button = next_button;
    /** True while the page is busy or a run is in progress: no search then. */
    this.busy = false;
    /** The number of bytes on one line. */
    this.bytes_per_line = MEMORY_LINE_WIDTHS[0];
    /** The size of the memory of the hart, in bytes. */
    this.mem_size = ADDRESS_SPACE;
    /** The address of the first byte of the window. */
    this.base = 0;
    /**
     * The bytes of the window, or null while the view holds none.
     * @type {?Uint8Array}
     */
    this.bytes = null;
    /**
     * The window at the stop before this one, which says which byte changed.
     * It is null at the first stop of a session.
     * @type {?{base: number, bytes: Uint8Array}}
     */
    this.previous = null;
    /**
     * The bytes that the last instruction read or wrote, or null when it
     * did neither: the address, the length and the kind of the access.
     *
     * @type {?{addr: number, len: number, write: boolean}}
     */
    this.access = null;
    /**
     * The first address of the window that the view asked for and that has
     * no answer yet, or null.
     * @type {?number}
     */
    this.pending = null;
    /**
     * The registers of the last stop, which an expression of the field reads.
     * Null while no session is stopped.
     * @type {?number[]}
     */
    this.regs = null;
    /** The program counter of the last stop. */
    this.pc = 0;
    /**
     * The expression of the field, parsed, or null for an empty field.
     * @type {?{terms: Array<object>, follows: boolean}}
     */
    this.expression = null;
    /** The text of the field that `expression` came from. */
    this.applied_text = "";
    /**
     * The address that the view opens at when the field names none: the
     * first instruction of the program, or null without a line table.
     * @type {?number}
     */
    this.default_address = null;
    /**
     * An address to bring on screen at the next draw, and where to put it.
     * @type {?{address: number, where: string}}
     */
    this.scroll_to = null;
    /** The lines on screen, each one with its cells. */
    this.lines = [];
    /** The number of bytes that each line on screen has cells for. */
    this.lines_width = 0;
    /**
     * What each cell shows: the value of its byte, `NO_BYTE_VALUE` for a byte
     * that the hart could not read, or `NOT_DRAWN` for a cell that no draw
     * wrote yet. A draw writes a cell only when it must show another value.
     * @type {Int16Array}
     */
    this.shown = new Int16Array(0);
    /**
     * The marks that each cell has, as bits of `MARK_*`. A draw writes a
     * class only when its bit changes.
     * @type {Uint8Array}
     */
    this.marks = new Uint8Array(0);
    /** The address of the first line on screen, or -1 while there is none. */
    this.shown_base = -1;
    /**
     * The height in pixels of one line, which the view measures with the
     * widths. It is the same at every stop, so a draw does not measure it.
     */
    this.line_height = 0;
    /**
     * The width in pixels that a line of each width needs, which the view
     * measures the first time it lays the panel out. Null while no measure
     * holds.
     * @type {?Object<number, number>}
     */
    this.widths = null;
    this.build();
    this.field.title = MEMORY_FIELD_HINT;
    this.previous_button.addEventListener("click", () => this.on_navigate(false));
    this.next_button.addEventListener("click", () => this.on_navigate(true));
    this.field.addEventListener("change", () => this.on_expression());
    this.field.addEventListener("keydown", (event) => {
      if (event.key !== "Enter") return;
      event.preventDefault();
      this.on_expression();
    });
    this.container.addEventListener("scroll", () => this.on_scroll());
    // Eight thousand cells are eight thousand titles. One listener writes the
    // title of the cell under the pointer.
    this.body.addEventListener("mouseover", (event) => this.on_hover(event));
    // The panel takes its size from the window. The width of a line follows.
    this.observer = new ResizeObserver(() => this.layout());
    this.observer.observe(this.container);
    // The first layout can come before the page has the font of the dump,
    // and a line is another width with it.
    if (document.fonts) {
      document.fonts.ready.then(() => {
        this.widths = null;
        this.layout();
      });
    }
  }

  /**
   * The two parts of the panel: the head with the offset of each column, and
   * the lines. Both stay hidden while no session gives bytes, so the panel
   * is empty.
   */
  build() {
    this.container.textContent = "";
    this.container.classList.remove("text-muted");
    this.head = document.createElement("div");
    this.head.className = "dbg-mem-head";
    this.body = document.createElement("div");
    this.body.className = "dbg-mem-lines";
    this.container.appendChild(this.head);
    this.container.appendChild(this.body);
    this.show_idle();
  }

  /** Leave the panel empty: no head and no lines, and no arrow to press. */
  show_idle() {
    this.head.hidden = true;
    this.body.hidden = true;
    this.draw_buttons();
  }

  /**
   * The state of the arrows: there is a part to look for only while the view
   * holds bytes of a stopped session.
   */
  draw_buttons() {
    const disabled = this.bytes === null || this.busy;
    this.previous_button.disabled = disabled;
    this.next_button.disabled = disabled;
  }

  /**
   * The page is busy with a build, or a run is in progress. The core is not
   * free for a search then, so the arrows wait.
   *
   * @param {boolean} busy
   */
  set_busy(busy) {
    this.busy = busy;
    this.draw_buttons();
  }

  /**
   * One line of the dump: the address, a cell for each byte, and a cell for
   * the character of each byte. A space of text stands between two byte
   * cells, so that a copy of the lines reads as a dump.
   *
   * @param {number} width the number of bytes of the line
   * @returns {{row: HTMLElement, address: HTMLElement, bytes: HTMLElement[], chars: HTMLElement[]}}
   */
  build_line(width) {
    const row = document.createElement("div");
    row.className = "dbg-mem-line";
    const address = document.createElement("span");
    address.className = "dbg-mem-addr";
    const hex_part = document.createElement("span");
    hex_part.className = "dbg-mem-hex";
    const text_part = document.createElement("span");
    text_part.className = "dbg-mem-ascii";
    const bytes = [];
    const chars = [];
    for (let offset = 0; offset < width; offset++) {
      if (offset > 0) {
        const gap = offset % MEMORY_GROUP === 0 ? "  " : " ";
        hex_part.appendChild(document.createTextNode(gap));
      }
      const byte = document.createElement("span");
      byte.className = "dbg-mem-byte";
      byte.dataset.offset = String(offset);
      hex_part.appendChild(byte);
      bytes.push(byte);
      const char = document.createElement("span");
      char.className = "dbg-mem-char";
      char.dataset.offset = String(offset);
      text_part.appendChild(char);
      chars.push(char);
    }
    row.appendChild(address);
    row.appendChild(hex_part);
    row.appendChild(text_part);
    return {row, address, bytes, chars};
  }

  /**
   * The head of the dump: the offset of each column, in the form of a line so
   * that the columns of the two stand over each other.
   *
   * @param {number} width the number of bytes of a line
   */
  build_head(width) {
    const line = this.build_line(width);
    line.address.textContent = "address";
    for (let offset = 0; offset < width; offset++) {
      line.bytes[offset].textContent = hex_byte(offset);
    }
    line.row.querySelector(".dbg-mem-ascii").textContent = "text";
    this.head.textContent = "";
    this.head.appendChild(line.row);
  }

  /**
   * Build the lines of a window of `count` lines of `width` bytes.
   *
   * @param {number} width
   * @param {number} count
   */
  build_lines(width, count) {
    this.build_head(width);
    this.lines = [];
    const rows = document.createDocumentFragment();
    for (let index = 0; index < count; index++) {
      const line = this.build_line(width);
      this.lines.push(line);
      rows.appendChild(line.row);
    }
    this.body.textContent = "";
    this.body.appendChild(rows);
    this.lines_width = width;
    // New cells show nothing and carry no mark.
    this.shown = new Int16Array(width * count).fill(NOT_DRAWN);
    this.marks = new Uint8Array(width * count);
    this.shown_base = -1;
  }

  /**
   * Draw the window. The lines stay from one draw to the next: the view
   * writes their cells, because a new set of lines would lose the scroll
   * position.
   *
   * A draw writes only the cells that must show another value or another
   * mark. Few bytes change at a step, so a draw is a few writes and not a
   * write of the whole dump. The draw reads no size of the page: a read
   * after the writes makes the browser lay the dump out at once.
   */
  render() {
    if (this.bytes === null) {
      this.show_idle();
      return;
    }
    const width = this.bytes_per_line;
    const count = Math.ceil(this.bytes.length / width);
    if (this.lines_width !== width || this.lines.length !== count) {
      this.build_lines(width, count);
    }
    if (this.shown_base !== this.base) {
      for (let index = 0; index < count; index++) {
        const line = this.lines[index];
        const address = this.base + index * width;
        line.row.dataset.address = String(address);
        line.address.textContent = hex_address(address);
      }
      this.shown_base = this.base;
    }
    const bytes = this.bytes;
    const shown = this.shown;
    const marks = this.marks;
    for (let index = 0; index < count; index++) {
      const line = this.lines[index];
      const start = index * width;
      for (let offset = 0; offset < width; offset++) {
        const at = start + offset;
        const none = at >= bytes.length;
        const value = none ? NO_BYTE_VALUE : bytes[at];
        let mark = 0;
        if (none) {
          mark = MARK_NONE;
        } else {
          const address = this.base + at;
          // A zero is the most common byte of a memory, and it says the
          // least. It is pale in both columns, so that the data stands out.
          if (value === 0) mark |= MARK_ZERO;
          if (this.changed(address, value)) mark |= MARK_CHANGED;
          const access = this.accessed(address);
          if (access === "read") mark |= MARK_READ;
          else if (access === "write") mark |= MARK_WRITE;
        }
        const was = marks[at];
        if (shown[at] === value && was === mark) continue;
        const byte = line.bytes[offset];
        const char = line.chars[offset];
        if (shown[at] !== value) {
          byte.textContent = none ? NO_BYTE : hex_byte(value);
          char.textContent = none ? " " : printable(value);
          shown[at] = value;
        }
        const differ = was ^ mark;
        if (differ & MARK_NONE) byte.classList.toggle("dbg-mem-none", none);
        for (const [bit, name] of CELL_MARKS) {
          if ((differ & bit) === 0) continue;
          const on = (mark & bit) !== 0;
          byte.classList.toggle(name, on);
          char.classList.toggle(name, on);
        }
        marks[at] = mark;
      }
    }
    this.head.hidden = false;
    this.body.hidden = false;
    this.draw_buttons();
    if (this.scroll_to !== null) {
      const target = this.scroll_to;
      this.scroll_to = null;
      this.place(target.address, target.where);
    }
  }

  /**
   * True when the byte at `address` had another value at the stop before.
   * A byte that the window of that stop did not hold is not changed: the
   * view does not know.
   *
   * @param {number} address
   * @param {number} value
   */
  changed(address, value) {
    const before = this.previous;
    if (before === null) return false;
    const at = address - before.base;
    return at >= 0 && at < before.bytes.length && before.bytes[at] !== value;
  }

  /**
   * How the last instruction touched the byte at `address`: "read", "write"
   * or null.
   *
   * @param {number} address
   * @returns {?string}
   */
  accessed(address) {
    const access = this.access;
    if (access === null) return null;
    if (address < access.addr || address >= access.addr + access.len) return null;
    return access.write ? "write" : "read";
  }

  /**
   * Scroll the window so that the line of `address` is on screen: at the top
   * of the panel when `where` is "top", or else at the nearest edge, and
   * nowhere when the line is on screen already.
   *
   * @param {number} address
   * @param {string} where "top" or "nearest"
   */
  place(address, where) {
    const index = Math.floor((address - this.base) / this.bytes_per_line);
    if (index < 0 || index >= this.lines.length) return;
    const panel = this.container;
    // The scroll position that puts the line right under the head. The head
    // is sticky, so a line that is under it is not on screen.
    const top = index * this.line_height;
    if (where === "top") {
      panel.scrollTop = top;
      return;
    }
    const visible = panel.clientHeight - this.head.offsetHeight - this.line_height;
    if (top < panel.scrollTop) panel.scrollTop = top;
    else if (top > panel.scrollTop + visible) panel.scrollTop = top - visible;
  }

  /** The address of the first line on screen. */
  top_address() {
    if (this.bytes === null || this.line_height === 0) return this.base;
    const index = Math.floor(this.container.scrollTop / this.line_height);
    return this.base + index * this.bytes_per_line;
  }

  /**
   * Give the lines the width that the panel holds.
   *
   * The choice is the widest line that fits, so the dump keeps sixteen bytes
   * a line where the panel is wide enough and takes eight where it is not. A
   * line that is wider than the panel scrolls to the right at every move,
   * and a dump of four bytes a line is a column and not a dump.
   */
  layout() {
    const width = this.container.clientWidth;
    // The Debugger tab is hidden until the reader opens it, and a hidden
    // panel has no size to measure.
    if (width === 0) return;
    if (this.widths === null) this.measure();
    let choice = MEMORY_LINE_WIDTHS[MEMORY_LINE_WIDTHS.length - 1];
    for (const candidate of MEMORY_LINE_WIDTHS) {
      if (this.widths[candidate] <= width) {
        choice = candidate;
        break;
      }
    }
    if (choice === this.bytes_per_line) return;
    // The line at the top of the panel stays there, in its new width.
    const top = this.top_address();
    this.bytes_per_line = choice;
    if (this.bytes !== null) this.scroll_to = {address: top, where: "top"};
    this.render();
  }

  /**
   * The width in pixels that a line of each width needs, and the height of a
   * line. The measure is a line with a value in every cell, which the page
   * lays out but does not show. It is out of the flow, so the lines do not
   * move for it.
   *
   * The height comes from here and not from a draw. A read of a size after
   * the writes of a draw made the browser lay the whole dump out at once,
   * which was most of the time of a step. The height is the same at every
   * stop: the line height of the dump is a rule of its style.
   */
  measure() {
    const widths = {};
    let height = 0;
    for (const width of MEMORY_LINE_WIDTHS) {
      const line = this.build_line(width);
      line.address.textContent = hex_address(0);
      for (let offset = 0; offset < width; offset++) {
        line.bytes[offset].textContent = "00";
        line.chars[offset].textContent = "0";
      }
      line.row.style.position = "absolute";
      line.row.style.visibility = "hidden";
      line.row.style.minWidth = "0";
      this.container.appendChild(line.row);
      const rect = line.row.getBoundingClientRect();
      widths[width] = Math.ceil(rect.width);
      height = rect.height;
      line.row.remove();
    }
    this.widths = widths;
    this.line_height = height;
  }

  /**
   * The scroll came near an edge of the window: ask for the part of memory
   * on the other side of the edge. The window moves by half its size, so the
   * lines on screen stay in it and the scroll goes on.
   */
  on_scroll() {
    if (this.bytes === null || this.pending !== null || this.line_height === 0) return;
    const panel = this.container;
    const edge = MEMORY_EDGE_LINES * this.line_height;
    if (panel.scrollTop < edge) {
      if (this.base > 0) this.request(this.base - MEMORY_SHIFT);
      return;
    }
    const end = this.base + this.bytes.length;
    const bottom = panel.scrollTop + panel.clientHeight;
    if (bottom > panel.scrollHeight - edge && end < this.mem_size) {
      this.request(this.base + MEMORY_SHIFT);
    }
  }

  /**
   * Ask the session for the window that starts at `base`. The answer comes
   * as a message, so the view draws nothing now.
   *
   * @param {number} base
   */
  request(base) {
    const last = Math.max(0, align_down(this.mem_size - MEMORY_WINDOW));
    base = Math.min(Math.max(0, align_down(base)), last);
    const length = Math.min(MEMORY_WINDOW, this.mem_size - base);
    if (length <= 0 || this.pending === base) return;
    this.pending = base;
    simulator_controller.debug_view_memory(base, length);
  }

  /**
   * Bring `address` on screen. A window that holds it scrolls; any other
   * comes from the session, with the address a quarter of the way down it,
   * so that there is room to scroll up without a wait.
   *
   * @param {number} address
   * @param {string} where "top" or "nearest", for a window that holds it
   */
  go_to(address, where) {
    address = Math.min(Math.max(0, address), this.mem_size - 1);
    const held = this.bytes !== null
      && address >= this.base && address < this.base + this.bytes.length;
    if (held) {
      this.place(address, where);
      return;
    }
    this.scroll_to = {address, where: "top"};
    this.request(align_down(address) - MEMORY_WINDOW / 4);
  }

  /**
   * Take a window from the session and draw it. The byte that was at the top
   * of the panel stays there when the window moved for a scroll.
   *
   * @param {{addr: number, bytes: Uint8Array}} mem
   */
  take(mem) {
    if (this.pending === mem.addr) this.pending = null;
    const keep = this.bytes !== null && this.scroll_to === null
      ? this.base - mem.addr : 0;
    this.base = mem.addr;
    this.bytes = mem.bytes;
    this.render();
    if (keep !== 0) {
      this.container.scrollTop += keep / this.bytes_per_line * this.line_height;
    }
  }

  /**
   * The state of a stop: the registers, which the field can name, the bytes
   * of the window, which the view draws and compares with the stop before,
   * and the access of the last instruction, which the view marks.
   *
   * @param {number} pc
   * @param {?number[]} regs x0 to x31, or null for a state that carries none
   * @param {?{addr: number, bytes: Uint8Array}} mem the window, or null
   * @param {number} mem_size the size of the memory, or 0 when unknown
   * @param {?{addr: number, len: number, write: boolean}} access the bytes
   *   that the last instruction read or wrote, or null
   */
  set_stop(pc, regs, mem, mem_size, access) {
    if (!regs) {
      this.clear();
      return;
    }
    this.regs = regs;
    this.pc = pc >>> 0;
    this.access = access;
    if (mem_size > 0) this.mem_size = mem_size;
    if (mem !== null && mem.bytes.length > 0) {
      if (this.bytes !== null) this.previous = {base: this.base, bytes: this.bytes};
      this.take(mem);
    } else if (this.bytes !== null) {
      // The marks of the access are new, even when the window is not.
      this.render();
    }
    this.follow();
  }

  /**
   * The answer of a request: the window as the session copied it now. The
   * stop stays the same, so the marks of the changed bytes stay too.
   *
   * @param {?{addr: number, bytes: Uint8Array}} mem
   * @param {number} mem_size
   */
  set_window(mem, mem_size) {
    if (mem_size > 0) this.mem_size = mem_size;
    // An answer for a session that is gone has no reader.
    if (mem === null || this.regs === null) return;
    this.take(mem);
  }

  /**
   * Where the view goes at a stop: to the register of the field, when the
   * field names one; to the opening address at the first stop of a session;
   * or to the bytes that the last instruction read or wrote, when the field
   * is empty, so that the mark of the access is on screen.
   */
  follow() {
    if (this.expression !== null && this.expression.follows) {
      const target = this.evaluate(this.expression);
      if (target !== null) this.go_to(target, "nearest");
      return;
    }
    if (this.bytes === null && this.pending === null) {
      this.go_to(this.opening_address(), "top");
      return;
    }
    // An access outside the memory is a device register, which the view
    // cannot show.
    if (this.expression === null && this.access !== null
        && this.access.addr < this.mem_size) {
      this.go_to(this.access.addr, "nearest");
    }
  }

  /**
   * The address that the view opens at: the field, the first instruction of
   * the program, or the program counter.
   *
   * @returns {number}
   */
  opening_address() {
    if (this.expression !== null) {
      const value = this.evaluate(this.expression);
      if (value !== null) return value;
    }
    return this.default_address !== null ? this.default_address : this.pc;
  }

  /**
   * A session starts. The view asks for its first window now, so that the
   * first stop carries the bytes. A field that names a register waits for
   * that stop, which is the first state that has the value of the register.
   *
   * @param {?number} default_address the first instruction of the program
   */
  prepare(default_address) {
    this.default_address = default_address;
    let target = null;
    if (this.expression !== null && !this.expression.follows) {
      target = this.evaluate(this.expression);
    }
    if (target === null) target = default_address;
    if (target !== null) this.go_to(target, "top");
  }

  /** Forget the session. The bytes on screen are from a program that is gone. */
  clear() {
    this.regs = null;
    this.pc = 0;
    this.bytes = null;
    this.access = null;
    this.previous = null;
    this.pending = null;
    this.scroll_to = null;
    this.default_address = null;
    this.show_idle();
  }

  /**
   * The field changed. The view goes where it says, when a session is
   * stopped; a field that names no valid expression takes the mark of an
   * error and changes nothing.
   */
  on_expression() {
    const text = this.field.value;
    if (text === this.applied_text) return;
    const parsed = parse_address_expression(text);
    if (parsed !== null && parsed.error) {
      this.field.classList.add("is-invalid");
      this.field.title = parsed.error;
      return;
    }
    this.applied_text = text;
    this.field.classList.remove("is-invalid");
    this.field.title = MEMORY_FIELD_HINT;
    this.expression = parsed;
    if (parsed === null || this.regs === null) return;
    const target = this.evaluate(parsed);
    if (target !== null) this.go_to(target, "top");
  }

  /**
   * An arrow: ask the session for the part of memory that holds data after
   * the line at the top of the panel, or before it. The search starts at the
   * line after the top one, so that a press moves the view: a part that
   * starts on the top line is on screen already. The answer comes as a
   * message, which `set_found` takes.
   *
   * @param {boolean} forward
   */
  on_navigate(forward) {
    if (this.bytes === null || this.regs === null || this.busy) return;
    const top = this.top_address();
    const from = forward ? top + this.bytes_per_line : top;
    if (from >= this.mem_size) return;
    simulator_controller.debug_find_data(from, forward, MEMORY_GAP);
  }

  /**
   * The answer of a search: the first address of the part, or null when no
   * part is on that side, which leaves the view where it is.
   *
   * @param {?number} address
   */
  set_found(address) {
    if (address === null || this.regs === null) return;
    this.pin(address);
  }

  /**
   * Put `address` in the field and go there, as if the reader had typed it.
   * The view is pinned: a step does not take it away from the part.
   *
   * @param {number} address
   */
  pin(address) {
    const text = hex(address);
    this.field.value = text;
    this.applied_text = text;
    this.field.classList.remove("is-invalid");
    this.field.title = MEMORY_FIELD_HINT;
    this.expression = parse_address_expression(text);
    this.go_to(address, "top");
  }

  /**
   * The value of an expression of the field, with the registers of the last
   * stop. Null when the expression names a register and no stop gave one.
   *
   * @param {{terms: Array<object>}} expression
   * @returns {?number}
   */
  evaluate(expression) {
    let total = 0;
    for (const term of expression.terms) {
      let value = term.value;
      if (term.register === "pc") {
        value = this.pc;
      } else if (term.register !== undefined) {
        if (this.regs === null) return null;
        value = this.regs[term.register];
      }
      total += term.sign * value;
    }
    return ((total % ADDRESS_SPACE) + ADDRESS_SPACE) % ADDRESS_SPACE;
  }

  /**
   * The title of the cell under the pointer: the address of its byte, and the
   * byte in the forms that the cell does not show.
   *
   * @param {MouseEvent} event
   */
  on_hover(event) {
    const cell = /** @type {HTMLElement} */ (event.target)
      .closest(".dbg-mem-byte, .dbg-mem-char");
    if (cell === null || this.bytes === null) return;
    const row = cell.closest(".dbg-mem-line");
    const address = Number(row.dataset.address) + Number(cell.dataset.offset);
    const at = address - this.base;
    if (at < 0 || at >= this.bytes.length) {
      cell.title = hex(address);
      return;
    }
    const value = this.bytes[at];
    const char = value >= 0x20 && value < 0x7f ? ` '${String.fromCharCode(value)}'` : "";
    const access = this.accessed(address);
    const note = access === null ? ""
      : `, ${access === "write" ? "written" : "read"} by the last instruction`;
    cell.title = `${hex(address)} = 0x${hex_byte(value)} = ${value}${char}${note}`;
  }
}


/**
 * Read an expression of the address field: terms with a sign between them,
 * where a term is a number or a register. A number with `0x` is hexadecimal
 * and a number without it is decimal, as in GDB; a register is a name of the
 * calling convention, an `x` name, `fp` or `pc`, with or without a `$`.
 *
 * @param {string} text
 * @returns {?{terms: Array<object>, follows: boolean}|{error: string}}
 *   null for an empty text, and an object with `error` for a text that is
 *   not an expression
 */
function parse_address_expression(text) {
  const source = text.trim().toLowerCase();
  if (source === "") return null;
  const terms = [];
  let follows = false;
  const pattern = /\s*([+-]?)\s*(0x[0-9a-f]+|[0-9]+|\$?[a-z][a-z0-9]*)\s*/y;
  let at = 0;
  while (at < source.length) {
    pattern.lastIndex = at;
    const match = pattern.exec(source);
    if (match === null || (at > 0 && match[1] === "")) {
      return {error: `"${text.trim()}" is not an address. Write a number such as 0x10000, or a register such as sp or sp-16.`};
    }
    at = pattern.lastIndex;
    const sign = match[1] === "-" ? -1 : 1;
    const word = match[2];
    if (word.startsWith("0x")) {
      terms.push({sign, value: parseInt(word, 16)});
    } else if (/^[0-9]/.test(word)) {
      terms.push({sign, value: parseInt(word, 10)});
    } else {
      const register = register_index(word.replace(/^\$/, ""));
      if (register === null) {
        return {error: `"${word}" is not a register. A hexadecimal number starts with 0x.`};
      }
      terms.push({sign, register});
      follows = true;
    }
  }
  return {terms, follows};
}


/**
 * The register that a name of an expression means: "pc" for the program
 * counter, or the index of an integer register.
 *
 * @param {string} name
 * @returns {?(number|string)}
 */
function register_index(name) {
  if (name === "pc") return "pc";
  if (name === "fp") return 8;
  const named = REGISTER_NAMES.indexOf(name);
  if (named >= 0) return named;
  const numbered = /^x([0-9]|[12][0-9]|3[01])$/.exec(name);
  return numbered ? Number(numbered[1]) : null;
}


/** The largest multiple of `MEMORY_ALIGN` that is not above `address`. */
function align_down(address) {
  return Math.floor(address / MEMORY_ALIGN) * MEMORY_ALIGN;
}


/** A byte, as two hexadecimal digits. */
function hex_byte(value) {
  return HEX_BYTES[value];
}


/**
 * An address of the dump: eight digits and no prefix, which keeps the column
 * narrow. The title of a cell writes the same address with the prefix.
 */
function hex_address(value) {
  return (value >>> 0).toString(16).padStart(8, "0");
}


/** The character of a byte, as the text column shows it. */
function printable(value) {
  return PRINTABLE_CHARS[value];
}


/**
 * The Debugger page: the source, register and memory views, the step and run
 * controls, and the session that they drive.
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
    this.registers = new RegisterView(document.getElementById("debug_register_view"));
    this.memory = new MemoryView(
      document.getElementById("debug_memory_view"),
      /** @type {HTMLInputElement} */ (document.getElementById("debug_memory_address")),
      /** @type {HTMLButtonElement} */ (document.getElementById("debug_memory_previous")),
      /** @type {HTMLButtonElement} */ (document.getElementById("debug_memory_next"))
    );
    this.step_button = /** @type {HTMLButtonElement} */ (document.getElementById("debug_step_button"));
    this.run_button = /** @type {HTMLButtonElement} */ (document.getElementById("debug_run_button"));
    this.stop_button = /** @type {HTMLButtonElement} */ (document.getElementById("debug_stop_button"));

    /** The state of the session, as the worker reports it. */
    this.state = NO_SESSION;
    /** True while a build or a start is in progress. */
    this.busy = false;
    /** The line table of the program that the session runs. */
    this.line_table = null;
    /** The program counter of the last stop. */
    this.pc = 0;
    /** True while a run of the session is in progress. */
    this.running = false;
    /** True between the start of a session and its first state message. */
    this.starting = false;
    /** True after the page spoke about a worker that reports no registers. */
    this.warned_stale_worker = false;
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
    if (data.type === "dbg_mem") {
      this.memory.set_window(data.mem, data.mem_size);
      return;
    }
    if (data.type === "dbg_found") {
      if (data.error) console.log("[debugger] the search of the memory failed:", data.error);
      this.memory.set_found(data.addr);
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
    this.registers.clear();
    this.memory.clear();
    this.draw_controls();
  }

  /**
   * One state message of the worker: where the program counter is, and what
   * the session is doing.
   */
  on_debug_state(state) {
    this.starting = false;
    if (state.error) {
      notify("error", "The debug session did not start", state.error);
    }
    if (this.resolve_ready) {
      this.resolve_ready(state.status !== NO_SESSION);
      this.resolve_ready = null;
    }
    this.state = state.status;
    this.pc = state.pc;
    // A step that stops for input leaves the session free, and a run that
    // waits for input keeps it. The worker knows which one it is, so the
    // buttons follow the flag and not the status.
    this.running = state.running;
    if (state.status !== "running") {
      this.source.set_current(this.position_of(state.pc));
      // A run reports between two chunks and carries no registers there. The
      // values of the last stop stay on screen until the run stops.
      this.registers.set_values(state.pc, state.regs);
      this.memory.set_stop(state.pc, state.regs, state.mem || null,
        state.mem_size || 0, state.access || null);
    }
    if (!("regs" in state)) this.warn_stale_worker();
    this.draw_controls();
  }

  /**
   * Say one time that the worker of the simulator reports no registers.
   *
   * The page and the worker are two files, and the service worker of the
   * application caches each one of them. A cache that holds only one of the
   * two gives a new page an older worker, and that worker sends a state with
   * no `regs` field. Every cell of the register view then keeps its dash,
   * which says nothing about the cause.
   *
   * A `regs` field that is null is not this case: a run reports between two
   * chunks and carries no registers there, by design.
   */
  warn_stale_worker() {
    if (this.warned_stale_worker) return;
    this.warned_stale_worker = true;
    console.log("[debugger] the worker sent a state with no registers");
    notify("error", "The registers have no value",
      "The browser is answering with an older copy of " +
      "modules/simulator_worker.js, which reports no registers. Reload the " +
      "page and take the update.");
  }

  /** The line of an address, from the line table of the build. */
  position_of(address) {
    if (!this.line_table) return null;
    return this.line_table.line_of(address);
  }

  /** The state of the buttons. */
  draw_controls() {
    const running = !!this.running;
    this.step_button.disabled = this.busy || running;
    this.run_button.disabled = this.busy || running;
    this.stop_button.disabled = this.busy || !running;
    this.memory.set_busy(this.busy || running);
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

  /**
   * Forget every breakpoint, of every file. The editor calls this when it
   * saves a file: the lines moved, so a breakpoint of before points at a line
   * that the user did not choose. The user sets the ones that are still
   * wanted again.
   */
  clear_breakpoints() {
    this.source.breakpoints.clear();
    this.source.draw_marks();
    this.on_breakpoint_change();
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
    this.registers.clear();
    this.memory.clear();
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
      // The worker keeps the request until the module is up, so the first
      // stop carries the bytes of the window.
      this.memory.prepare(first_address(program.line_table));
      return await this.wait_for_ready(ready);
    } catch (error) {
      console.log("[debugger] the session did not start:", error);
      notify("error", "The debug session did not start", String(error));
      return false;
    } finally {
      this.starting = false;
      this.busy = false;
      this.draw_controls();
    }
  }

  /**
   * Wait for the first state of a new session, and give up after
   * `START_TIMEOUT`. A session that says nothing is a session that the page
   * cannot drive, and a page that waits for it says "starting" for ever.
   *
   * @param {Promise<boolean>} ready
   * @returns {Promise<boolean>}
   */
  async wait_for_ready(ready) {
    let timer = 0;
    const limit = new Promise(resolve => {
      timer = setTimeout(() => resolve("timeout"), START_TIMEOUT);
    });
    const answer = await Promise.race([ready, limit]);
    clearTimeout(timer);
    if (answer !== "timeout") return answer;
    this.resolve_ready = null;
    console.log("[debugger] the simulator reported no state in", START_TIMEOUT, "ms");
    notify("error", "The debug session did not start",
      "The simulator did not report its state. Reload the page with the cache " +
      "off: the browser may still answer with an older copy of the simulator.");
    return false;
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
    // The terminal does not open for a build of the debugger, so the page
    // keeps what the tools wrote and puts it in the message of a failure.
    const errors = [];
    const stdio = new BroadcastChannel("stdio_channel" + window.uniq_id);
    stdio.onmessage = function (event) {
      if (event.data.origin === "clang" && event.data.fh === 2) {
        errors.push(String(event.data.data).trim());
      }
    };
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
        const result = await with_timeout(
          compiler.as([input.name, "-o", object]), BUILD_TIMEOUT,
          `the assembler, for ${input.name}`);
        if (!result) {
          notify("error", "The program did not assemble", await reason(errors));
          return null;
        }
        objects.push(object);
      }
      const elf = await with_timeout(
        compiler.ld([objects, "-o", DEBUG_PROGRAM].flat(), false), BUILD_TIMEOUT,
        "the linker");
      if (!elf) {
        notify("error", "The program did not link", await reason(errors));
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
      stdio.close();
      compiler.set_file_array(saved);
      compiler.quiet = false;
    }
  }
}


/**
 * The address of the first instruction of the program, or null for a program
 * with no line table. The entries of the table are in the order of their
 * addresses, and an end-of-sequence entry is the address after the last
 * instruction and not an instruction.
 */
function first_address(line_table) {
  const entry = line_table.entries.find(row => !row.end);
  return entry ? entry.address : null;
}


/** The lines of each file that have an address. */
function runnable_lines(line_table) {
  const runnable = new Map();
  for (const [file, lines] of line_table.line_to_address) {
    runnable.set(file, new Set(lines.keys()));
  }
  return runnable;
}


/**
 * Why a build step failed, from what the tool wrote.
 *
 * A message of a tool crosses a BroadcastChannel, which delivers it in a later
 * task than the one that saw the failure. The wait is for those messages.
 *
 * @param {string[]} lines the lines that the build collected
 * @returns {Promise<string>}
 */
async function reason(lines) {
  await new Promise(resolve => setTimeout(resolve, 150));
  const text = lines.filter(line => line !== "").slice(-3).join("\n");
  return text || "The terminal holds the message of the tool.";
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
