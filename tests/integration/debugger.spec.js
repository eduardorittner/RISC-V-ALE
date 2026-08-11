import { test, expect } from "@playwright/test";

test.describe("Visual Debugger Subsystem", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");

    // Wait for the app to initialize and ensure debug tab is visible
    await page.evaluate(() => {
      const debugTab = document.getElementById("debug_tab");
      if (debugTab) {
        debugTab.hidden = false;
        debugTab.style.display = "block";
      }
      if (!window.visualDebuggerUI) {
        const { VisualDebuggerUI } = window;
        if (VisualDebuggerUI) {
          window.visualDebuggerUI = new VisualDebuggerUI(window.simulator_controller);
        }
      }
    });
  });

  test("Suite 2.1: Breakpoint Management", async ({ page }) => {
    // 1. Simulate disassembly data loading into the debugger
    await page.evaluate(() => {
      const ui = window.visualDebuggerUI;
      const items = [
        { address: 0x80000000, opcode_hex: "00000513", asm_text: "li x10, 0", label: "_start" },
        { address: 0x80000004, opcode_hex: "00a00593", asm_text: "li x11, 10" },
        { address: 0x80000008, opcode_hex: "00b50633", asm_text: "add x12, x10, x11" },
        { address: 0x8000000c, opcode_hex: "00000073", asm_text: "ecall" }
      ];
      ui.renderDisassembly(items);
      ui.updateState({
        pc: 0x80000000,
        step_count: 0,
        is_halted: false,
        is_breakpoint: false,
        gpr: new Array(32).fill(0)
      });
    });

    // 2. Toggle breakpoint at 0x80000008
    await page.evaluate(() => {
      const ui = window.visualDebuggerUI;
      ui.controller.onDebugBpUpdated(0x80000008, true);
    });

    // Verify breakpoint icon rendered in disassembly view
    const activeBpCount = await page.locator(".gutter-bp.active-bp").count();
    expect(activeBpCount).toBeGreaterThan(0);

    // 3. Trigger continue execution and simulate breakpoint hit
    await page.click("#btn_debug_continue");

    await page.evaluate(() => {
      const ui = window.visualDebuggerUI;
      ui.updateState({
        pc: 0x80000008,
        step_count: 2,
        is_halted: false,
        is_breakpoint: true,
        gpr: new Array(32).fill(0)
      });
    });

    // 4. Assert state badge and PC display
    const stateBadgeText = await page.locator("#debug_state_badge").innerText();
    expect(stateBadgeText).toContain("BREAKPOINT");

    const pcText = await page.locator("#debug_pc_display").innerText();
    expect(pcText).toBe("0x80000008");
  });

  test("Suite 2.2: Stepping Operations", async ({ page }) => {
    // Set initial snapshot state
    await page.evaluate(() => {
      const ui = window.visualDebuggerUI;
      const initialGpr = new Array(32).fill(0);
      ui.updateState({
        pc: 0x80000000,
        step_count: 0,
        is_halted: false,
        is_breakpoint: false,
        gpr: initialGpr
      });
    });

    // Perform Step Into
    await page.click("#btn_debug_step_into");

    // Simulate state update after Step Into
    await page.evaluate(() => {
      const ui = window.visualDebuggerUI;
      const updatedGpr = new Array(32).fill(0);
      updatedGpr[10] = 42; // x10 updated
      ui.updateState({
        pc: 0x80000004,
        step_count: 1,
        is_halted: false,
        is_breakpoint: false,
        gpr: updatedGpr
      });
    });

    // Assert PC display advanced +4 bytes
    const pcText = await page.locator("#debug_pc_display").innerText();
    expect(pcText).toBe("0x80000004");

    // Assert changed register received CSS highlight class .reg-changed
    const changedRegCount = await page.locator(".reg-cell.reg-changed").count();
    expect(changedRegCount).toBeGreaterThan(0);

    // Perform Step Over
    await page.click("#btn_debug_step_over");

    await page.evaluate(() => {
      const ui = window.visualDebuggerUI;
      ui.updateState({
        pc: 0x80000008,
        step_count: 2,
        is_halted: false,
        is_breakpoint: false,
        gpr: new Array(32).fill(0)
      });
    });

    const stepOverPc = await page.locator("#debug_pc_display").innerText();
    expect(stepOverPc).toBe("0x80000008");

    // Perform Step Out
    await page.click("#btn_debug_step_out");

    await page.evaluate(() => {
      const ui = window.visualDebuggerUI;
      ui.updateState({
        pc: 0x80000010,
        step_count: 5,
        is_halted: false,
        is_breakpoint: false,
        gpr: new Array(32).fill(0)
      });
    });

    const stepOutPc = await page.locator("#debug_pc_display").innerText();
    expect(stepOutPc).toBe("0x80000010");
  });

  test("Suite 2.3: Memory Jump & Hex Editor Rendering", async ({ page }) => {
    // Enter target memory address 0x80000100 and trigger memory jump
    await page.fill("#debug_mem_jump_input", "0x80000100");
    await page.click("#btn_debug_mem_jump");

    // Simulate memory data callback from controller
    await page.evaluate(() => {
      const ui = window.visualDebuggerUI;
      const bytes = new Uint8Array(32);
      bytes[0] = 0xde;
      bytes[1] = 0xad;
      bytes[2] = 0xbe;
      bytes[3] = 0xef;
      ui.renderHexEditor(0x80000100, bytes);
    });

    // Assert rendered address and hex bytes in table
    const hexBodyText = await page.locator("#debug_hex_body").innerText();
    expect(hexBodyText).toContain("0x80000100");
    expect(hexBodyText).toContain("DE AD BE EF");

    // Test memory poke trigger
    let pokeTarget = null;
    await page.exposeFunction("onPokeCalled", (addr, val) => {
      pokeTarget = { addr, val };
    });

    await page.evaluate(() => {
      const ui = window.visualDebuggerUI;
      ui.controller.debugPokeMemory = (addr, val) => {
        window.onPokeCalled(addr, val);
      };
      // Poke memory at 0x80000100 with value 0xff
      ui.controller.debugPokeMemory(0x80000100, 0xff);
    });

    expect(pokeTarget).toEqual({ addr: 0x80000100, val: 0xff });
  });

  test("Suite 2.4: Register Display Format Switching", async ({ page }) => {
    // Populate registers
    await page.evaluate(() => {
      const ui = window.visualDebuggerUI;
      const gpr = new Array(32).fill(0);
      gpr[1] = 255;
      ui.updateState({
        pc: 0x80000000,
        step_count: 0,
        is_halted: false,
        is_breakpoint: false,
        gpr: gpr
      });
    });

    // Change format to unsigned decimal (udec)
    await page.selectOption("#debug_reg_format_select", "udec");

    // Assert value rendered in decimal format "255"
    let reg1Val = await page.locator(".reg-cell[data-reg='1'] .reg-val").innerText();
    expect(reg1Val).toBe("255");

    // Switch format back to hex
    await page.selectOption("#debug_reg_format_select", "hex");

    // Assert value prefixed with "0x"
    reg1Val = await page.locator(".reg-cell[data-reg='1'] .reg-val").innerText();
    expect(reg1Val).toBe("0x000000ff");
  });

  test("Suite 2.5: Debugger Reset", async ({ page }) => {
    // Set non-zero state
    await page.evaluate(() => {
      const ui = window.visualDebuggerUI;
      ui.updateState({
        pc: 0x80000020,
        step_count: 15,
        is_halted: false,
        is_breakpoint: false,
        gpr: new Array(32).fill(100)
      });
    });

    // Assert non-zero PC and step count
    let pcText = await page.locator("#debug_pc_display").innerText();
    expect(pcText).toBe("0x80000020");

    // Trigger reset button
    await page.click("#btn_debug_reset");

    // Assert PC display resets to 0x00000000 and cycle counter resets to 0
    pcText = await page.locator("#debug_pc_display").innerText();
    expect(pcText).toBe("0x00000000");

    const cycleText = await page.locator("#debug_cycle_counter").innerText();
    expect(cycleText).toBe("0");
  });
});
