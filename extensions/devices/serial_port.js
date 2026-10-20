/*jshint esversion: 9 */
import {Device} from "./utils.js";

class Serial_Port extends Device{
  setup(){
    this.stdout_buffer = "";
    this.stdin_buffer = "";

    this.onStart = _ => {
      this.stdout_buffer = "";
      this.stdin_buffer = "";
    }

    this.stdio_ch = new BroadcastChannel("stdio_channel" + window.uniq_id);
    this.stdio_ch.onmessage = function (e) {
      if(e.data.fh==0){ // stdin
        this.stdin_buffer += e.data.data;
      }else if(e.data.init_stdin){
        this.stdin_buffer = e.data.data;
      }
    }.bind(this);

    // port 1: stdout
    this.bus.watchAddress(this.base_addr, function (value) {
      const char = String.fromCharCode(this.bus.mmio.load(this.base_addr + 1, 1));
      if(char == "\n"){
        this.stdio_ch.postMessage({fh:1, data:this.stdout_buffer});
        this.stdout_buffer = "";
      }else{
        this.stdout_buffer += char;
      }
      this.bus.mmio.store(this.base_addr, 1, 0);
    }.bind(this), 1, 1);


    // port 2: stdin
    this.bus.watchAddress(this.base_addr + 2, function (value) {
      if(this.stdin_buffer.length == 0){
        this.bus.mmio.store(this.base_addr + 3, 1, 0);
      }else{
        this.bus.mmio.store(this.base_addr + 3, 1, this.stdin_buffer.charCodeAt(0));
        this.stdin_buffer = this.stdin_buffer.slice(1);
      }
      this.bus.mmio.store(this.base_addr + 2, 1, 0);
    }.bind(this), 1, 1);
  }
}

const serial_port = new Serial_Port();
export default serial_port;