import { describe, expect, it } from 'vitest';
import {
  clamp,
  lerp,
  inverseLerp,
  smoothstep,
  wrap,
  approxEqual,
} from '../../../../src/core/math/scalar';

describe('scalar', () => {
  it('clamp', () => {
    expect(clamp(5, 0, 10)).toBe(5);
    expect(clamp(-5, 0, 10)).toBe(0);
    expect(clamp(15, 0, 10)).toBe(10);
  });

  it('lerp', () => {
    expect(lerp(0, 10, 0.5)).toBe(5);
    expect(lerp(0, 10, 0)).toBe(0);
    expect(lerp(0, 10, 1)).toBe(10);
  });

  it('inverseLerp', () => {
    expect(inverseLerp(0, 10, 5)).toBe(0.5);
    expect(inverseLerp(0, 10, 0)).toBe(0);
    expect(inverseLerp(0, 10, 10)).toBe(1);
    expect(inverseLerp(5, 5, 5)).toBe(0); // a === b
  });

  it('smoothstep', () => {
    expect(smoothstep(0, 10, 0)).toBe(0);
    expect(smoothstep(0, 10, 10)).toBe(1);
    expect(smoothstep(0, 10, 5)).toBe(0.5);
    expect(smoothstep(0, 10, -5)).toBe(0); // below min
    expect(smoothstep(0, 10, 15)).toBe(1); // above max
  });

  it('wrap', () => {
    expect(wrap(5, 0, 10)).toBe(5);
    expect(wrap(15, 0, 10)).toBe(5);
    expect(wrap(-5, 0, 10)).toBe(5);
    expect(wrap(0, 0, 10)).toBe(0);
    expect(wrap(10, 0, 10)).toBe(0); // wrap is exclusive on upper bound, technically 10 % 10 is 0
  });

  it('approxEqual', () => {
    expect(approxEqual(1.0, 1.0000001)).toBe(true);
    expect(approxEqual(1.0, 1.1)).toBe(false);
  });
});
