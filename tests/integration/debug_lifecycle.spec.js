import { test, expect } from "@playwright/test";

/**
 * The debug session used to be destroyed after every run: the controller
 * restarted the worker 50 ms after a program finished, which threw away the
 * program, the debug mode, and every breakpoint. A debug command that arrived
 * with no program loaded was dropped in silence.
 */

// `.option norvc` keeps every instruction four bytes wide, so the test can
// name a breakpoint address by offset from the entry point.
const COUNTING_PROGRAM = `
.option norvc
.global _start
.section .text
_start:
    li t0, 0
    addi t0, t0, 1
    addi t0, t0, 1
    addi t0, t0, 1
    addi t0, t0, 1
    li a7, 93
    li a0, 0
    ecall
`;

async function load_source(page, source, name) {
  await page.evaluate(
    async ([src, filename]) => {
      const blob = new Blob([src], { type: "text/plain" });
      const file = new File([blob], filename);
      window.compiler.loaded_files = [];
      window.compiler.load_new_file(file);
      window.simulator_controller.last_loaded_files = [file];
    },
    [source, name],
  );
}

async function install_snapshot_probe(page) {
  await page.evaluate(() => {
    window.__snapshots = [];
    const ch = new BroadcastChannel(
      "simulator_status" + (window.uniq_id || ""),
    );
    ch.onmessage = (e) => {
      if (e.data.type === "debug_state") window.__snapshots.push(e.data.state);
    };
    window.__snapshot_ch = ch;
  });
}

/** Wait until at least `n` debug snapshots have arrived and return the last. */
async function last_snapshot(page, n) {
  await page.waitForFunction(
    (count) => (window.__snapshots || []).length >= count,
    n,
    { timeout: 20000 },
  );
  return await page.evaluate(
    () => window.__snapshots[window.__snapshots.length - 1],
  );
}

test.describe("Debug session lifecycle", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");
    await page.waitForFunction(
      () =>
        typeof window.simulator_controller !== "undefined" &&
        typeof window.compiler !== "undefined" &&
        typeof window.visualDebuggerUI !== "undefined",
    );
    await install_snapshot_probe(page);
  });

  test("a breakpoint stays active across two debug runs", async ({ page }) => {
    await load_source(page, COUNTING_PROGRAM, "counting.s");

    // First debug run.
    await page.evaluate(() => window.run_simulator(true));
    const first = await last_snapshot(page, 1);
    const entry = first.pc;
    const breakpoint = entry + 8;

    await page.evaluate(
      (addr) => window.simulator_controller.debugToggleBreakpoint(addr, true),
      breakpoint,
    );

    // Step twice; the PC display must follow each step.
    const pc_display = page.locator("#debug_pc_display");
    await expect(pc_display).toHaveText(
      "0x" + entry.toString(16).padStart(8, "0"),
    );

    await page.evaluate(() => window.simulator_controller.debugStep());
    const after_one = await last_snapshot(page, 2);
    expect(after_one.pc).toBe(entry + 4);
    await expect(pc_display).toHaveText(
      "0x" + (entry + 4).toString(16).padStart(8, "0"),
    );

    await page.evaluate(() => window.simulator_controller.debugStep());
    const after_two = await last_snapshot(page, 3);
    expect(after_two.pc).toBe(entry + 8);
    await expect(pc_display).toHaveText(
      "0x" + (entry + 8).toString(16).padStart(8, "0"),
    );

    // Continuing stops on the breakpoint the run is already sitting on...
    await page.evaluate(() => window.simulator_controller.debugContinue());
    const first_hit = await last_snapshot(page, 4);
    expect(first_hit.is_breakpoint).toBe(true);
    expect(first_hit.pc).toBe(breakpoint);

    // ...and continuing again leaves it, so the first run reaches its end and
    // the worker is marked as used.
    await page.evaluate(() => window.simulator_controller.debugContinue());
    await page.waitForFunction(
      () => {
        const s = window.__snapshots[window.__snapshots.length - 1];
        return s && s.is_halted;
      },
      undefined,
      { timeout: 20000 },
    );

    // Second debug run on a fresh worker.
    await page.evaluate(() => {
      window.__snapshots = [];
      return window.run_simulator(true);
    });
    const second = await last_snapshot(page, 1);
    expect(second.pc).toBe(entry);

    // The breakpoint survived: continuing stops on it rather than running to
    // the end of the program.
    await page.evaluate(() => window.simulator_controller.debugContinue());
    const stopped = await last_snapshot(page, 2);
    expect(stopped.is_breakpoint).toBe(true);
    expect(stopped.pc).toBe(breakpoint);
    expect(stopped.is_halted).toBe(false);
  });

  test("a debug command with no program loaded reports itself", async ({
    page,
  }) => {
    // Show the debug tab so its toolbar can be clicked.
    await page.evaluate(() => {
      const tab = document.getElementById("debug_tab");
      tab.hidden = false;
      tab.style.display = "block";
    });

    await page.click("#btn_debug_step_into");

    const toast = page
      .locator(".toast-item")
      .filter({ hasText: "Load and run a program" });
    await expect(toast).toBeVisible({ timeout: 10000 });
  });
});
