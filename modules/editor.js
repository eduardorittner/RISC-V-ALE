/*jshint esversion: 9 */

import {simulator_controller} from "./simulator.js";
import {compiler} from "./compiler.js";
import {debugger_page} from "./debugger.js";
import {new_asm_state, highlight_asm_line} from "./asm_highlight.js";

/**
 * The Editor page: a text editor for the programs of the simulator.
 *
 * The editor is a `textarea` with transparent text, on top of a `pre` that
 * shows the same text with colours. The browser gives the `textarea` the
 * caret, the selection, the undo stack, the clipboard and the input of a
 * phone. The page only keeps the two layers aligned and draws the colours
 * again after each change.
 *
 * The files of the editor are the loaded files of the simulator, the same set
 * that the Load File button fills. A save puts the text in that set, so the
 * RUN button and the Debugger see it, and it also gives the file to the
 * browser as a download, because a page cannot write to the disk.
 */

/** The extension of an assembly file, when the settings page gives no other one. */
const DEFAULT_SOURCE_EXTENSION = ".s";

/**
 * The extensions of the other files that the editor can show. The loaded set
 * also holds the object and ELF files of a build, and those are not text.
 */
const TEXT_EXTENSIONS = [".c", ".h", ".x", ".ld", ".txt"];

/** The name of a new file, before the user gives it one. */
const NEW_FILE_STEM = "program";

/** The value of the picker entry that stands for a new file. */
const NEW_FILE = "";

/** The note of the status line after a save, until the next change. */
const SAVED_NOTE = "saved; the breakpoints of the debugger are cleared";

class EditorPage {
  constructor() {
    this.tab = document.getElementById("editor_tab");
    this.input = /** @type {HTMLTextAreaElement} */ (document.getElementById("editor_input"));
    this.layer = document.getElementById("editor_highlight");
    this.gutter = document.getElementById("editor_gutter");
    this.picker = /** @type {HTMLSelectElement} */ (document.getElementById("editor_file"));
    this.name_field = /** @type {HTMLInputElement} */ (document.getElementById("editor_name"));
    this.status = document.getElementById("editor_status");
    this.file_input = /** @type {HTMLInputElement} */ (document.getElementById("editor_file_input"));

    /**
     * The loaded file that the text came from, or null for a new file. A
     * save under another name takes the place of this file.
     * @type {?File}
     */
    this.origin = null;
    /** True after a change that no save took yet. */
    this.dirty = false;
    /** The note after the line count of the status line. */
    this.note = "";
    /** The number of lines in the gutter, to draw it again only on a change. */
    this.gutter_lines = 0;
    /** The names in the picker, to not build it again for the same set. */
    this.picker_names = null;
    /** The number of the newest load, which ends the older ones. */
    this.load_count = 0;
    /** The frame that draws the colours, or 0 when none is due. */
    this.render_frame = 0;
    /** True after Escape: the next Tab moves the focus and inserts nothing. */
    this.tab_leaves = false;

    this.input.addEventListener("input", () => this.on_input());
    this.input.addEventListener("scroll", () => this.sync_scroll());
    this.input.addEventListener("keydown", (event) => this.on_key(event));
    this.input.addEventListener("focus", () => { this.tab_leaves = false; });
    this.name_field.addEventListener("input", () => this.render());
    this.tab.addEventListener("keydown", (event) => this.on_tab_key(event));
    this.picker.onchange = () => this.on_pick();
    document.getElementById("editor_new_button").onclick = () => this.on_new();
    document.getElementById("editor_open_button").onclick = () => this.file_input.click();
    document.getElementById("editor_save_button").onclick = () => this.save();
    this.file_input.onchange = () => this.on_file_chosen();
    window.addEventListener("beforeunload", (event) => {
      if (!this.dirty) return;
      event.preventDefault();
      event.returnValue = "";
    });

    // The loaded set changes from the Load File button and from the home
    // page. The simulator says so on this channel.
    this.status_ch = new BroadcastChannel("simulator_status" + window.uniq_id);
    this.status_ch.onmessage = (event) => {
      if (event.data.type === "load_file") this.refresh();
    };

    this.load_buffer(null, "");
  }

  /** The page became visible. */
  open() {
    this.refresh();
    this.input.focus({preventScroll: true});
  }

