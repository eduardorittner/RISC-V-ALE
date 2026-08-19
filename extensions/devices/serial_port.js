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
    this.stdio_ch.onmessage = (e) => {
      /** @type {StdioChannelMessage} */
      const data = e.data;
      if(data.fh == 0){ // stdin
        this.stdin_buffer += data.data;
      }else if(data.fh === -1 && "init_stdin" in data){
        this.stdin_buffer = data.data;
      }
    };

    // port 1: stdout
    this.bus.watchAddress(this.base_addr, (value) => {
      const char = String.fromCharCode(this.bus.mmio.load(this.base_addr + 1, 1));
      if(char == "\n"){
        this.stdio_ch.postMessage(
          /** @type {StdioChannelMessage} */ ({fh: 1, data: this.stdout_buffer}),
        );
        this.stdout_buffer = "";
      }else{
        this.stdout_buffer += char;
      }
      this.bus.mmio.store(this.base_addr, 1, 0);
    }, 1, 1);


    // port 2: stdin
    this.bus.watchAddress(this.base_addr + 2, (value) => {
      if(this.stdin_buffer.length == 0){
        this.bus.mmio.store(this.base_addr + 3, 1, 0);
      }else{
        this.bus.mmio.store(this.base_addr + 3, 1, this.stdin_buffer.charCodeAt(0));
        this.stdin_buffer = this.stdin_buffer.slice(1);
      }
      this.bus.mmio.store(this.base_addr + 2, 1, 0);
    }, 1, 1);
  }

  /** The serial port owns a stdio channel on top of the defaults. */
  teardown(){
    if(this.stdio_ch){
      this.stdio_ch.close();
      this.stdio_ch = null;
    }
    super.teardown();
  }
}

const serial_port = new Serial_Port();
export default serial_port;