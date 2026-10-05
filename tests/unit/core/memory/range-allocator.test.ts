import { describe, expect, it } from 'vitest';
import { RangeAllocator } from '../../../../src/core/memory/range-allocator';

describe('RangeAllocator', () => {
  it('initializes with capacity', () => {
    const alloc = new RangeAllocator(100);
    expect(alloc.capacity).toBe(100);
  });

  it('allocates memory and returns start index', () => {
    const alloc = new RangeAllocator(100);
    const start1 = alloc.allocate(20);
    expect(start1).toBe(0);

    const start2 = alloc.allocate(30);
    expect(start2).toBe(20);
  });

  it('fails to allocate when out of memory', () => {
    const alloc = new RangeAllocator(100);
    alloc.allocate(80);
    const start = alloc.allocate(30);
    expect(start).toBe(-1);
  });

  it('frees memory and merges with adjacent blocks', () => {
    const alloc = new RangeAllocator(100);
    alloc.allocate(20); // 0-20
    const start2 = alloc.allocate(30); // 20-50
    alloc.allocate(50); // 50-100

    alloc.free(start2, 30);

    // 現在空いているのは 20-50 のみ
    const newStart = alloc.allocate(20);
    expect(newStart).toBe(20); // 20-40が使われる

    alloc.free(0, 20); // 0-20が空く
    alloc.free(20, 20); // 20-40が空き、0-20と結合、さらに元々空いていた40-50と結合されるはず

    const largeStart = alloc.allocate(40);
    expect(largeStart).toBe(0); // 全て結合されていれば 0 から取れる
  });

  it('supports alignment', () => {
    const alloc = new RangeAllocator(100);
    // 0 から取れるが、アライメント 16 を要求
    const start1 = alloc.allocate(10, 16);
    expect(start1).toBe(0); // 0 は 16 の倍数

    // 次の空きは 10 からだが、アライメント 16 を要求するので 16 から取れるはず
    const start2 = alloc.allocate(10, 16);
    expect(start2).toBe(16);

    // 10-16 が空きとして残っているはず
    const start3 = alloc.allocate(6);
    expect(start3).toBe(10);
  });

  it('does nothing on freeing size 0', () => {
    const alloc = new RangeAllocator(100);
    alloc.free(0, 0); // shouldn't crash
  });
});
