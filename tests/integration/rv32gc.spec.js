import { test, expect } from "@playwright/test";

// C source that exercises the compressed extension heavily at -O2: a recursive
// call (compressed prologue/epilogue with c.addi16sp, c.swsp and c.lwsp), a
// division loop (rv32m) and byte stores.
const C_SOURCE = `
static void ale_write(const char *s, int n) {
  register int a0 asm("a0") = 1;
  register const char *a1 asm("a1") = s;
  register int a2 asm("a2") = n;
  register int a7 asm("a7") = 64;
  asm volatile("ecall" : : "r"(a0), "r"(a1), "r"(a2), "r"(a7) : "memory");
}

static void ale_exit(int code) {
  register int a0 asm("a0") = code;
  register int a7 asm("a7") = 93;
  asm volatile("ecall" : : "r"(a0), "r"(a7));
  __builtin_unreachable();
}

static int fib(int n) {
  if (n < 2) return n;
  return fib(n - 1) + fib(n - 2);
}

void _start(void) {
  char buf[12];
  int v = fib(16);
  int i = 12;
  buf[--i] = '\\n';
  do {
    buf[--i] = (char)('0' + (v % 10));
    v /= 10;
  } while (v);
  ale_write(buf + i, 12 - i);
  ale_exit(0);
}
`;

test.describe("rv32gc compressed code generation", () => {
  test("compiles and runs a C program built with the compressed extension at -O2", async ({
    page,
  }) => {
    test.setTimeout(180000);

    await page.goto("/index.html");
    await page.waitForFunction(
      () =>
        typeof window.simulator_controller !== "undefined" &&
        typeof window.compiler !== "undefined",
    );

    // Capture guest stdout off the broadcast channel the terminal listens on.
    await page.evaluate(() => {
      window.__guest_stdout = "";
      const ch = new BroadcastChannel("stdio_channel" + window.uniq_id);
      ch.onmessage = (e) => {
        if (e.data.fh === 1) window.__guest_stdout += e.data.data;
      };
    });

    const linked = await page.evaluate(async (source) => {
      const blob = new Blob([source], { type: "text/plain" });
      window.compiler.loaded_files = [];
      window.compiler.load_new_file(new File([blob], "rv32gc_test.c"));

      // "+c" is the compressed extension; together with the defaults already
      // passed by clang_worker.js this is -march=rv32gc.
      const obj = await window.compiler.cc([
        "-target-feature",
        "+c",
        "-O2",
        "rv32gc_test.c",
        "-o",
        "rv32gc_test.o",
      ]);
      if (!obj) return null;

      const elf = await window.compiler.ld([
        "rv32gc_test.o",
        "-o",
        "rv32gc_test.x",
      ]);
      return elf ? elf.name : null;
    }, C_SOURCE);

    expect(linked).toBe("rv32gc_test.x");

    // The linked ELF must actually contain compressed instructions, otherwise
    // this test would pass without exercising the RVC decoder at all.
    const compressedCount = await page.evaluate(async () => {
      const elf = window.compiler.loaded_files.find(
        (f) => f.name === "rv32gc_test.x",
      );
      const bytes = new Uint8Array(await elf.arrayBuffer());
      let count = 0;
      for (let i = 0; i + 1 < bytes.length; i += 2) {
        const half = bytes[i] | (bytes[i + 1] << 8);
        if (half !== 0 && (half & 0x3) !== 0x3) count++;
      }
      return count;
    });
    expect(compressedCount).toBeGreaterThan(0);

    await page.evaluate(async () => {
      window.simulator_controller.last_loaded_files = window.compiler.loaded_files;
      await window.simulator_controller.start_execution([
        "/rv32gc_test.x",
        "--isa",
        "acdfim",
      ]);
    });

    await expect
      .poll(() => page.evaluate(() => window.__guest_stdout), {
        timeout: 30000,
      })
      .toContain("987");
  });
});
