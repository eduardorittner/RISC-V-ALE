export class MMIO_Manager {
  constructor() {
    this.slots = [];
    this.slot_size = 0x200;
    this.last_slot = 0xffff - this.slot_size;
    this.next_slot = 0x100;
  }

  getSlot(slot) {
    this.slots.push(slot);
  }

  releaseSlot(slot) {
    const index = this.slots.indexOf(slot);
    if (index !== -1) {
      this.slots.splice(index, 1);
    }
  }

  getFreeSlot() {
    let candidate = 0x100;
    while (candidate <= this.last_slot) {
      if (!this.slots.includes(candidate)) {
        this.slots.push(candidate);
        return candidate;
      }
      candidate += this.slot_size;
    }
    return -1;
  }
}
