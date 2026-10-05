import { describe, expect, it } from 'vitest';
import {
  create,
  set,
  copy,
  add,
  sub,
  scale,
  dot,
  cross,
  lenSq,
  len,
  normalize,
} from '../../../../src/core/math/vec2';

describe('vec2', () => {
  it('create and set', () => {
    const v = create();
    expect(v[0]).toBe(0);
    expect(v[1]).toBe(0);
    set(v, 1, 2);
    expect(v[0]).toBe(1);
    expect(v[1]).toBe(2);
  });

  it('copy', () => {
    const a = set(create(), 3, 4);
    const b = create();
    copy(b, a);
    expect(b[0]).toBe(3);
    expect(b[1]).toBe(4);
  });

  it('add and sub', () => {
    const a = set(create(), 1, 2);
    const b = set(create(), 3, 4);
    const out = create();

    add(out, a, b);
    expect(out[0]).toBe(4);
    expect(out[1]).toBe(6);

    sub(out, a, b);
    expect(out[0]).toBe(-2);
    expect(out[1]).toBe(-2);
  });

  it('scale', () => {
    const a = set(create(), 2, 3);
    const out = create();
    scale(out, a, 2);
    expect(out[0]).toBe(4);
    expect(out[1]).toBe(6);
  });

  it('dot and cross', () => {
    const a = set(create(), 1, 0);
    const b = set(create(), 0, 1);

    expect(dot(a, b)).toBe(0);
    expect(cross(a, b)).toBe(1);
    expect(cross(b, a)).toBe(-1);
  });

  it('len and lenSq', () => {
    const a = set(create(), 3, 4);
    expect(lenSq(a)).toBe(25);
    expect(len(a)).toBe(5);
  });

  it('normalize', () => {
    const a = set(create(), 3, 4);
    const out = create();
    normalize(out, a);
    expect(out[0]).toBeCloseTo(0.6);
    expect(out[1]).toBeCloseTo(0.8);

    // zero vector
    const zero = set(create(), 0, 0);
    normalize(out, zero);
    expect(out[0]).toBe(0);
    expect(out[1]).toBe(0);
  });
});
