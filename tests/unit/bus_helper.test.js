import { describe, test, expect, beforeEach, afterEach, vi } from "vitest";
import {
  BusHelper,
  MAX_WATCH_FAILURES,
} from "../../extensions/devices/bus_helper.js";
import { MMIO_Manager } from "../../modules/mmio_manager.js";

/** A stand-in for the page MMIO: plain reads and writes over an object. */
function fake_mmio(initial = {}) {
  return {
    values: { ...initial },
    load(addr) {
      return this.values[addr] || 0;
    },
    store(addr, size, value) {
      this.values[addr] = value;
    },
  };
}

function new_bus(mmio) {
  return new BusHelper({
    mmio,
    channel: { postMessage() {}, onmessage: null, close() {} },
  });
}

describe("BusHelper watch isolation", () => {
  let errors;

  beforeEach(() => {
    errors = vi.spyOn(console, "error").mockImplementation(() => {});
  });

  afterEach(() => {
    errors.mockRestore();
  });

  test("a callback that throws does not stop the other watches", () => {
    const mmio = fake_mmio({ 0x100: 1, 0x200: 1 });
    const bus = new_bus(mmio);
    let second_calls = 0;

    bus.watchAddress(
      0x100,
      () => {
        throw new Error("bad device");
      },
      4,
      1,
      "Broken device",
    );
    bus.watchAddress(0x200, () => second_calls++, 4, 1, "Good device");

    bus.mmio_update_check();

    expect(second_calls).toBe(1);
    expect(bus.addressList.has(0x200)).toBe(true);

    bus.stop_polling();
  });

  test("a watch that keeps throwing is removed", () => {
    const mmio = fake_mmio({ 0x100: 1 });
    const bus = new_bus(mmio);
    let calls = 0;

    bus.watchAddress(
      0x100,
      () => {
        calls++;
        throw new Error("bad device");
      },
      4,
      1,
      "Broken device",
    );

    for (let i = 0; i < MAX_WATCH_FAILURES; i++) bus.mmio_update_check();

    expect(calls).toBe(MAX_WATCH_FAILURES);
    expect(bus.addressList.has(0x100)).toBe(false);

    // A removed watch is never called again.
    bus.mmio_update_check();
    expect(calls).toBe(MAX_WATCH_FAILURES);
  });

  test("a run of successes clears the failure count", () => {
    const mmio = fake_mmio({ 0x100: 1 });
    const bus = new_bus(mmio);
    let fail = true;

    bus.watchAddress(
      0x100,
      () => {
        if (fail) throw new Error("transient");
      },
      4,
      1,
      "Flaky device",
    );

    bus.mmio_update_check();
    bus.mmio_update_check();
    fail = false;
    bus.mmio_update_check();
    fail = true;
    bus.mmio_update_check();
    bus.mmio_update_check();

    expect(bus.addressList.has(0x100)).toBe(true);
    bus.stop_polling();
  });
});

describe("BusHelper polling lifecycle", () => {
  test("no timer runs while nothing is watched", () => {
    const bus = new_bus(fake_mmio());
    expect(bus.poll_timer).toBe(null);

    bus.watchAddress(0x100, () => {}, 4, 1, "A device");
    expect(bus.poll_timer).not.toBe(null);

    bus.watchAddress(0x200, () => {}, 4, 1, "A device");
    bus.unwatchAddress(0x100);
    expect(bus.poll_timer).not.toBe(null);

    bus.unwatchAddress(0x200);
    expect(bus.poll_timer).toBe(null);
  });

  test("the timer fires the watches and stops when the last one goes", async () => {
    vi.useFakeTimers();
    try {
      const mmio = fake_mmio({ 0x100: 1 });
      const bus = new_bus(mmio);
      let calls = 0;
      bus.watchAddress(0x100, () => calls++, 4, 1, "A device");

      vi.advanceTimersByTime(100);
      expect(calls).toBeGreaterThan(0);

      const seen = calls;
      bus.unwatchAddress(0x100);
      vi.advanceTimersByTime(100);
      expect(calls).toBe(seen);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("BusHelper watch conditions", () => {
  test("a watch without an expected value fires only on a change", () => {
    const mmio = fake_mmio({ 0x100: 0 });
    const bus = new_bus(mmio);
    const seen = [];
    bus.watchAddress(0x100, (v) => seen.push(v), 4, undefined, "A device");

    bus.mmio_update_check();
    bus.mmio_update_check();
    mmio.values[0x100] = 7;
    bus.mmio_update_check();
    bus.mmio_update_check();

    expect(seen).toEqual([0, 7]);
    bus.stop_polling();
  });

  test("a watch with an expected value fires while the memory holds it", () => {
    const mmio = fake_mmio({ 0x100: 0 });
    const bus = new_bus(mmio);
    let calls = 0;
    bus.watchAddress(0x100, () => calls++, 4, 1, "A device");

    bus.mmio_update_check();
    expect(calls).toBe(0);

    mmio.values[0x100] = 1;
    bus.mmio_update_check();
    bus.mmio_update_check();
    expect(calls).toBe(2);

    bus.stop_polling();
  });

  test("the poll reads the numeric address it was given", () => {
    const mmio = fake_mmio();
    const reads = [];
    mmio.load = (addr, size) => {
      reads.push([addr, size]);
      return 0;
    };
    const bus = new_bus(mmio);
    bus.watchAddress(0xffff0100, () => {}, 2, undefined, "A device");

    bus.mmio_update_check();

    expect(reads).toEqual([[0xffff0100, 2]]);
    bus.stop_polling();
  });
});

describe("MMIO_Manager slot reuse", () => {
  test("a released slot is handed out again", () => {
    const manager = new MMIO_Manager();
    const first = manager.getFreeSlot();
    const second = manager.getFreeSlot();

    manager.releaseSlot(first);

    expect(manager.getFreeSlot()).toBe(first);
    expect(second).not.toBe(first);
  });
});