  /* ─── The loaded set ─────────────────────────────────────────────────── */

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
   * True for the name of a file that the highlighter reads. A name with no
   * extension is a new file that the user did not name yet, and the editor
   * is for assembly first.
   *
   * @param {string} name
   * @returns {boolean}
   */
  is_assembly(name) {
    const lower = name.trim().toLowerCase();
    return lower.endsWith(this.source_extension()) || !lower.includes(".");
  }

  /**
   * The loaded files that the editor can show.
   *
   * @returns {File[]}
   */
  editable_files() {
    const extensions = [this.source_extension(), ...TEXT_EXTENSIONS];
    return simulator_controller.last_loaded_files.filter(file => {
      const name = file.name.toLowerCase();
      return extensions.some(extension => name.endsWith(extension));
    });
  }

  /**
   * A name for a new file that no loaded file has.
   *
   * @returns {string}
   */
  free_name() {
    const extension = this.source_extension();
    const taken = new Set(simulator_controller.last_loaded_files.map(file => file.name));
    let name = NEW_FILE_STEM + extension;
    for (let n = 2; taken.has(name); n++) name = NEW_FILE_STEM + n + extension;
    return name;
  }

  /**
   * Put `file` in the loaded set, in the place of the file of the same name.
   *
   * When `old_name` names another file, that file and the outputs of its
   * build leave the set. A save under a new name is a rename: the file of
   * before would otherwise stay in the build, and the linker would see each
   * symbol twice.
   *
   * @param {File} file
   * @param {?string} old_name
   */
  put_in_loaded_set(file, old_name) {
    const files = simulator_controller.last_loaded_files;
    if (old_name && old_name !== file.name) {
      const stem = stem_of(old_name);
      for (let index = files.length - 1; index >= 0; index--) {
        if (stem_of(files[index].name) === stem) files.splice(index, 1);
      }
    }
    simulator_controller.load_new_file(file);
    compiler.set_file_array(simulator_controller.last_loaded_files);
  }

  /**
   * Tell the page that a file of the loaded set changed. The debugger ends
   * the session of the program before, and the top bar shows the name.
   *
   * @param {File} file
   */
  announce(file) {
    this.status_ch.postMessage({type: "load_file", name: file.name, size: file.size});
  }

  /**
   * Read the loaded set again, and keep the editor on the file it shows.
   *
   * The text in the editor is never lost here: a file that changed under a
   * dirty editor stays as the user typed it, and a file that left the set
   * becomes a new file with the same name.
   */
  refresh() {
    const files = this.editable_files();
    this.update_picker(files);
    if (this.origin === null) {
      // A new file that the user did not touch yet shows the first loaded
      // file, which saves the pick after a load.
      if (!this.dirty && this.input.value === "" && files.length) {
        this.load_buffer(files[0]);
        return;
      }
      this.draw_status();
      return;
    }
    const current = files.find(file => file.name === this.origin.name);
    if (current === this.origin) {
      this.draw_status();
      return;
    }
    if (current) {
      // A new version of the file. The text of the editor is the newer one
      // only when the user changed it.
      if (this.dirty) {
        this.origin = current;
        this.draw_status();
      } else {
        this.load_buffer(current);
      }
      return;
    }
    if (!this.dirty && files.length) {
      this.load_buffer(files[0]);
      return;
    }
    this.origin = null;
    this.draw_status();
  }

  /**
   * Put the names of `files` in the picker, after the entry of a new file.
   *
   * @param {File[]} files
   */
  update_picker(files) {
    const names = files.map(file => file.name);
    const key = names.join("\n");
    if (key === this.picker_names) return;
    this.picker_names = key;
    this.picker.textContent = "";
    const fresh = document.createElement("option");
    fresh.value = NEW_FILE;
    fresh.textContent = "new file";
    this.picker.appendChild(fresh);
    for (const name of names) {
      const option = document.createElement("option");
      option.value = name;
      option.textContent = name;
      this.picker.appendChild(option);
    }
  }

  /* ─── The text ───────────────────────────────────────────────────────── */

