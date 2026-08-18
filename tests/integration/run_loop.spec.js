import { test, expect } from "@playwright/test";

/**
 * The simulator worker runs a guest program as a chain of short slices joined
 * by `setTimeout`, so it keeps answering messages while a program runs. Before
 * that, one `run_full` call owned the worker thread until the program stopped:
 * an infinite loop wedged the worker, interactive input never arrived, and the
 * frequency limiter had no effect on the run itself.
 *
 * These programs use the raw write/read syscalls rather than the C library, so
 * they exercise the run loop without paying for a C compile in every test.
 */

const ENDLESS_LOOP = `
.global _start
.section .text
_start:
    li t0, 1
spin:
    addi t0, t0, 1
    j spin
`;

const READS_A_LINE = `
.global _start
.section .data
prompt: .ascii "Enter n: "
.section .bss
buf: .space 32
.section .text
_start:
    li a7, 64
    li a0, 1
    la a1, prompt
    li a2, 9
    ecall

wait_for_input:
    li a7, 63
    li a0, 0
    la a1, buf
    li a2, 32
    ecall
    beqz a0, wait_for_input
    mv s0, a0

    li a7, 64
    li a0, 1
    la a1, buf
    mv a2, s0
    ecall

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

/** Watch the status channel for debug snapshots and stdout. */
async function install_probes(page) {
  await page.evaluate(() => {
    window.__snapshots = [];
    window.__stdout_chunks = [];
    const status = new BroadcastChannel(
      "simulator_status" + (window.uniq_id || ""),
    );
    status.onmessage = (e) => {
      if (e.data.type === "debug_state") window.__snapshots.push(e.data.state);
    };
    const stdio = new BroadcastChannel("stdio_channel" + (window.uniq_id || ""));
    stdio.onmessage = (e) => {
      if (e.data.fh === 1 && !e.data.origin) {
        window.__stdout_chunks.push(e.data.data);
      }
    };
    window.__probe_channels = [status, stdio];
  });
}

test.describe("Sliced run loop", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");
    await page.waitForFunction(
      () =>
        typeof window.simulator_controller !== "undefined" &&
        typeof window.compiler !== "undefined" &&
        typeof window.web_terminal !== "undefined",
    );
    await install_probes(page);
  });

  test("an infinite loop stays interruptible and the Stop control ends it", async ({
    page,
  }) => {
    await load_source(page, ENDLESS_LOOP, "endless.s");
    await page.evaluate(() => window.run_simulator(false));

    // The run is under way: the button offers Stop.
    await expect(page.locator("#run_button")).toContainText("Stop", {
      timeout: 20000,
    });

    // The worker answers a message while the guest is still looping. This is
    // the property a single blocking `run_full` call could not provide.
    await page.evaluate(() => {
      window.__snapshots = [];
      window.simulator_controller.runPause();
    });
    await page.waitForFunction(() => window.__snapshots.length > 0, undefined, {
      timeout: 10000,
    });
    const steps = await page.evaluate(
      () => window.__snapshots[window.__snapshots.length - 1].step_count,
    );
    expect(steps).toBeGreaterThan(0);

    await page.evaluate(() => window.simulator_controller.runResume());

    // Stop ends the run and the UI returns to its idle state.
    await page.click("#run_button");
    await expect(page.locator("#run_button")).toContainText("Run", {
      timeout: 10000,
    });

    // The page is still live.
    expect(await page.evaluate(() => 1 + 1)).toBe(2);
  });

  test("input typed during a run reaches the program", async ({ page }) => {
    await load_source(page, READS_A_LINE, "reads_a_line.s");
    await page.evaluate(() => window.run_simulator(false));

    // The program blocks on its read until the input arrives.
    await page.waitForFunction(
      () => (window.__stdout_chunks || []).join("").includes("Enter n: "),
      undefined,
      { timeout: 20000 },
    );
    expect(await page.evaluate(() => window.__stdout_chunks.join(""))).toBe(
      "Enter n: ",
    );

    // Type a line while the program runs.
    await page.evaluate(() => {
      const ch = new BroadcastChannel("stdio_channel" + (window.uniq_id || ""));
      ch.postMessage({ fh: 0, data: "42\n" });
      window.__input_ch = ch;
    });

    await page.waitForFunction(
      () => (window.__stdout_chunks || []).join("").includes("42"),
      undefined,
      { timeout: 20000 },
    );
    const stdout = await page.evaluate(() => window.__stdout_chunks.join(""));
    expect(stdout).toBe("Enter n: 42\n");
  });

  test("a low frequency limit holds the instruction count down", async ({
    page,
  }) => {
    // 100 Hz: the scheduler runs a couple of instructions every 16 ms.
    await page.evaluate(() => window.simulator_controller.set_freq_limit(100));
    await load_source(page, ENDLESS_LOOP, "endless.s");
    await page.evaluate(() => window.run_simulator(false));

    await expect(page.locator("#run_button")).toContainText("Stop", {
      timeout: 20000,
    });

    // Sample the instruction count over a fixed interval rather than timing the
    // run: only the count is under the limiter's control.
    await page.waitForTimeout(1000);
    await page.evaluate(() => {
      window.__snapshots = [];
      window.simulator_controller.runPause();
    });
    await page.waitForFunction(() => window.__snapshots.length > 0, undefined, {
      timeout: 10000,
    });
    const steps = await page.evaluate(
      () => window.__snapshots[window.__snapshots.length - 1].step_count,
    );

    expect(steps).toBeGreaterThan(0);
    // An unlimited run of the same loop reaches tens of millions in a second.
    expect(steps).toBeLessThan(5000);

    await page.evaluate(() => window.simulator_controller.stop_execution());
  });
});
