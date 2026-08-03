import { mmio, simulator_controller } from "../../modules/simulator.js";

class BusHelper{
  constructor(){
    this.bus_ch = new BroadcastChannel('bus_channel' + window.uniq_id);
    this.syscalls = {}
    this.addressList = []
    this.mmio = mmio;
    this.bus_ch.onmessage = function(ev) {
      if(ev.data.syscall){
        if(this.syscalls[ev.data.syscall]){
          this.syscalls[ev.data.syscall](ev.data.data);
        }
      }
    }.bind(this);
    setTimeout(this.mmio_update_check.bind(this), 15);
  }

  mmio_update_check(){
    for (const i in this.addressList) {
      const wp = this.addressList[i];
      const value = this.mmio.load(i, wp.size);
      if(wp.value == undefined || wp.value == value){
        wp.f(value);
      }
    }
    setTimeout(this.mmio_update_check.bind(this), 15);
  }

  registerSyscallCallback(number, f){
    this.syscalls[number] = f;
  }

  watchAddress(addr, f, size=4, value){
    this.addressList[addr] = {f, size, value};
  }

}

export const bus_helper = new BusHelper();

import {navegation} from "../../assets/js/interface_elements.js";
export class Device{
  constructor(){
    this.syscalls = [];
    this.simulator = simulator_controller;
  }
  
  addTab(name, icon, id, content){
    if(!this.navegation){
      this.navegation = navegation;
    }
    this.navegation.addTab(name, icon, id, content);
  }

  setupSimControl(){
    if(!this.sim_status_ch){
      this.sim_status_ch = new BroadcastChannel("simulator_status" + window.uniq_id);
      this.sim_status_ch.onmessage = function(ev) {
        if(ev.data.type == "status"){
          if(this.runningCallback && ev.data.status.running) this.runningCallback();
          if(this.stoppingCallback && !ev.data.status.running) this.stoppingCallback();
          if(this.startingCallback && ev.data.status.starting) this.startingCallback();
          if(ev.data.status.starting) this.installSyscalls();
        }
      }.bind(this);
    }
  }

  installSyscalls(){
    for (const s in this.syscalls) {
      simulator_controller.load_syscall(this.syscalls[s].number, this.syscalls[s].code);
    }
  }

  registerSyscall(number, desc, code, callback, persistent=true){
    this.setupSimControl();
    if(callback != undefined){
      bus_helper.registerSyscallCallback(number, callback);
    }
    simulator_controller.load_syscall(number, code, desc);
    if(persistent){
      this.syscalls.push({number, code});
    }
  }

  simulator_log(log){
    this.setupSimControl();
    this.sim_status_ch.postMessage({type: "sim_log", log});
  }

  setBaseAddress(base_addr){
    this.base_addr = base_addr;
    this.setup();
  }

  setup(){}

  set onRun(f){
    this.setupSimControl();
    this.runningCallback = f;
  }

  set onStop(f){
    this.setupSimControl();
    this.stoppingCallback = f;
  }

  set onStart(f){
    this.setupSimControl();
    this.startingCallback = f;
  }

  get bus(){
    return bus_helper;
  }
}