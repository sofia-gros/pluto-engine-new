import { describe, expect, it } from 'vitest';
import { create, set, copy, intersects, containsPoint } from '../../../../src/core/math/aabb';

describe('aabb', () => {
  it('create and set', () => {
    const a = create();
    set(a, 0, 1, 2, 3);
    expect(a[0]).toBe(0);
    expect(a[1]).toBe(1);
    expect(a[2]).toBe(2);
    expect(a[3]).toBe(3);
  });

  it('copy', () => {
    const a = set(create(), 0, 1, 2, 3);
    const b = create();
    copy(b, a);
    expect(b[0]).toBe(0);
  });

  it('intersects', () => {
    const a = set(create(), 0, 0, 10, 10);
    const b = set(create(), 5, 5, 15, 15);
    const c = set(create(), 20, 20, 30, 30);
    const d = set(create(), 10, 10, 20, 20); // edge touches

    expect(intersects(a, b)).toBe(true);
    expect(intersects(a, c)).toBe(false);
    expect(intersects(a, d)).toBe(true); // touch is intersection
  });

  it('containsPoint', () => {
    const a = set(create(), 0, 0, 10, 10);
    expect(containsPoint(a, 5, 5)).toBe(true);
    expect(containsPoint(a, 10, 10)).toBe(true);
    expect(containsPoint(a, -1, 5)).toBe(false);
  });
});
