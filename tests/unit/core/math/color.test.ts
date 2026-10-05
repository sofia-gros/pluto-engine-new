import { describe, expect, it } from 'vitest';
import {
  packColor,
  hexToColor,
  unpackR,
  unpackG,
  unpackB,
  unpackA,
} from '../../../../src/core/math/color';

describe('color', () => {
  it('packColor and unpack', () => {
    const c = packColor(255, 128, 64, 32);
    expect(unpackR(c)).toBe(255);
    expect(unpackG(c)).toBe(128);
    expect(unpackB(c)).toBe(64);
    expect(unpackA(c)).toBe(32);
  });

  it('hexToColor', () => {
    const c = hexToColor(0xff8040, 32);
    expect(unpackR(c)).toBe(255);
    expect(unpackG(c)).toBe(128);
    expect(unpackB(c)).toBe(64);
    expect(unpackA(c)).toBe(32);

    // default alpha is 255
    const c2 = hexToColor(0xff8040);
    expect(unpackA(c2)).toBe(255);
  });
});
