// modules/debugger.js
import { simulator_controller } from "./simulator.js";

export class VisualDebuggerUI {
  constructor(controller) {
    this.controller = controller || simulator_controller;
    this.previousRegisters = new Array(32).fill(0);
    this.previousFRegisters = new Array(32).fill(0);
    this.currentPC = 0x0;
    this.breakpoints = new Set();
    this.registerFormat = "hex";
    this.lastSnapshot = null;
    this.disasmData = [];
    this.currentMemAddr = 0x80000000;

    this.initDOMReferences();
    this.bindEvents();
    this.bindKeyboardShortcuts();
    this.wireControllerCallbacks();
    this.initPanelResizers();
  }

  initDOMReferences() {
    this.debugTab = document.getElementById("debug_tab");
    this.btnStepInto = document.getElementById("btn_debug_step_into");
    this.btnStepOver = document.getElementById("btn_debug_step_over");
    this.btnStepOut = document.getElementById("btn_debug_step_out");
    this.btnContinue = document.getElementById("btn_debug_continue");
    this.btnPause = document.getElementById("btn_debug_pause");
    this.btnReset = document.getElementById("btn_debug_reset");
    this.stateBadge = document.getElementById("debug_state_badge");
    this.disasmBody = document.getElementById("debug_disasm_body");
    this.gprContainer = document.getElementById("gpr_grid_container");
    this.fprContainer = document.getElementById("fpr_grid_container");
    this.csrContainer = document.getElementById("csr_grid_container");
    this.hexBody = document.getElementById("debug_hex_body") || document.getElementById("debug_hex_editor");
    this.stackBody = document.getElementById("debug_stack_body");
    this.spValDisplay = document.getElementById("debug_sp_val");
    this.pcDisplay = document.getElementById("debug_pc_display");
    this.cycleCounter = document.getElementById("debug_cycle_counter");
    this.regFormatSelect = document.getElementById("debug_reg_format_select");
    this.memJumpInput = document.getElementById("debug_mem_jump_input");
    this.btnMemJump = document.getElementById("btn_debug_mem_jump");
  }

  wireControllerCallbacks() {
    this.controller.onDebugState = (snapshot) => {
      this.updateState(snapshot);
    };

    this.controller.onDebugMemData = (addr, bytes) => {
      this.renderHexEditor(addr, bytes);
    };

    this.controller.onDebugDisasmData = (items) => {
      this.renderDisassembly(items);
    };

    this.controller.onDebugBpUpdated = (addr, active) => {
      if (active) this.breakpoints.add(addr);
      else this.breakpoints.delete(addr);
      this.updateBreakpointIcons();
    };
  }

  bindEvents() {
    if (this.btnStepInto) this.btnStepInto.onclick = () => this.controller.debugStep();
    if (this.btnStepOver) this.btnStepOver.onclick = () => this.controller.debugStepOver();
    if (this.btnStepOut) this.btnStepOut.onclick = () => this.controller.debugStepOut();
    if (this.btnContinue) this.btnContinue.onclick = () => {
      this.setStateBadge("RUNNING", "badge-success");
      this.controller.debugContinue();
    };
    if (this.btnPause) this.btnPause.onclick = () => {
      this.setStateBadge("PAUSED", "badge-warning");
      this.controller.debugPause();
    };
    if (this.btnReset) this.btnReset.onclick = () => this.resetDebugger();

    if (this.regFormatSelect) {
      this.regFormatSelect.onchange = (e) => {
        this.registerFormat = e.target.value;
        if (this.lastSnapshot) {
          this.renderRegisters(this.lastSnapshot.gpr);
        }
      };
    }

    if (this.btnMemJump && this.memJumpInput) {
      this.btnMemJump.onclick = () => this.jumpToMemory();
      this.memJumpInput.onkeyup = (e) => {
        if (e.key === "Enter") this.jumpToMemory();
      };
    }
  }

  bindKeyboardShortcuts() {
    window.addEventListener("keydown", (e) => {
      if (!this.debugTab || this.debugTab.hidden || this.debugTab.style.display === "none") return;

      if (e.key === "F11") {
        e.preventDefault();
        if (e.shiftKey) this.controller.debugStepOut();
        else this.controller.debugStep();
      } else if (e.key === "F10") {
        e.preventDefault();
        this.controller.debugStepOver();
      } else if (e.key === "F5") {
        e.preventDefault();
        this.setStateBadge("RUNNING", "badge-success");
        this.controller.debugContinue();
      } else if (e.key === "F6") {
        e.preventDefault();
        this.setStateBadge("PAUSED", "badge-warning");
        this.controller.debugPause();
      } else if (e.ctrlKey && e.key.toLowerCase() === "r") {
        e.preventDefault();
        this.resetDebugger();
      }
    });
  }

