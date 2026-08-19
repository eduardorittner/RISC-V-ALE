import { test, expect } from "@playwright/test";

test.describe("Web Worker & MMIO Subsystem Integration Tests", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("/index.html");

    // Wait for main page and simulator controller to initialize
    await page.waitForFunction(() => typeof window.simulator_controller !== "undefined");
  });

  test("Test Case 1: Web Worker Prewarming & Initialization", async ({ page }) => {
    // Monitor console errors
    const errors = [];
    page.on("pageerror", (err) => errors.push(err.message));

    // Verify simulator_controller instance exists
    const isControllerReady = await page.evaluate(() => {
      return (
        window.simulator_controller !== null &&
        typeof window.simulator_controller === "object"
      );
    });
    expect(isControllerReady).toBe(true);

    // Verify idle worker or active worker initialization
    const hasWorker = await page.evaluate(() => {
      const sc = window.simulator_controller;
      return sc.idle_worker !== null || sc.simulator !== null;
    });
    expect(hasWorker).toBe(true);
    expect(errors).toHaveLength(0);
  });

  test("Test Case 2: Stdio & Status BroadcastChannel Communication", async ({ page }) => {
    // Verify BroadcastChannel instances are attached
    const channelsReady = await page.evaluate(() => {
      const sc = window.simulator_controller;
      return (
        sc.stdio_ch instanceof BroadcastChannel &&
        sc.sim_status_ch instanceof BroadcastChannel &&
        sc.bus_ch instanceof BroadcastChannel
      );
    });
    expect(channelsReady).toBe(true);

    // Verify posting stdin message through stdio BroadcastChannel
    const messageHandled = await page.evaluate(() => {
      try {
        window.simulator_controller.stdio_ch.postMessage({
          fh: 0,
          data: "test input\n",
        });
        return true;
      } catch (e) {
        return false;
      }
    });
    expect(messageHandled).toBe(true);
  });

  test("Test Case 3: Interactive Debugger Controls & Register Poking", async ({ page }) => {
    // Enable debug mode via simulator controller
    await page.evaluate(() => {
      window.simulator_controller.debugEnable(true);
    });

    // Execute single step
    await page.evaluate(() => {
      window.simulator_controller.debugStep();
    });

    // Poke register x1 with 42
    await page.evaluate(() => {
      window.simulator_controller.debugPokeRegister(1, 42);
    });

    // Verify debug step over and step out methods don't crash
    const debugMethodsCallable = await page.evaluate(() => {
      const sc = window.simulator_controller;
      sc.debugStepOver();
      sc.debugStepOut();
      sc.debugPause();
      return true;
    });
    expect(debugMethodsCallable).toBe(true);
  });

  test("Test Case 4: MMIO Update & Flush Synchronization", async ({ page }) => {
    // Test MMIO memory writes and flush_mmio
    const mmioSynced = await page.evaluate(() => {
      const sc = window.simulator_controller;
      if (!sc.mmio_write_buffer) {
        sc.mmio_write_buffer = new Uint8Array(0x10000);
        sc.mmio_dirty_flags = new Uint8Array(0x10000);
        sc.mmio_dirty_indices = new Uint32Array(0x10000);
        sc.mmio_dirty_count = 0;
      }
      sc.add_mmio_update(0x1000, 4, 0xcafe0001);
      return sc.mmio_dirty_count === 0; // flushed automatically
    });

    expect(mmioSynced).toBe(true);
  });
});
