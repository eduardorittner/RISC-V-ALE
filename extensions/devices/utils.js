import { simulator_controller } from "../../modules/simulator.js";
import { bus_helper } from "./bus_helper.js";
import { navegation } from "../../assets/js/interface_elements.js";

export { bus_helper };

/**
 * The bus as one device sees it. It forwards to the shared `bus_helper` and
 * remembers what this device claimed, so `Device.teardown` can give all of it
 * back. It also tags every watch with the device name, so a failure report
 * names the device that caused it.
 */
class DeviceBus {
  constructor(name) {
    this.name = name;
    this.watched = new Set();
    this.syscall_callbacks = new Set();
  }

  get mmio() {
    return bus_helper.mmio;
  }

  watchAddress(addr, f, size = 4, value) {
    bus_helper.watchAddress(addr, f, size, value, this.name);
    this.watched.add(addr);
  }

  unwatchAddress(addr) {
    bus_helper.unwatchAddress(addr);
    this.watched.delete(addr);
  }

  registerSyscallCallback(number, f) {
    bus_helper.registerSyscallCallback(number, f);
    this.syscall_callbacks.add(number);
  }

  unregisterSyscallCallback(number) {
    bus_helper.unregisterSyscallCallback(number);
    this.syscall_callbacks.delete(number);
  }

  /** Release every watch and syscall callback this device registered. */
  release_all() {
    this.watched.forEach((addr) => bus_helper.unwatchAddress(addr));
    this.watched.clear();
    this.syscall_callbacks.forEach((number) =>
      bus_helper.unregisterSyscallCallback(number),
    );
    this.syscall_callbacks.clear();
  }
}

export class Device {
  constructor() {
    this.syscalls = [];
    this.simulator = simulator_controller;
    /** Set by `window.load_device` before `setBaseAddress`. */
    this.device_name = this.constructor.name;
    /** Tabs this device added, so `teardown` can remove them again. */
    this.tab_ids = [];
  }

  addTab(name, icon, id, content) {
    if (!this.navegation) {
      this.navegation = navegation;
    }
    this.navegation.addTab(name, icon, id, content);
    this.tab_ids.push(id);
  }

  setupSimControl() {
    if (!this.sim_status_ch) {
      this.sim_status_ch = new BroadcastChannel(
        "simulator_status" + window.uniq_id,
      );
      this.sim_status_ch.onmessage = (ev) => {
        /** @type {SimStatusChannelMessage} */
        const msg = ev.data;
        if (msg.type == "status") {
          if (this.runningCallback && msg.status.running) this.runningCallback();
          if (this.stoppingCallback && !msg.status.running)
            this.stoppingCallback();
          if (this.startingCallback && msg.status.starting)
            this.startingCallback();
          if (msg.status.starting) this.installSyscalls();
        }
      };
    }
  }

  installSyscalls() {
    for (const s in this.syscalls) {
      simulator_controller.load_syscall(
        this.syscalls[s].number,
        this.syscalls[s].code,
      );
    }
  }

  registerSyscall(number, desc, code, callback, persistent = true) {
    this.setupSimControl();
    if (callback != undefined) {
      this.bus.registerSyscallCallback(number, callback);
    }
    simulator_controller.load_syscall(number, code, desc);
    if (persistent) {
      this.syscalls.push({ number, code });
    }
  }

  /**
   * The only way a device talks to the status channel.
   *
   * @param {SimStatusChannelMessage} msg
   */
  post_status(msg) {
    this.setupSimControl();
    this.sim_status_ch.postMessage(msg);
  }

  simulator_log(log) {
    this.post_status({ type: "sim_log", log });
  }

  setBaseAddress(base_addr) {
    this.base_addr = base_addr;
    this.setup();
  }

  setup() {}

  /**
   * Give back everything this device holds. A device that owns more than the
   * defaults overrides this and calls `super.teardown()`.
   */
  teardown() {
    if (this._bus) this._bus.release_all();
    if (this.sim_status_ch) {
      this.sim_status_ch.close();
      this.sim_status_ch = null;
    }
    this.tab_ids.forEach((id) => navegation.removeTab(id));
    this.tab_ids = [];
    this.syscalls = [];
    this.runningCallback = null;
    this.stoppingCallback = null;
    this.startingCallback = null;
  }

  set onRun(f) {
    this.setupSimControl();
    this.runningCallback = f;
  }

  set onStop(f) {
    this.setupSimControl();
    this.stoppingCallback = f;
  }

  set onStart(f) {
    this.setupSimControl();
    this.startingCallback = f;
  }

  get bus() {
    if (!this._bus) {
      this._bus = new DeviceBus(this.device_name);
    } else if (this._bus.name !== this.device_name) {
      this._bus.name = this.device_name;
    }
    return this._bus;
  }
}