  /**
   * Put a file in the editor.
   *
   * @param {?File} file the loaded file, or null for a new file
   * @param {string} [text] the text, for a new file
   */
  async load_buffer(file, text) {
    const load_id = ++this.load_count;
    let content = text || "";
    if (file) {
      try {
        content = await file.text();
      } catch (error) {
        if (load_id !== this.load_count) return;
        notify("error", "File not read", `${file.name} could not be read: ${error.message}`);
        return;
      }
      if (load_id !== this.load_count) return;
    }
    this.origin = file;
    this.dirty = false;
    this.note = "";
    this.name_field.value = file ? file.name : this.free_name();
    this.input.value = content;
    this.input.scrollTop = 0;
    this.input.scrollLeft = 0;
    this.render();
    this.draw_status();
  }

  /** The text changed. */
  on_input() {
    this.dirty = true;
    this.note = "";
    this.draw_status();
    // Several changes in one frame draw one time. A frame is also the first
    // moment that the user can see.
    if (this.render_frame) return;
    this.render_frame = requestAnimationFrame(() => {
      this.render_frame = 0;
      this.render();
    });
  }

  /**
   * Draw the text of the `textarea` in the layer under it, with colours.
   *
   * The layer holds the same characters as the `textarea`, with the same line
   * breaks, so the two keep the same shape. The highlighter makes DOM nodes
   * and sets `textContent` on each one, so the text stays text.
   */
  render() {
    if (this.render_frame) {
      cancelAnimationFrame(this.render_frame);
      this.render_frame = 0;
    }
    const lines = this.input.value.split("\n");
    const assembly = this.is_assembly(this.name_field.value);
    const state = new_asm_state();
    const nodes = document.createDocumentFragment();
    for (let index = 0; index < lines.length; index++) {
      if (index > 0) nodes.appendChild(document.createTextNode("\n"));
      if (assembly) highlight_asm_line(nodes, lines[index], state);
      else if (lines[index] !== "") nodes.appendChild(document.createTextNode(lines[index]));
    }
    // A `pre` draws no line for the empty line after a last line break, but
    // the `textarea` does. One space gives that line its height.
    if (lines[lines.length - 1] === "") nodes.appendChild(document.createTextNode(" "));
    this.layer.textContent = "";
    this.layer.appendChild(nodes);
    this.draw_gutter(lines.length);
    this.sync_scroll();
  }

  /**
   * One number for each line.
   *
   * @param {number} count
   */
  draw_gutter(count) {
    if (count === this.gutter_lines) return;
    this.gutter_lines = count;
    this.gutter.style.setProperty("--ed-gutter-digits", String(Math.max(2, String(count).length)));
    const rows = document.createDocumentFragment();
    for (let number = 1; number <= count; number++) {
      const row = document.createElement("div");
      row.textContent = String(number);
      rows.appendChild(row);
    }
    this.gutter.textContent = "";
    this.gutter.appendChild(rows);
  }

  /**
   * Move the layer and the gutter with the `textarea`. A transform and not a
   * scroll position: the `textarea` scrolls further than the layer by the
   * height of its scroll bar, and a scroll position stops at the end.
   */
  sync_scroll() {
    const top = this.input.scrollTop;
    const left = this.input.scrollLeft;
    this.layer.style.transform = `translate(${-left}px, ${-top}px)`;
    this.gutter.style.transform = `translateY(${-top}px)`;
  }

  /**
   * The keys that a `textarea` does not know: Tab puts a tab in the text,
   * and Enter keeps the indentation of the line.
   *
   * @param {KeyboardEvent} event
   */
  on_key(event) {
    if (event.key === "Escape") {
      // The way out for the keyboard: Escape and then Tab leave the editor.
      this.tab_leaves = true;
      return;
    }
    if (event.key === "Tab") {
      if (this.tab_leaves || event.shiftKey || event.ctrlKey || event.metaKey || event.altKey) {
        this.tab_leaves = false;
        return;
      }
      event.preventDefault();
      this.insert("\t");
      return;
    }
    this.tab_leaves = false;
    if (event.key !== "Enter" || event.ctrlKey || event.metaKey || event.altKey || event.isComposing) return;
    const text = this.input.value;
    const start = this.input.selectionStart;
    const line_start = text.lastIndexOf("\n", start - 1) + 1;
    const indent = /^[ \t]*/.exec(text.slice(line_start, start))[0];
    if (indent === "") return;
    event.preventDefault();
    this.insert("\n" + indent);
  }

