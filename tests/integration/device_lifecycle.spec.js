import { test, expect } from "@playwright/test";

/**
 * Removing a device used to release only its MMIO slot: the watches, the
 * syscall callbacks, the status channel and the tab all stayed behind. Loading
 * the same device again then grew every one of those lists.
 */

test.describe("Device add and remove cycle", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");
    await page.waitForFunction(
      () =>
        typeof window.load_device === "function" &&
        typeof window.loaded_devices !== "undefined",
    );
  });

  test("a device that is removed and loaded again reuses its slot and its tab", async ({
    page,
  }) => {
    const baseline = await page.evaluate(async () => {
      const bus = await import("/extensions/devices/bus_helper.js");
      window.__bus = bus.bus_helper;
      return {
        nav_items: document.querySelectorAll("aside nav ul li").length,
        watches: bus.bus_helper.addressList.size,
      };
    });

    await page.evaluate(() => window.load_device("canvas.js"));
    await expect(page.locator("#canvas_device_tab")).toHaveCount(1);
    const first_slot = await page.evaluate(
      () => window.loaded_devices.get("canvas.js").base_addr,
    );

    await page.evaluate(() => window.remove_device("canvas.js"));
    await expect(page.locator("#canvas_device_tab")).toHaveCount(0);

    // Everything the device held is back.
    const after_removal = await page.evaluate(() => ({
      nav_items: document.querySelectorAll("aside nav ul li").length,
      watches: window.__bus.addressList.size,
      loaded: window.loaded_devices.has("canvas.js"),
      poll_timer: window.__bus.poll_timer,
    }));
    expect(after_removal.nav_items).toBe(baseline.nav_items);
    expect(after_removal.watches).toBe(baseline.watches);
    expect(after_removal.loaded).toBe(false);
    expect(after_removal.poll_timer).toBe(null);

    await page.evaluate(() => window.load_device("canvas.js"));
    await expect(page.locator("#canvas_device_tab")).toHaveCount(1);
    const second_slot = await page.evaluate(
      () => window.loaded_devices.get("canvas.js").base_addr,
    );

    expect(second_slot).toBe(first_slot);

    const after_reload = await page.evaluate(() => ({
      nav_items: document.querySelectorAll("aside nav ul li").length,
      modals: document.querySelectorAll("#modal_canvas").length,
      rows: document.querySelectorAll("#mapped_device_canvas_js").length,
    }));
    expect(after_reload.nav_items).toBe(baseline.nav_items + 1);
    expect(after_reload.modals).toBe(1);
    expect(after_reload.rows).toBe(1);

    await page.evaluate(() => window.remove_device("canvas.js"));
  });

  test("ten add and remove cycles leave no growth behind", async ({ page }) => {
    const baseline = await page.evaluate(async () => {
      const bus = await import("/extensions/devices/bus_helper.js");
      window.__bus = bus.bus_helper;
      return {
        nav_items: document.querySelectorAll("aside nav ul li").length,
        watches: bus.bus_helper.addressList.size,
      };
    });

    let slot = null;
    for (let i = 0; i < 10; i++) {
      await page.evaluate(() => window.load_device("canvas.js"));
      await expect(page.locator("#canvas_device_tab")).toHaveCount(1);
      const current = await page.evaluate(
        () => window.loaded_devices.get("canvas.js").base_addr,
      );
      if (slot === null) slot = current;
      expect(current).toBe(slot);
      await page.evaluate(() => window.remove_device("canvas.js"));
    }

    const final = await page.evaluate(() => ({
      nav_items: document.querySelectorAll("aside nav ul li").length,
      watches: window.__bus.addressList.size,
      tabs: document.querySelectorAll("#canvas_device_tab").length,
      modals: document.querySelectorAll("#modal_canvas").length,
      rows: document.querySelectorAll("#mapped_device_canvas_js").length,
    }));
    expect(final).toEqual({
      nav_items: baseline.nav_items,
      watches: baseline.watches,
      tabs: 0,
      modals: 0,
      rows: 0,
    });
  });

  test("removing one device leaves the other one working", async ({ page }) => {
    await page.evaluate(async () => {
      const mod = await import("/modules/simulator.js");
      window.__mmio = mod.mmio;
      window.__serial_out = [];
      const ch = new BroadcastChannel("stdio_channel" + (window.uniq_id || ""));
      ch.onmessage = (e) => {
        if (e.data.fh === 1 && !e.data.origin) window.__serial_out.push(e.data.data);
      };
      window.__serial_ch = ch;
      await window.load_device("serial_port.js");
      await window.load_device("general_purpose_timer.js");
    });

    const bases = await page.evaluate(() => ({
      serial: window.loaded_devices.get("serial_port.js").base_addr,
      timer: window.loaded_devices.get("general_purpose_timer.js").base_addr,
    }));

    // The serial port answers a write.
    await page.evaluate((base) => {
      window.__mmio.store(base + 1, 1, "A".charCodeAt(0));
      window.__mmio.store(base, 1, 1);
    }, bases.serial);
    await page.waitForTimeout(60);
    await page.evaluate((base) => {
      window.__mmio.store(base + 1, 1, "\n".charCodeAt(0));
      window.__mmio.store(base, 1, 1);
    }, bases.serial);
    await page.waitForFunction(
      () => window.__serial_out.join("").includes("A"),
      undefined,
      { timeout: 10000 },
    );

    await page.evaluate(() => window.remove_device("serial_port.js"));

    // The timer keeps answering after its neighbour is gone.
    await page.evaluate((base) => {
      window.__mmio.update_store(base + 4, 4, 0);
      window.__mmio.store(base, 4, 1);
    }, bases.timer);
    await page.waitForFunction(
      (base) => window.__mmio.load(base + 4, 4) > 0,
      bases.timer,
      { timeout: 10000 },
    );

    await page.evaluate(() =>
      window.remove_device("general_purpose_timer.js"),
    );
  });

  test("one failing device does not stop another", async ({ page }) => {
    const result = await page.evaluate(async () => {
      const { BusHelper } = await import("/extensions/devices/bus_helper.js");
      const memory = { 0x300: 1, 0x400: 1 };
      const bus = new BusHelper({
        mmio: { load: (addr) => memory[addr] || 0 },
        channel: { postMessage() {}, onmessage: null, close() {} },
      });
      let good = 0;
      bus.watchAddress(
        0x300,
        () => {
          throw new Error("broken");
        },
        4,
        1,
        "Broken device",
      );
      bus.watchAddress(0x400, () => good++, 4, 1, "Good device");

      for (let i = 0; i < 4; i++) bus.mmio_update_check();
      const state = {
        good,
        broken_removed: !bus.addressList.has(0x300),
        good_alive: bus.addressList.has(0x400),
      };
      bus.stop_polling();
      return state;
    });

    expect(result.broken_removed).toBe(true);
    expect(result.good_alive).toBe(true);
    expect(result.good).toBe(4);

    // The failure is reported to the user rather than only to the console.
    await expect(
      page.locator(".toast-item").filter({ hasText: "Broken device" }),
    ).toBeVisible({ timeout: 5000 });
  });
});
