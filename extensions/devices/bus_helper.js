import { mmio } from "../../modules/simulator.js";

/** Polling interval of the MMIO watch loop, in milliseconds. */
export const MMIO_POLL_INTERVAL_MS = 15;
/** Consecutive throws a single watch is allowed before it is removed. */
export const MAX_WATCH_FAILURES = 3;

/**
 * The bridge between the devices and the simulator bus.
 *
 * It polls the watched MMIO addresses and forwards the device syscall
 * messages. One bad device must not stop the others, so every callback runs
 * inside a `try`/`catch`, and a watch that keeps throwing is removed. The
 * polling timer only exists while at least one watch does.
 */
export class BusHelper {
  /**
   * @param {{mmio?: object, channel?: object}} [options] injection points for
   *   the unit tests, which have neither a `BroadcastChannel` nor the page MMIO.
   */
  constructor(options = {}) {
    this.mmio = options.mmio || mmio;
    this.syscalls = {};
    /**
     * Watched addresses, keyed by the numeric address. An array keyed by
     * address gave string keys back, so the poll loop read the wrong address.
     * @type {Map<number, {f: Function, size: number, value: number|undefined,
     *   owner: string, last_value: number|undefined, failures: number}>}
     */
    this.addressList = new Map();
    /** Handle of the single polling timer, or null when nothing is watched. */
    this.poll_timer = null;

    if (options.channel) {
      this.bus_ch = options.channel;
    } else if (typeof BroadcastChannel !== "undefined") {
      const uniq = typeof window !== "undefined" ? window.uniq_id || "" : "";
      this.bus_ch = new BroadcastChannel("bus_channel" + uniq);
    } else {
      this.bus_ch = { postMessage: () => {}, onmessage: null, close: () => {} };
    }

    this.bus_ch.onmessage = function (ev) {
      if (!ev.data.syscall) return;
      const handler = this.syscalls[ev.data.syscall];
      if (!handler) return;
      try {
        handler(ev.data.data);
      } catch (e) {
        console.error(
          `Device syscall callback ${ev.data.syscall} threw:`,
          e,
        );
      }
    }.bind(this);
  }

  /** One poll over every watch. A throw removes only the watch that threw. */
  mmio_update_check() {
    // Iterate over a copy: a failing callback may remove its own watch.
    for (const [addr, wp] of Array.from(this.addressList)) {
      let value;
      try {
        value = this.mmio.load(addr, wp.size);
      } catch (e) {
        this.record_watch_failure(addr, wp, e);
        continue;
      }

      // A watch with an expected value fires while the memory holds it; a watch
      // without one fires on a change. Firing on every tick regardless was the
      // old behaviour and it made a watch a busy loop.
      const should_call =
        wp.value === undefined ? value !== wp.last_value : value === wp.value;
      wp.last_value = value;
      if (!should_call) continue;

      try {
        wp.f(value);
        wp.failures = 0;
      } catch (e) {
        this.record_watch_failure(addr, wp, e);
      }
    }
  }

  record_watch_failure(addr, wp, error) {
    wp.failures += 1;
    console.error(
      `Device watch on 0x${(addr >>> 0).toString(16)} (${wp.owner}) failed:`,
      error,
    );
    if (wp.failures < MAX_WATCH_FAILURES) return;

    this.unwatchAddress(addr);
    if (typeof Toast !== "undefined") {
      Toast.error({
        title: "Device stopped",
        text:
          `${wp.owner} failed ${MAX_WATCH_FAILURES} times on address ` +
          `0x${(addr >>> 0).toString(16)} and was disconnected. ` +
          `The other devices continue.`,
        delay: Infinity,
      });
    }
  }

  start_polling() {
    if (this.poll_timer !== null) return;
    this.poll_timer = setInterval(
      this.mmio_update_check.bind(this),
      MMIO_POLL_INTERVAL_MS,
    );
  }

  stop_polling() {
    if (this.poll_timer === null) return;
    clearInterval(this.poll_timer);
    this.poll_timer = null;
  }

  registerSyscallCallback(number, f) {
    this.syscalls[number] = f;
  }

  unregisterSyscallCallback(number) {
    delete this.syscalls[number];
  }

  /**
   * @param {number} addr address to poll
   * @param {(value: number) => void} f callback
   * @param {number} [size] access width in bytes
   * @param {number} [value] fire only while the memory holds this value
   * @param {string} [owner] device name, used in the failure report
   */
  watchAddress(addr, f, size = 4, value, owner = "A device") {
    this.addressList.set(addr, {
      f,
      size,
      value,
      owner,
      last_value: undefined,
      failures: 0,
    });
    this.start_polling();
  }

  unwatchAddress(addr) {
    this.addressList.delete(addr);
    if (this.addressList.size === 0) this.stop_polling();
  }
}

export const bus_helper = new BusHelper();