  /**
   * Put `text` at the caret, in the place of the selection.
   *
   * `execCommand` is old, but it is the one way that keeps the change in the
   * undo stack of the browser. `setRangeText` is for a browser that refuses
   * it, and it sends no `input` event of its own.
   *
   * @param {string} text
   */
  insert(text) {
    let done = false;
    try {
      done = document.execCommand("insertText", false, text);
    } catch (error) {
      done = false;
    }
    if (done) return;
    this.input.setRangeText(text, this.input.selectionStart, this.input.selectionEnd, "end");
    this.on_input();
  }

  /**
   * Control+S or Command+S anywhere on the page saves.
   *
   * @param {KeyboardEvent} event
   */
  on_tab_key(event) {
    if (!(event.ctrlKey || event.metaKey) || event.altKey) return;
    if (event.key.toLowerCase() !== "s") return;
    event.preventDefault();
    this.save();
  }

  /** The status line, and the entry of the picker. */
  draw_status() {
    this.picker.value = this.origin ? this.origin.name : NEW_FILE;
    const count = this.gutter_lines;
    let text = `${count} line${count === 1 ? "" : "s"}`;
    if (this.dirty) text += "; unsaved changes";
    else if (this.note) text += "; " + this.note;
    this.status.textContent = text;
  }

  /* ─── The buttons ────────────────────────────────────────────────────── */

  /**
   * True when the text can go, because it is saved or because the user says
   * so.
   *
   * @returns {boolean}
   */
  confirm_discard() {
    if (!this.dirty) return true;
    return window.confirm("The editor has changes that are not saved. Discard them?");
  }

  /** The user picked a file in the picker. */
  on_pick() {
    const name = this.picker.value;
    if (name === (this.origin ? this.origin.name : NEW_FILE)) return;
    if (!this.confirm_discard()) {
      this.draw_status();
      return;
    }
    if (name === NEW_FILE) {
      this.load_buffer(null, "");
      return;
    }
    const file = this.editable_files().find(candidate => candidate.name === name);
    if (file) this.load_buffer(file);
    else this.refresh();
  }

  on_new() {
    if (!this.confirm_discard()) return;
    this.load_buffer(null, "");
    this.input.focus();
  }

  /**
   * The user chose a file of the disk. The file joins the loaded set, as with
   * the Load File button, so the RUN button and the Debugger see it with no
   * save.
   */
  async on_file_chosen() {
    const file = this.file_input.files[0];
    // The same file a second time must also send a `change` event.
    this.file_input.value = "";
    if (!file) return;
    if (!this.confirm_discard()) return;
    this.put_in_loaded_set(file, null);
    this.announce(file);
    await this.load_buffer(file);
    this.refresh();
  }

  /**
   * Save the text: into the loaded set under the name of the name field, and
   * to the disk as a download.
   *
   * The lines of the file moved, so a breakpoint of before points at a line
   * that the user did not choose. The debugger forgets every breakpoint, of
   * every file, and the user sets the ones that are still wanted again.
   */
  save() {
    const name = this.name_field.value.trim();
    if (!valid_name(name)) {
      notify("error", "No file name", "Give the file a name, with no slash in it.");
      this.name_field.focus();
      return;
    }
    const old_name = this.origin ? this.origin.name : null;
    if (old_name !== name && simulator_controller.last_loaded_files.some(file => file.name === name)) {
      if (!window.confirm(`${name} is loaded already. Replace it with this file?`)) return;
    }
    const text = this.input.value;
    const file = new File([text], name, {type: "text/plain"});
    this.put_in_loaded_set(file, old_name);
    debugger_page.clear_breakpoints();
    this.announce(file);
    download(name, text);
    this.origin = file;
    this.dirty = false;
    this.note = SAVED_NOTE;
    this.refresh();
  }
}


/**
 * The name without its extension. The compiler names the object file of a
 * source after it, so the two share the stem.
 *
 * @param {string} name
 * @returns {string}
 */
function stem_of(name) {
  const dot = name.lastIndexOf(".");
  return dot > 0 ? name.slice(0, dot) : name;
}


/**
 * True for a name that can be a file in the file system of the simulator.
 *
 * @param {string} name
 * @returns {boolean}
 */
function valid_name(name) {
  if (name === "" || name === "." || name === "..") return false;
  return !/[\/\\\0]/.test(name);
}


/**
 * Give `text` to the browser as a file to download.
 *
 * @param {string} filename
 * @param {string} text
 */
function download(filename, text) {
  const url = URL.createObjectURL(new Blob([text], {type: "text/plain"}));
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
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

export const editor_page = new EditorPage();
