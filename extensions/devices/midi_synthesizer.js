/*jshint esversion: 9 */
import {Device} from "./utils.js";

class MIDI_Synthesizer extends Device{
  setup(){
    this.load();
  }

  async load(){
    var module = await import("./dependencies/webaudio-tinysynth.js");
    this.synth = new module.Player();
    var syscall =`
      sendMessage({a0, a1, a2});
    `;
    this.registerSyscall(2048, "Midi Synthesizer", syscall, this.onmessage.bind(this));
    this.bus.mmio.store(this.base_addr, 1, 0xFF);
    this.onStart = _ => {this.bus.mmio.store(this.base_addr, 1, 0xFF);};
    this.bus.watchAddress(this.base_addr, value => {
      if(value != 0xFF){
        console.log(this.bus.mmio.load(this.base_addr + 4, 1));
        this.synth.play(
          this.bus.mmio.load(this.base_addr + 2, 2), // inst
          this.bus.mmio.load(this.base_addr + 4, 1), // note
          this.bus.mmio.load(this.base_addr + 5, 1)/256, // vel
          0, // delay
          this.bus.mmio.load(this.base_addr + 6, 2)/1000, // duration
          this.bus.mmio.load(this.base_addr, 1) // ch
        );
        this.bus.mmio.store(this.base_addr, 1, 0xFF);
      }
    }, 1);
  }

  onmessage(reg){
    console.log(reg);
    this.synth.play(reg.a0, reg.a1 >> 24, ((reg.a1 >> 16)&0xFF)/256, 0, (reg.a1 & 0xFFFF)/1000, reg.a2);
  }
}

const synth = new MIDI_Synthesizer();
export default synth;