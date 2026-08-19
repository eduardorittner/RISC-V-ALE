import { test, expect } from "@playwright/test";

test.describe("Failure reporting", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");
    await page.waitForFunction(
      () =>
        typeof window.simulator_controller !== "undefined" &&
        typeof window.compiler !== "undefined",
    );
  });

  test("a guest program that traps reports a nonzero exit code and a red toast", async ({
    page,
  }) => {
    // `.word 0` is the canonical illegal instruction, so the guest traps
    // before it can reach the exit syscall.
    const asmSource = `
.global _start
_start:
    li a0, 0
    .word 0
    li a7, 93
    ecall
`;

    await page.evaluate(async (source) => {
      window.__finish_status = null;
      const st = new BroadcastChannel("simulator_status" + window.uniq_id);
      st.onmessage = (e) => {
        if (e.data.type === "status" && e.data.status.finish) {
          window.__finish_status = e.data.status;
        }
      };

      const blob = new Blob([source], { type: "text/plain" });
      const file = new File([blob], "trap_test.s");
      window.compiler.loaded_files = [];
      window.compiler.load_new_file(file);
      window.simulator_controller.last_loaded_files = [file];
    }, asmSource);

    await page.evaluate(async () => {
      await window.run_simulator(false);
    });

    const failureToast = page
      .locator(".toast-item.toast-error")
      .filter({ hasText: "Execution Failed" });
    await expect(failureToast).toBeVisible({ timeout: 15000 });

    const status = await page.evaluate(() => window.__finish_status);
    expect(status).not.toBeNull();
    expect(status.error).toBe(true);
    expect(status.stats.trapped).toBe(true);
    expect(status.stats.exitCode).not.toBe(0);

    // The success toast must not appear alongside the failure.
    await expect(
      page.locator(".toast-item.toast-success").filter({
        hasText: "Execution Complete",
      }),
    ).toHaveCount(0);
  });

  test("an exception thrown inside a simulator worker shows a toast", async ({
    page,
  }) => {
    const start = Date.now();

    await page.evaluate(() => {
      // A worker whose top-level script throws fires `error` on the Worker,
      // which is the path the simulator's onerror handler exists for.
      const blob = new Blob(["throw new Error('worker exploded');"], {
        type: "application/javascript",
      });
      const worker = new Worker(URL.createObjectURL(blob));
      window.simulator_controller.setup_simulator_listeners(worker);
    });

    const toast = page
      .locator(".toast-item.toast-error")
      .filter({ hasText: "Simulator Worker Error" });
    await expect(toast).toBeVisible({ timeout: 5000 });
    expect(Date.now() - start).toBeLessThan(10000);
  });

  test("a run rejected by the worker settles the pending execution promise", async ({
    page,
  }) => {
    const settled = await page.evaluate(async () => {
      const blob = new Blob(["throw new Error('worker exploded');"], {
        type: "application/javascript",
      });
      const worker = new Worker(URL.createObjectURL(blob));
      window.simulator_controller.setup_simulator_listeners(worker);

      const pending = new Promise((resolve) => {
        window.simulator_controller._executionResolve = resolve;
      });
      const timeout = new Promise((resolve) =>
        setTimeout(() => resolve("timeout"), 5000),
      );
      return (await Promise.race([pending.then(() => "settled"), timeout])) === "settled";
    });
    expect(settled).toBe(true);
  });
});
