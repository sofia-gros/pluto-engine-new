import { describe, expect, it } from 'vitest';
import { FreeList } from '../../../../src/core/memory/free-list';

describe('FreeList', () => {
  it('initializes empty', () => {
    const list = new FreeList(10);
    expect(list.isEmpty()).toBe(true);
  });

  it('pushes and pops values in LIFO order', () => {
    const list = new FreeList(10);
    list.push(5);
    list.push(8);
    expect(list.isEmpty()).toBe(false);
    expect(list.pop()).toBe(8);
    expect(list.pop()).toBe(5);
    expect(list.isEmpty()).toBe(true);
  });
});
