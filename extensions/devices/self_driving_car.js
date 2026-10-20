/*jshint esversion: 9 */
import {Device} from "./utils.js";

class Car extends Device{
  setup(){
    this.addTab("Self-Driving Car", "fa-car-side", "self_driving_car", `
    <iframe style="width:100%;height:100%" id="self_driving_car_window" src="./extensions/devices/dependencies/self_driving_car_unity/index.html" frameborder="0"></iframe>
    `);
    document.getElementById("self_driving_car_window").onload = function(){
      document.getElementById("self_driving_car_window").contentWindow.setCallbacks(this.status_callback.bind(this), this.sensor_callback.bind(this), this.camera_callback.bind(this), this.collision_callback.bind(this), function(){
        this.unityModule = document.getElementById("self_driving_car_window").contentWindow.unityInstance;
        this.unityModule.SendMessage("Control", "setControls", 3);
        this.unityModule.SendMessage("car", "setStatus", "0.3129841089248657,183.72621154785156,359.99310302734375,-19.922077178955078,0.9621117115020752,-34.62373352050781");
        this.bus.watchAddress(this.base_addr, function (value) {
          if(value == 1) this.unityModule.SendMessage("car", "getStatus");
        }.bind(this), 1);
    
        this.bus.watchAddress(this.base_addr + 1, function (value) {
          if(value == 1) this.unityModule.SendMessage("car", "readLineCamera");
        }.bind(this), 1);
    
        this.bus.watchAddress(this.base_addr + 2, function (value) {
          if(value != 0) this.unityModule.SendMessage("car", "getDistanceSensor", value - 2);
        }.bind(this), 1);
    
        this.bus.watchAddress(this.base_addr + 32, function (value) {
          value = ((value|0)<<24)>>24;
          this.unityModule.SendMessage("Control", "setHorizontal", value/128);
        }.bind(this), 1);
    
        this.bus.watchAddress(this.base_addr + 33, function (value) {
          if(value == 0xFF) value = -1;
          this.unityModule.SendMessage("Control", "setVertical", value);
        }.bind(this), 1);
    
        this.bus.watchAddress(this.base_addr + 34, function (value) {
          this.unityModule.SendMessage("Control", "setHandBrake", value);
        }.bind(this), 1);
      }.bind(this));
    }.bind(this);
    

    var syscallControls =`
      sendMessage({a1, a2, stop: false});
      let start = performance.now();
      while(performance.now() - start < a0);
      sendMessage({stop: true});
    `;

    this.registerSyscall(2100, "Move the car in the forward (a1 = 1) or backward (a1 = -1) direction, for a0 milliseconds, with the steering wheel at the position defined by a2.", syscallControls, function(msg) {
      if(msg.stop){
        this.unityModule.SendMessage("Control", "setVertical", 0);
        this.unityModule.SendMessage("Control", "setHandBrake", 1);
      }else{
        this.unityModule.SendMessage("Control", "setHandBrake", 0);
        this.unityModule.SendMessage("Control", "setHorizontal", msg.a2/128);
        this.unityModule.SendMessage("Control", "setVertical", msg.a1);
      }
    }.bind(this));

    var syscall_status =`
      mmio.store(${this.base_addr}, 1, 1);
      while(mmio.load(${this.base_addr}, 1) == 1);
      a0 = (mmio.load(${this.base_addr + 16}, 4) << 16) | (mmio.load(${this.base_addr + 24}, 4) & 0xFFFF);
    `;

    this.registerSyscall(2101, "Get the approximate position (x,z) of the car. (a0 <= x<<16 | z)", syscall_status);
    this.position_log = []
    this.collision_log = []
    this.onStart = function() {
      this.position_log = []
      this.collision_log = []  
    }.bind(this);
  }

  status_callback(rot, pos){
    this.position_log.push(pos);
    this.bus.mmio.store(this.base_addr + 4, 4, Math.round(rot.x));
    this.bus.mmio.store(this.base_addr + 8, 4, Math.round(rot.y));
    this.bus.mmio.store(this.base_addr + 12, 4, Math.round(rot.z));
    this.bus.mmio.store(this.base_addr + 16, 4, Math.round(pos.x));
    this.bus.mmio.store(this.base_addr + 20, 4, Math.round(pos.y));
    this.bus.mmio.store(this.base_addr + 24, 4, Math.round(pos.z));
    this.bus.mmio.store(this.base_addr, 1, 0);
  }

  sensor_callback(distance){
    if(distance == -1) distance = 0xFFFFFFFF;
    this.bus.mmio.store(this.base_addr + 28, 4, Math.round(distance*100));
    this.bus.mmio.store(this.base_addr + 2, 1, 0);
  }

  camera_callback(img){
    for (let i = 0; i < img.length; i++) {
      this.bus.mmio.store(this.base_addr + 36 + i, 1, img[i]);
    }
    this.bus.mmio.store(this.base_addr + 1, 1, 0);
  }

  collision_callback(mgnt){
    this.collision_log.push(mgnt);
    // this.simulator_log({msg: `Car collision detected (Magnitude: ${mgnt})`, mgnt})
  }

  set_state(pos, rot){
    this.unityModule.SendMessage("car", "setStatus", `${rot.x},${rot.y},${rot.z},${pos.x},${pos.y},${pos.z}`);
  }
}

const car = new Car();
export default car;