  setStateBadge(text, bgClass) {
    if (!this.stateBadge) return;
    this.stateBadge.innerText = text;
    this.stateBadge.className = `badge ${bgClass} p-2 mr-2`;
  }

  resetDebugger() {
    this.previousRegisters.fill(0);
    this.previousFRegisters.fill(0);
    this.setStateBadge("PAUSED", "badge-dark");
    this.controller.stop_execution();
    if (this.pcDisplay) this.pcDisplay.innerText = "0x00000000";
    if (this.cycleCounter) this.cycleCounter.innerText = "0";
  }

  updateState(snapshot) {
    if (!snapshot) return;
    this.lastSnapshot = snapshot;
    this.currentPC = snapshot.pc;

    if (snapshot.is_halted) {
      this.setStateBadge("HALTED", "badge-danger");
    } else if (snapshot.is_breakpoint) {
      this.setStateBadge("BREAKPOINT", "badge-info");
    } else {
      this.setStateBadge("PAUSED", "badge-warning");
    }

    if (this.pcDisplay) this.pcDisplay.innerText = "0x" + (snapshot.pc >>> 0).toString(16).padStart(8, "0");
    if (this.cycleCounter) this.cycleCounter.innerText = (snapshot.step_count || 0).toLocaleString();

    this.renderRegisters(snapshot.gpr);
    this.renderFPRRegisters(snapshot.fpr);
    this.renderCSRRegisters(snapshot.csrs);

    // Fetch disassembly around current PC
    const startAddr = Math.max(0, snapshot.pc - 32) & ~1;
    this.controller.debugFetchDisassembly(startAddr, 128);

    // Fetch memory around SP (x2)
    const sp = snapshot.gpr ? snapshot.gpr[2] : 0x7FFFFFC;
    if (this.spValDisplay) this.spValDisplay.innerText = "0x" + (sp >>> 0).toString(16).padStart(8, "0");
    this.renderStack(sp);

    // Fetch memory slice for memory inspector
    this.controller.debugFetchMemory(this.currentMemAddr, 128);
  }

  renderDisassembly(items) {
    if (!this.disasmBody || !Array.isArray(items)) return;
    this.disasmData = items;

    let html = "";
    let activeSymbol = null;

    items.forEach((item) => {
      const isPC = item.address === this.currentPC;
      const isBp = this.breakpoints.has(item.address);
      const pcClass = isPC ? "pc-line" : "";
      const bpClass = isBp ? "active-bp" : "";

      if (item.label) {
        html += `
          <div class="editor-label-line">
            <div class="editor-gutter"></div>
            <div class="editor-content">&lt;${escapeHtml(item.label)}&gt;:</div>
          </div>
        `;
      }

      if (isPC) {
        if (item.label) {
          activeSymbol = `<${item.label}>`;
        }
      }

      const highlightedAsm = highlightAsm(item.asm_text);
      const addrHex = "0x" + (item.address >>> 0).toString(16).padStart(8, "0");

      html += `
        <div class="editor-line ${pcClass}" data-addr="${item.address.toString(16)}">
          <div class="editor-gutter">
            <span class="gutter-bp ${bpClass}" data-bp-addr="${item.address}" title="Toggle Breakpoint">●</span>
            <span class="gutter-pc">➔</span>
            <span class="gutter-addr">${addrHex}</span>
          </div>
          <div class="editor-content"><span class="asm-opcode">${item.opcode_hex}</span>${highlightedAsm}</div>
        </div>
      `;
    });

    this.disasmBody.innerHTML = html;

    if (!activeSymbol) {
      for (let i = 0; i < items.length; i++) {
        if (items[i].address <= this.currentPC && items[i].label) {
          const offset = this.currentPC - items[i].address;
          activeSymbol = offset === 0 ? `<${items[i].label}>` : `<${items[i].label} + 0x${offset.toString(16)}>`;
        }
      }
    }

    const currentSymbolEl = document.getElementById("debug_current_symbol");
    if (currentSymbolEl && activeSymbol) {
      currentSymbolEl.innerText = activeSymbol;
    }

    // Attach click listener for breakpoint toggles
    this.disasmBody.querySelectorAll(".gutter-bp").forEach((cell) => {
      cell.onclick = (e) => {
        const addr = parseInt(e.target.getAttribute("data-bp-addr"), 10);
        const isActive = this.breakpoints.has(addr);
        this.controller.debugToggleBreakpoint(addr, !isActive);
      };
    });

    this.highlightActiveDisassembly(this.currentPC);
  }

