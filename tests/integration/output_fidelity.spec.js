import { test, expect } from "@playwright/test";

/**
 * Output-fidelity regression tests.
 *
 * The worker used to strip a trailing newline from every guest write and then
 * add one back, so a prompt without a newline moved the cursor to the next
 * line, and a write that already ended in a newline produced a blank line. The
 * worker also buffered MMIO writes until the next stdout flush, so a device
 * only saw a write when the program happened to print.
 *
 * These programs are written in assembly rather than C on purpose: they use the
 * raw write/read syscalls, so they exercise the byte path without depending on
 * the C library buffering.
 */

const PROMPT_SOURCE = `
.global _start
.section .data
prompt: .ascii "Enter n: "
.section .bss
buf: .space 32
.section .text
_start:
    # write(1, prompt, 9) -- no trailing newline
    li a7, 64
    li a0, 1
    la a1, prompt
    li a2, 9
    ecall

read_again:
    # read(0, buf, 32)
    li a7, 63
    li a0, 0
    la a1, buf
    li a2, 32
    ecall
    beqz a0, read_again
    mv s0, a0

    # write(1, buf, bytes_read) -- echo the input back
    li a7, 64
    li a0, 1
    la a1, buf
    mv a2, s0
    ecall

    li a7, 93
    li a0, 0
    ecall
`;

const MMIO_SOURCE = `
.global _start
.section .text
_start:
    li t0, 0xffff0100
    li t1, 0x42
    sw t1, 0(t0)
    # Spin long enough that the device state must change before the exit.
    li t2, 40000000
spin:
    addi t2, t2, -1
    bnez t2, spin
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

/** Collect the visible xterm buffer as an array of trimmed lines. */
async function terminal_lines(page) {
  return await page.evaluate(() => {
    const term = window.web_terminal.term;
    const buffer = term.buffer.active;
    const lines = [];
    for (let y = 0; y < buffer.length; y++) {
      const line = buffer.getLine(y);
      if (line) lines.push(line.translateToString(true));
    }
    return lines;
  });
}

test.describe("Guest output fidelity", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");
    await page.waitForFunction(
      () =>
        typeof window.simulator_controller !== "undefined" &&
        typeof window.compiler !== "undefined" &&
        typeof window.web_terminal !== "undefined",
    );
  });

  test("a prompt without a newline stays on the same line as the input", async ({
    page,
  }) => {
    await load_source(page, PROMPT_SOURCE, "prompt_test.s");

    // Record the raw stdout bytes the worker hands to the page, so the test can
    // assert on the exact byte stream and not only on the rendered layout.
    await page.evaluate(() => {
      window.__stdout_chunks = [];
      const ch = new BroadcastChannel("stdio_channel" + (window.uniq_id || ""));
      ch.onmessage = (e) => {
        if (e.data.fh === 1 && !e.data.origin) {
          window.__stdout_chunks.push(e.data.data);
        }
      };
      window.__stdout_ch = ch;
    });

    // Seed stdin before the run so this test stays independent of the
    // interactive-input path.
    await page.evaluate(() => window.web_terminal.setSTDIN("42"));

    await page.evaluate(() => window.run_simulator(false));

    await page.waitForFunction(
      () => (window.__stdout_chunks || []).join("").includes("42"),
      undefined,
      { timeout: 25000 },
    );

    const stdout = await page.evaluate(() =>
      window.__stdout_chunks.join(""),
    );
    // The prompt keeps its exact bytes: no newline was added after it.
    expect(stdout.startsWith("Enter n: 42")).toBe(true);

    const lines = await terminal_lines(page);
    expect(lines.some((l) => l.includes("Enter n: 42"))).toBe(true);
  });

  test("two printed lines render as two lines, not three", async ({ page }) => {
    const two_lines_source = `
.global _start
.section .data
msg: .ascii "alpha\\nbeta\\n"
.section .text
_start:
    li a7, 64
    li a0, 1
    la a1, msg
    li a2, 11
    ecall
    li a7, 93
    li a0, 0
    ecall
`;
    await load_source(page, two_lines_source, "two_lines.s");

    await page.evaluate(() => {
      window.__stdout_chunks = [];
      const ch = new BroadcastChannel("stdio_channel" + (window.uniq_id || ""));
      ch.onmessage = (e) => {
        if (e.data.fh === 1 && !e.data.origin) {
          window.__stdout_chunks.push(e.data.data);
        }
      };
      window.__stdout_ch = ch;
    });

    await page.evaluate(() => window.run_simulator(false));

    await page.waitForFunction(
      () => (window.__stdout_chunks || []).join("").includes("beta"),
      undefined,
      { timeout: 25000 },
    );

    const stdout = await page.evaluate(() => window.__stdout_chunks.join(""));
    expect(stdout).toBe("alpha\nbeta\n");
  });

  test("a device sees an MMIO write before the program exits", async ({
    page,
  }) => {
    await load_source(page, MMIO_SOURCE, "mmio_only.s");

    await page.evaluate(async () => {
      const mod = await import("/modules/simulator.js");
      window.__mmio = mod.mmio;
      window.__run_finished = false;
      const ch = new BroadcastChannel(
        "simulator_status" + (window.uniq_id || ""),
      );
      ch.onmessage = (e) => {
        if (e.data.type === "status" && e.data.status && e.data.status.finish) {
          window.__run_finished = true;
        }
      };
      window.__status_ch = ch;
    });

    await page.evaluate(() => window.run_simulator(false));

    // The device value must arrive while the program is still spinning.
    await page.waitForFunction(
      () => window.__mmio.load(0xffff0100, 4) === 0x42,
      undefined,
      { timeout: 25000 },
    );
    const finished = await page.evaluate(() => window.__run_finished);
    expect(finished).toBe(false);
  });
});
