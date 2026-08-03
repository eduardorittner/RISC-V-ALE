/*jshint esversion: 9 */
import {Device} from "./utils.js";
import { simulator_controller } from "../../modules/simulator.js";



class General_Purpose_Timer extends Device{
  setup(){
    this.int_timeout = 0;
    this.bus.watchAddress(this.base_addr, function (value) {
        this.bus.mmio.store(this.base_addr + 4, 4, Math.round(performance.now()));
        this.bus.mmio.store(this.base_addr, 4, 0);
    }.bind(this), 4, 1);
    this.bus.watchAddress(this.base_addr + 8, value =>{
      if(value != 0){
        if(value != this.int_timeout){
          if(this.timerInt) clearTimeout(this.timerInt);
          this.int_timeout = value;
          this.timerInt = setTimeout(_ =>{
            this.bus.mmio.store(this.base_addr + 8, 4, 0);
            this.int_timeout = 0;
            simulator_controller.triggerInterrupt();
          }, value);
        }
      }else{
        this.int_timeout = 0;
        clearTimeout(this.timerInt);
      }
    });
  }
}

const general_purpose_timer = new General_Purpose_Timer();
export default general_purpose_timer;