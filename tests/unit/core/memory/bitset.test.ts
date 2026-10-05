import { describe, expect, it } from 'vitest';
import { Bitset } from '../../../../src/core/memory/bitset';

describe('Bitset', () => {
  it('initializes with correct capacity and empty data', () => {
    const bitset = new Bitset(100);
    expect(bitset.capacity).toBe(100);
    expect(bitset.data.length).toBe(4);
    expect(bitset.test(0)).toBe(false);
    expect(bitset.test(99)).toBe(false);
  });

  it('sets and tests bits', () => {
    const bitset = new Bitset(100);
    bitset.set(5);
    bitset.set(65);
    expect(bitset.test(5)).toBe(true);
    expect(bitset.test(65)).toBe(true);
    expect(bitset.test(4)).toBe(false);
    expect(bitset.test(64)).toBe(false);
  });

  it('clears bits', () => {
    const bitset = new Bitset(100);
    bitset.set(5);
    bitset.clear(5);
    expect(bitset.test(5)).toBe(false);
  });

  it('clears all bits', () => {
    const bitset = new Bitset(100);
    bitset.set(5);
    bitset.set(65);
    bitset.clearAll();
    expect(bitset.test(5)).toBe(false);
    expect(bitset.test(65)).toBe(false);
  });
});
