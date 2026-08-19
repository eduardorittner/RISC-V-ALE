import { test, expect } from "@playwright/test";

test.describe("Unknown Syscall Error Handling", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");

    // Wait for main page and simulator controller to initialize
    await page.waitForFunction(
      () =>
        typeof window.simulator_controller !== "undefined" &&
        typeof window.compiler !== "undefined"
    );
  });

  test("Executes a RISC-V assembly program with an unknown syscall and asserts toast notification is displayed", async ({
    page,
  }) => {
    // 1. Prepare RISC-V assembly source code with an unknown syscall number (999)
    const asmSource = `
.global _start
_start:
    li a7, 999
    li a0, 0x123
    li a1, 0x456
    li a2, 0x789
    li a3, 0xabc
    ecall
    li a7, 93
    ecall
`;

    // 2. Load assembly file into compiler and simulator controller
    await page.evaluate(async (source) => {
      const blob = new Blob([source], { type: "text/plain" });
      const file = new File([blob], "unknown_sys_test.s");
      window.compiler.loaded_files = [];
      window.compiler.load_new_file(file);
      window.simulator_controller.last_loaded_files = [file];
    }, asmSource);

    // 3. Trigger simulation run
    await page.evaluate(async () => {
      await window.run_simulator(false);
    });

    // 4. Assert that the unknown syscall toast error notification is displayed
    // in the DOM. The trap also raises the generic "Execution Failed" toast, so
    // scope the assertions to the unknown-syscall one.
    const syscallToast = page
      .locator(".toast-item.toast-error")
      .filter({ hasText: "Unknown Syscall Error" });
    await expect(syscallToast).toBeVisible({ timeout: 10000 });

    const toastTitleLocator = syscallToast.locator(".toast-title");
    await expect(toastTitleLocator).toHaveText("Unknown Syscall Error");

    const toastBodyLocator = syscallToast.locator(".toast-body");
    await expect(toastBodyLocator).toContainText("Syscall Number: 999");
    await expect(toastBodyLocator).toContainText("a0=0x123");
    await expect(toastBodyLocator).toContainText("a1=0x456");
    await expect(toastBodyLocator).toContainText("a2=0x789");
    await expect(toastBodyLocator).toContainText("a3=0xabc");
  });
});
