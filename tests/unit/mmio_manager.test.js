import { describe, test, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { MMIO_Manager } from '../../modules/mmio_manager.js';

describe('MMIO_Manager Property & Unit Tests', () => {
  let manager;

  beforeEach(() => {
    manager = new MMIO_Manager();
  });

  test('Invariant 1 & 2: Slot allocation boundaries and uniqueness property test', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 1, max: 127 }),
        (allocCount) => {
          const m = new MMIO_Manager();
          const allocated = new Set();

          for (let i = 0; i < allocCount; i++) {
            const slot = m.getFreeSlot();
            if (slot !== -1) {
              // Boundary & Alignment checks
              expect(slot).toBeGreaterThanOrEqual(0x100);
              expect(slot).toBeLessThanOrEqual(0xffff - 0x200);
              expect((slot - 0x100) % 0x200).toBe(0);

              // Uniqueness check
              expect(allocated.has(slot)).toBe(false);
              allocated.add(slot);
            }
          }
        }
      )
    );
  });

  test('Invariant 3: Slot release reusability property test', () => {
    fc.assert(
      fc.property(
        fc.array(fc.boolean(), { minLength: 1, maxLength: 300 }),
        (actions) => {
          const m = new MMIO_Manager();
          const allocated = new Set();

          for (const isAlloc of actions) {
            if (isAlloc) {
              const slot = m.getFreeSlot();
              if (slot !== -1) {
                expect(slot).toBeGreaterThanOrEqual(0x100);
                expect(slot).toBeLessThanOrEqual(0xffff - 0x200);
                expect((slot - 0x100) % 0x200).toBe(0);
                expect(allocated.has(slot)).toBe(false);
                allocated.add(slot);
              }
            } else if (allocated.size > 0) {
              const [slotToRelease] = allocated;
              m.releaseSlot(slotToRelease);
              allocated.delete(slotToRelease);
            }
          }
        }
      )
    );
  });

  test('Invariant 4: Exhaustion handling when all slots are allocated', () => {
    const allocated = [];
    const maxSlots = Math.floor((0xffff - 0x200 - 0x100) / 0x200) + 1; // 127 slots

    for (let i = 0; i < maxSlots; i++) {
      const slot = manager.getFreeSlot();
      expect(slot).not.toBe(-1);
      allocated.push(slot);
    }

    // Next allocation attempt must return -1 cleanly without throwing
    const exhaustedSlot = manager.getFreeSlot();
    expect(exhaustedSlot).toBe(-1);

    // Release one slot and verify it can be re-allocated
    const freedSlot = allocated.pop();
    manager.releaseSlot(freedSlot);
    const newSlot = manager.getFreeSlot();
    expect(newSlot).toBe(freedSlot);
  });

  test('getSlot method adds specific slot to tracking array', () => {
    manager.getSlot(0x400);
    expect(manager.slots).toContain(0x400);
  });
});