  highlightActiveDisassembly(pc) {
    if (!this.disasmBody) return;
    const rows = this.disasmBody.querySelectorAll(".editor-line");
    rows.forEach((row) => {
      const addr = parseInt(row.getAttribute("data-addr"), 16);
      if (addr === pc) {
        row.classList.add("pc-line");
        row.scrollIntoView({ behavior: "smooth", block: "center" });
      } else {
        row.classList.remove("pc-line");
      }
    });
  }

  updateBreakpointIcons() {
    if (!this.disasmBody) return;
    this.disasmBody.querySelectorAll(".gutter-bp").forEach((cell) => {
      const addr = parseInt(cell.getAttribute("data-bp-addr"), 10);
      if (this.breakpoints.has(addr)) {
        cell.classList.add("active-bp");
      } else {
        cell.classList.remove("active-bp");
      }
    });
  }

  renderRegisters(gpr) {
    if (!gpr || !this.gprContainer) return;
    const regNames = [
      "zero", "ra", "sp", "gp", "tp", "t0", "t1", "t2",
      "s0/fp", "s1", "a0", "a1", "a2", "a3", "a4", "a5",
      "a6", "a7", "s2", "s3", "s4", "s5", "s6", "s7",
      "s8", "s9", "s10", "s11", "t3", "t4", "t5", "t6"
    ];

    let html = "";
    for (let i = 0; i < 32; i++) {
      const val = gpr[i] >>> 0;
      const changed = this.previousRegisters[i] !== val;
      const valStr = this.formatRegValue(val);
      const changedClass = changed ? "reg-changed" : "";

      html += `
        <div class="col-6 col-md-3 p-1">
          <div class="reg-cell ${changedClass}" data-reg="${i}" title="Double-click to edit x${i}">
            <span class="text-primary font-weight-bold">x${i}</span> <small class="text-muted">(${regNames[i]})</small>:
            <span class="reg-val">${valStr}</span>
          </div>
        </div>
      `;
    }

    this.gprContainer.innerHTML = html;

    // Attach double click handler for editing registers
    this.gprContainer.querySelectorAll(".reg-cell").forEach((cell) => {
      cell.ondblclick = () => {
        const regIdx = parseInt(cell.getAttribute("data-reg"), 10);
        const newVal = prompt(`Enter new value for register x${regIdx}:`, "0x" + (gpr[regIdx] >>> 0).toString(16));
        if (newVal !== null) {
          const parsed = parseInt(newVal, 16) || parseInt(newVal, 10) || 0;
          this.controller.debugPokeRegister(regIdx, parsed);
        }
      };
    });

    this.previousRegisters = gpr.map(v => v >>> 0);
  }

  renderFPRRegisters(fpr) {
    if (!fpr || !this.fprContainer) return;
    let html = "";
    for (let i = 0; i < 32; i++) {
      const val = fpr[i];
      const changed = this.previousFRegisters[i] !== val;
      const changedClass = changed ? "reg-changed" : "";
      html += `
        <div class="col-6 col-md-3 p-1">
          <div class="reg-cell ${changedClass}">
            <span class="text-info font-weight-bold">f${i}</span>:
            <span class="reg-val">${val.toFixed(4)}</span>
          </div>
        </div>
      `;
    }
    this.fprContainer.innerHTML = html;
    this.previousFRegisters = [...fpr];
  }

  renderCSRRegisters(csrs) {
    if (!csrs || !this.csrContainer) return;
    const csrNames = ["mstatus", "mcause", "mepc", "mtvec", "fcsr"];
    let html = "";
    csrs.forEach((val, i) => {
      const valHex = "0x" + (val >>> 0).toString(16).padStart(8, "0");
      html += `
        <div class="col-6 col-md-4 p-1">
          <div class="reg-cell">
            <span class="text-danger font-weight-bold">${csrNames[i] || 'csr'}</span>:
            <span class="reg-val">${valHex}</span>
          </div>
        </div>
      `;
    });
    this.csrContainer.innerHTML = html;
  }

