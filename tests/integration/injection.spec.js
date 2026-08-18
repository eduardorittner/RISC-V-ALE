import { test, expect } from "@playwright/test";

const HOSTILE = `<img src=x onerror="window.__pwned = true">`;

test.describe("Script-injection defences", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");
    await page.waitForFunction(
      () =>
        typeof window.simulator_controller !== "undefined" &&
        typeof window.compiler !== "undefined",
    );
    await page.evaluate(() => {
      window.__pwned = false;
    });
  });

  test("a hostile file name is shown as text and executes nothing", async ({
    page,
  }) => {
    await page.evaluate((name) => {
      const file = new File([new Blob(["\x7fELF"])], name);
      window.simulator_controller.load_files([file]);
    }, HOSTILE);

    const toast = page
      .locator(".toast-item")
      .filter({ hasText: "File Loaded" });
    await expect(toast).toBeVisible({ timeout: 5000 });
    await expect(toast.locator(".toast-body")).toContainText(HOSTILE);
    expect(await page.locator(".toast-item img").count()).toBe(0);
    expect(await page.evaluate(() => window.__pwned)).toBe(false);
  });

  test("a hostile ELF symbol renders as text in the debug view", async ({
    page,
  }) => {
    await page.evaluate((hostile) => {
      const debugTab = document.getElementById("debug_tab");
      if (debugTab) debugTab.hidden = false;
      if (!window.visualDebuggerUI && window.VisualDebuggerUI) {
        window.visualDebuggerUI = new window.VisualDebuggerUI(
          window.simulator_controller,
        );
      }
      const ui = window.visualDebuggerUI;
      ui.currentPC = 0x80000000;
      ui.renderDisassembly([
        {
          address: 0x80000000,
          opcode_hex: hostile,
          asm_text: `jal ra, <${hostile}>`,
          label: hostile,
        },
      ]);
    }, HOSTILE);

    // Nothing from the payload became an element.
    expect(await page.locator("#debug_disasm_body img").count()).toBe(0);
    expect(await page.locator("#debug_current_symbol img").count()).toBe(0);

    const disasmText = await page.locator("#debug_disasm_body").innerText();
    expect(disasmText).toContain("onerror");
    expect(await page.evaluate(() => window.__pwned)).toBe(false);
  });

  test("a malformed postMessage neither throws nor runs an operation", async ({
    page,
  }) => {
    const pageErrors = [];
    page.on("pageerror", (err) => pageErrors.push(String(err)));

    await page.evaluate(() => {
      const malformed = [
        {},
        { cmd: null },
        { cmd: {} },
        { cmd: { op: 42 } },
        { cmd: { op: "toString" } },
        { cmd: { op: "constructor" } },
        { cmd: { op: "__proto__" } },
        { cmd: { op: "not_an_operation", params: {} } },
        "a plain string",
        123,
      ];
      for (const data of malformed) window.postMessage(data, "*");
    });

    await page.waitForTimeout(500);
    expect(pageErrors, `page errors: ${pageErrors.join(" | ")}`).toEqual([]);

    // No confirmation dialog was raised for an unrecognised operation either.
    expect(await page.locator(".toast-modal-backdrop").count()).toBe(0);
  });

  test("a URL-delivered assistant script only runs after confirmation", async ({
    page,
  }) => {
    const url =
      "#select_url_content=" +
      (await page.evaluate(() => {
        const payload = {
          main_page: "./data/html/getting_started.html",
          assistant_script: "window.__script_ran = true;",
          config: { options: {}, syscalls: {}, devices: {} },
        };
        return btoa(
          LZString.compressToEncodedURIComponent(JSON.stringify(payload)),
        );
      }));

    await page.evaluate((hash) => {
      window.__script_ran = false;
      location.hash = hash;
    }, url);

    // The dialog is up and the script has not run.
    const dialog = page.locator(".toast-modal-backdrop");
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await expect(dialog).toContainText("External Script Received");
    expect(await page.evaluate(() => window.__script_ran)).toBe(false);

    await dialog.locator(".toast-btn-cancel").click();
    await page.waitForTimeout(300);
    expect(await page.evaluate(() => window.__script_ran)).toBe(false);

    // Confirming runs it.
    await page.evaluate((hash) => {
      location.hash = "";
      location.hash = hash;
    }, url);
    await expect(dialog).toBeVisible({ timeout: 5000 });
    await dialog.locator(".toast-btn-confirm").click();
    await expect
      .poll(() => page.evaluate(() => window.__script_ran), { timeout: 5000 })
      .toBe(true);
  });
});
