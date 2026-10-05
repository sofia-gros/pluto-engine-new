import { describe, expect, it } from 'vitest';
import { nextPow2, isPow2, popcount32, ctz32, log2Floor } from '../../../../src/core/math/bits';

describe('bits', () => {
  it('nextPow2', () => {
    expect(nextPow2(0)).toBe(0);
    expect(nextPow2(1)).toBe(1);
    expect(nextPow2(2)).toBe(2);
    expect(nextPow2(3)).toBe(4);
    expect(nextPow2(5)).toBe(8);
    expect(nextPow2(100)).toBe(128);
  });

  it('isPow2', () => {
    expect(isPow2(0)).toBe(false); // 0 is not a power of 2 conventionally here
    expect(isPow2(1)).toBe(true);
    expect(isPow2(2)).toBe(true);
    expect(isPow2(3)).toBe(false);
    expect(isPow2(128)).toBe(true);
  });

  it('popcount32', () => {
    expect(popcount32(0)).toBe(0);
    expect(popcount32(1)).toBe(1);
    expect(popcount32(0b1011)).toBe(3);
    expect(popcount32(0xffffffff)).toBe(32);
  });

  it('ctz32', () => {
    expect(ctz32(0)).toBe(32);
    expect(ctz32(1)).toBe(0);
    expect(ctz32(2)).toBe(1);
    expect(ctz32(0b1000)).toBe(3);
  });

  it('log2Floor', () => {
    expect(log2Floor(0)).toBe(0); // special case
    expect(log2Floor(1)).toBe(0);
    expect(log2Floor(2)).toBe(1);
    expect(log2Floor(3)).toBe(1);
    expect(log2Floor(4)).toBe(2);
    expect(log2Floor(0xffffffff)).toBe(31);
  });
});
