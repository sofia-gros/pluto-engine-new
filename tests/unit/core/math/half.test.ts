import { describe, expect, it } from 'vitest';
import { packHalf2x16, unpackHalf2x16 } from '../../../../src/core/math/half';

describe('half', () => {
  it('should roundtrip known values exactly', () => {
    const knownValues = [
      0,
      1,
      -2,
      65504, // max normal half
      6.1e-5, // min normal half (approx 6.1035e-5)
      Infinity,
      -Infinity,
    ];

    for (const val of knownValues) {
      const h = packHalf2x16(val);
      const f = unpackHalf2x16(h);
      expect(f).toBeCloseTo(val, 4); // some precision loss for 6.1e-5
    }

    // NaN special case
    const nanH = packHalf2x16(NaN);
    const nanF = unpackHalf2x16(nanH);
    expect(Number.isNaN(nanF)).toBe(true);
  });
});
