/*jshint esversion: 9 */

import {simulator_controller} from "./simulator.js";

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
 * The assembly file of the program, with one line for each line of the file.
 *
 * The view holds a `div` for each line, and not one block of text, because the
 * next phase puts a breakpoint control and the program counter marker in the
 * gutter of a line.
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
    this.picker.onchange = function () {
      this.selected_name = this.picker.value;
      this.refresh();
    }.bind(this);
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
      // The file is user input. Only `textContent` keeps it text.
      code.textContent = lines[index];
      row.appendChild(gutter);
      row.appendChild(code);
      rows.appendChild(row);
    }
    this.container.textContent = "";
    this.container.classList.remove("text-muted");
    this.container.appendChild(rows);
    this.container.scrollTop = 0;
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
    if (file === this.rendered_file) return;
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
 * The Debugger page. It holds the source view now. The register view and the
 * memory view come in the next phases.
 */
class DebuggerPage {
  constructor() {
    this.source = new SourceView(
      document.getElementById("debug_source_view"),
      /** @type {HTMLSelectElement} */ (document.getElementById("debug_source_file"))
    );
    this.status_ch = new BroadcastChannel("simulator_status" + window.uniq_id);
    this.status_ch.onmessage = function (event) {
      // The toolbar stays on screen with the page open, so a file that the
      // user loads there must reach the view without a second visit.
      if (event.data.type === "load_file") this.source.refresh();
    }.bind(this);
    this.source.refresh();
  }

  /** The page became visible. */
  open() {
    this.source.refresh();
  }
}

export const debugger_page = new DebuggerPage();