  formatRegValue(val) {
    switch (this.registerFormat) {
      case "sdec": return (val | 0).toString(10);
      case "udec": return (val >>> 0).toString(10);
      case "ascii": return val >= 32 && val <= 126 ? `'${String.fromCharCode(val)}'` : "\\0";
      case "hex":
      default:
        return "0x" + (val >>> 0).toString(16).padStart(8, "0");
    }
  }

  jumpToMemory() {
    if (!this.memJumpInput) return;
    let input = this.memJumpInput.value.trim();
    let addr = 0x80000000;
    if (input.startsWith("0x") || input.startsWith("0X")) {
      addr = parseInt(input, 16);
    } else {
      addr = parseInt(input, 10) || 0x80000000;
    }
    this.currentMemAddr = addr >>> 0;
    this.controller.debugFetchMemory(this.currentMemAddr, 128);
  }

  renderHexEditor(baseAddr, bytes) {
    if (!this.hexBody || !bytes) return;
    let html = "";

    for (let i = 0; i < bytes.length; i += 16) {
      const rowAddr = (baseAddr + i) >>> 0;
      const rowBytes = bytes.slice(i, i + 16);
      const addrStr = "0x" + rowAddr.toString(16).padStart(8, "0");

      let hexGroup1 = "";
      let hexGroup2 = "";
      let asciiStr = "";

      for (let j = 0; j < 16; j++) {
        if (j < rowBytes.length) {
          const b = rowBytes[j];
          const hex = b.toString(16).padStart(2, "0").toUpperCase();
          const zeroClass = b === 0 ? "zero-byte" : "";
          const byteHtml = `<span class="hex-byte ${zeroClass}" data-addr="${rowAddr + j}" title="Double-click to edit byte at 0x${(rowAddr + j).toString(16)}">${hex}</span>`;

          if (j < 8) {
            hexGroup1 += byteHtml + " ";
          } else {
            hexGroup2 += byteHtml + " ";
          }

          if (b >= 32 && b <= 126) {
            asciiStr += escapeHtml(String.fromCharCode(b));
          } else {
            asciiStr += `<span class="ascii-nonprint">.</span>`;
          }
        } else {
          if (j < 8) {
            hexGroup1 += "   ";
          } else {
            hexGroup2 += "   ";
          }
          asciiStr += " ";
        }
      }

      html += `
        <tr>
          <td class="mem-col-addr">${addrStr}</td>
          <td class="mem-col-hex">
            <span class="hex-group">${hexGroup1}</span>
            <span class="hex-group">${hexGroup2}</span>
          </td>
          <td class="mem-col-ascii">
            <span class="ascii-sidecar">|${asciiStr}|</span>
          </td>
        </tr>
      `;
    }

    this.hexBody.innerHTML = html;

    // Attach dblclick event handler to hex-byte elements for inline RAM editing
    this.hexBody.querySelectorAll(".hex-byte").forEach((elem) => {
      elem.ondblclick = () => {
        const addr = parseInt(elem.getAttribute("data-addr"), 10);
        const currentHex = elem.innerText.trim();
        const newVal = prompt(`Edit RAM byte at 0x${addr.toString(16)}:`, "0x" + currentHex);
        if (newVal !== null) {
          const parsed = parseInt(newVal, 16) || parseInt(newVal, 10) || 0;
          this.controller.debugPokeMemory(addr, parsed & 0xff);
        }
      };
    });
  }

  renderStack(sp) {
    if (!this.stackBody) return;
    let html = "";
    const baseSp = (sp >>> 0);

    for (let offset = 0; offset <= 32; offset += 4) {
      const addr = (baseSp + offset) >>> 0;
      const isSpRow = offset === 0;
      const rowClass = isSpRow ? "sp-row font-weight-bold" : "";
      const offsetLabel = isSpRow ? "sp" : `sp+0x${offset.toString(16)}`;

      html += `
        <tr class="${rowClass}">
          <td>${offsetLabel}</td>
          <td class="text-primary">0x${addr.toString(16).padStart(8, "0")}</td>
          <td><code>0x00000000</code></td>
          <td class="text-muted">${isSpRow ? 'Top of Stack' : 'Frame Slot'}</td>
        </tr>
      `;
    }

    this.stackBody.innerHTML = html;
  }

  initPanelResizers() {
    this.setupVerticalResizer("gutter_top_v", "dock_panel_source", "dock_panel_regs", "dock_top_row");
    this.setupVerticalResizer("gutter_bottom_v", "dock_panel_mem", "dock_panel_stack", "dock_bottom_row");
    this.setupHorizontalResizer("gutter_main_h", "dock_top_row", "dock_bottom_row", "debug-dock-container");
  }

