import { describe, test, expect, beforeEach } from 'vitest';
import fc from 'fast-check';
import { MMIO } from '../../modules/simulator.js';

describe('MMIO Buffer Storage Unit & Property Tests', () => {
  let mmio;

  beforeEach(() => {
    mmio = new MMIO(0x10000);
  });

  test('Invariant 1: Access width consistency for 8-bit, 16-bit, and 32-bit stores and loads', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0, max: 0xfffc }),
        fc.integer({ min: 0, max: 0xffffffff }),
        (rawAddr, val) => {
          // Test 32-bit store/load at 4-byte aligned address
          const addr32 = rawAddr & ~0x3;
          mmio.store(addr32, 4, val >>> 0);
          expect(mmio.load(addr32, 4) >>> 0).toBe(val >>> 0);

          // Test 16-bit store/load at 2-byte aligned address
          const addr16 = rawAddr & ~0x1;
          const val16 = val & 0xffff;
          mmio.store(addr16, 2, val16);
          expect(mmio.load(addr16, 2)).toBe(val16);

          // Test 8-bit store/load
          const addr8 = rawAddr & 0xffff;
          const val8 = val & 0xff;
          mmio.store(addr8, 1, val8);
          expect(mmio.load(addr8, 1)).toBe(val8);
        }
      )
    );
  });

  test('Invariant 2: Address masking masks addresses to 16 bits (addr & 0xffff)', () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 0x10000, max: 0x7fffffff }),
        fc.integer({ min: 0, max: 0xffffffff }),
        (unmaskedAddr, val) => {
          const maskedAddr = unmaskedAddr & 0xffff;
          const alignedAddr = maskedAddr & ~0x3;

          mmio.store(unmaskedAddr, 4, val >>> 0);
          expect(mmio.load(alignedAddr, 4) >>> 0).toBe(val >>> 0);
          expect(mmio.load(unmaskedAddr, 4) >>> 0).toBe(val >>> 0);
        }
      )
    );
  });

  test('Invariant 3: reset() zeroes out all entries in MMIO memory', () => {
    // Fill memory with non-zero values
    mmio.store(0x100, 4, 0x12345678);
    mmio.store(0x200, 4, 0x9abcdef0);
    mmio.store(0x400, 2, 0x55aa);
    mmio.store(0x800, 1, 0xff);

    expect(mmio.load(0x100, 4)).toBe(0x12345678);

    // Perform reset
    mmio.reset();

    // Verify all loaded values are zero
    expect(mmio.load(0x100, 4)).toBe(0);
    expect(mmio.load(0x200, 4)).toBe(0);
    expect(mmio.load(0x400, 2)).toBe(0);
    expect(mmio.load(0x800, 1)).toBe(0);
  });

  test('update_store updates memory without trigger side-effects', () => {
    mmio.update_store(0x500, 4, 0xdeadbeef);
    expect(mmio.load(0x500, 4) >>> 0).toBe(0xdeadbeef);
  });
});
