import { describe, expect, it } from 'vitest';
import {
  create,
  identity,
  copy,
  multiply,
  invert,
  transformVec2,
} from '../../../../src/core/math/affine2d';
import * as vec2 from '../../../../src/core/math/vec2';

describe('affine2d', () => {
  it('create and identity', () => {
    const m = create();
    expect(Array.from(m)).toEqual([1, 0, 0, 1, 0, 0]);

    m[0] = 2;
    identity(m);
    expect(Array.from(m)).toEqual([1, 0, 0, 1, 0, 0]);
  });

  it('copy', () => {
    const m = create();
    m[0] = 2;
    m[1] = 3;
    m[4] = 10;
    const out = create();
    copy(out, m);
    expect(Array.from(out)).toEqual([2, 3, 0, 1, 10, 0]);
  });

  it('multiply', () => {
    const a = create();
    a[0] = 2;
    a[3] = 2; // scale 2x
    a[4] = 10;
    a[5] = 20; // translate (10, 20)

    const b = create();
    b[4] = 5;
    b[5] = 5; // translate (5, 5)

    const out = create();
    // a * b
    multiply(out, a, b);

    // b transforms first, then a.
    // translate 5,5 then scale 2x then translate 10,20
    // Result translate should be 5*2+10 = 20, 5*2+20 = 30
    expect(out[0]).toBe(2);
    expect(out[3]).toBe(2);
    expect(out[4]).toBe(20);
    expect(out[5]).toBe(30);
  });

  it('invert', () => {
    const a = create();
    a[0] = 2;
    a[3] = 2;
    a[4] = 10;
    a[5] = 20;

    const out = create();
    const res = invert(out, a);
    expect(res).not.toBeNull();

    expect(out[0]).toBe(0.5);
    expect(out[3]).toBe(0.5);
    expect(out[4]).toBe(-5);
    expect(out[5]).toBe(-10);

    // non-invertible
    a[0] = 0;
    a[1] = 0;
    a[2] = 0;
    a[3] = 0;
    expect(invert(out, a)).toBeNull();
  });

  it('transformVec2', () => {
    const m = create();
    m[0] = 0;
    m[1] = 1;
    m[2] = -1;
    m[3] = 0; // rotate 90 deg
    m[4] = 10;
    m[5] = 20; // translate

    const v = vec2.set(vec2.create(), 1, 0);
    const out = vec2.create();

    transformVec2(out, m, v);
    // 1,0 rotated by 90deg -> 0,1. translated by 10,20 -> 10, 21
    expect(out[0]).toBe(10);
    expect(out[1]).toBe(21);
  });
});