  setupVerticalResizer(gutterId, leftPanelId, rightPanelId, rowId) {
    const gutter = document.getElementById(gutterId);
    const leftPanel = document.getElementById(leftPanelId);
    const rightPanel = document.getElementById(rightPanelId);
    const row = document.getElementById(rowId);

    if (!gutter || !leftPanel || !rightPanel || !row) return;

    gutter.addEventListener("mousedown", (e) => {
      e.preventDefault();
      gutter.classList.add("active-dragging");
      document.body.style.cursor = "col-resize";
      document.body.style.userSelect = "none";

      const startX = e.clientX;
      const startLeftWidth = leftPanel.getBoundingClientRect().width;
      const totalWidth = row.getBoundingClientRect().width - gutter.offsetWidth;

      const onMouseMove = (moveEvt) => {
        const dx = moveEvt.clientX - startX;
        let newLeftWidth = startLeftWidth + dx;
        const minWidth = 100;
        const maxWidth = totalWidth - minWidth;

        if (newLeftWidth < minWidth) newLeftWidth = minWidth;
        if (newLeftWidth > maxWidth) newLeftWidth = maxWidth;

        const leftPercent = (newLeftWidth / totalWidth) * 100;
        leftPanel.style.width = leftPercent + "%";
        rightPanel.style.width = (100 - leftPercent) + "%";
      };

      const onMouseUp = () => {
        gutter.classList.remove("active-dragging");
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  }

  setupHorizontalResizer(gutterId, topRowId, bottomRowId, containerClass) {
    const gutter = document.getElementById(gutterId);
    const topRow = document.getElementById(topRowId);
    const bottomRow = document.getElementById(bottomRowId);
    const container = document.querySelector("." + containerClass);

    if (!gutter || !topRow || !bottomRow || !container) return;

    gutter.addEventListener("mousedown", (e) => {
      e.preventDefault();
      gutter.classList.add("active-dragging");
      document.body.style.cursor = "row-resize";
      document.body.style.userSelect = "none";

      const startY = e.clientY;
      const startTopHeight = topRow.getBoundingClientRect().height;
      const totalHeight = container.getBoundingClientRect().height - gutter.offsetHeight;

      const onMouseMove = (moveEvt) => {
        const dy = moveEvt.clientY - startY;
        let newTopHeight = startTopHeight + dy;
        const minHeight = 80;
        const maxHeight = totalHeight - minHeight;

        if (newTopHeight < minHeight) newTopHeight = minHeight;
        if (newTopHeight > maxHeight) newTopHeight = maxHeight;

        const topPercent = (newTopHeight / totalHeight) * 100;
        topRow.style.height = topPercent + "%";
        bottomRow.style.height = (100 - topPercent) + "%";
      };

      const onMouseUp = () => {
        gutter.classList.remove("active-dragging");
        document.body.style.cursor = "";
        document.body.style.userSelect = "";
        document.removeEventListener("mousemove", onMouseMove);
        document.removeEventListener("mouseup", onMouseUp);
      };

      document.addEventListener("mousemove", onMouseMove);
      document.addEventListener("mouseup", onMouseUp);
    });
  }
}

function escapeHtml(str) {
  if (!str) return "";
  return String(str)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function highlightAsm(asmText) {
  if (!asmText) return "";
  let text = escapeHtml(asmText);

  // Symbol references <name> or <name + 0x4>
  text = text.replace(/(&lt;[^&]+&gt;)/g, '<span class="asm-sym-ref">$1</span>');

  // Mnemonic instruction keyword at start of text
  text = text.replace(/^([a-z0-9\._]+)/i, '<span class="asm-inst">$1</span>');

  // Registers
  const regRegex = /\b(x[0-9]{1,2}|f[0-9]{1,2}|zero|ra|sp|gp|tp|t[0-6]|s[0-9]{1,2}|a[0-7]|ft[0-9]{1,2}|fs[0-9]{1,2}|fa[0-7])\b/g;
  text = text.replace(regRegex, '<span class="asm-reg">$1</span>');

  // Immediates & numbers
  text = text.replace(/\b(-?(?:0x[0-9a-fA-F]+|[0-9]+))\b/g, '<span class="asm-imm">$1</span>');

  return text;
}

// Auto-instantiate upon script inclusion if DOM ready
if (typeof window !== "undefined") {
  window.addEventListener("DOMContentLoaded", () => {
    window.visualDebuggerUI = new VisualDebuggerUI(simulator_controller);
  });
}
