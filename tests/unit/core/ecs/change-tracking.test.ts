import { describe, expect, it, vi } from 'vitest';
import { ChangeTracker } from '../../../../src/core/ecs/change-tracking';

describe('ChangeTracker', () => {
  it('initializes correctly', () => {
    const tracker = new ChangeTracker(10000, [1, 2]);
    expect(tracker).toBeDefined();
  });

  it('marks and retrieves dirty ranges correctly', () => {
    const tracker = new ChangeTracker(10000, [1]);

    tracker.markRange(1, 0, 10);
    tracker.markRange(1, 100, 120);

    const ranges: [number, number][] = [];
    tracker.forEachDirtyRange(1, 200, (start, end) => {
      ranges.push([start, end]);
    });

    // 0~10 と 100~120 はどちらもブロック0 (0~63) と ブロック1 (64~127) に入る。
    // ブロック単位なので、結果は連続してマージされる:
    // startRow = 0 (ブロック0), endRow = 128 (ブロック1)
    expect(ranges).toEqual([[0, 128]]);
  });

  it('handles empty ranges safely', () => {
    const tracker = new ChangeTracker(10000, [1]);
    tracker.markRange(1, 5, 5); // start == end
    const cb = vi.fn();
    tracker.forEachDirtyRange(1, 100, cb);
    expect(cb).not.toHaveBeenCalled();
  });

  it('caps ranges at maxCount', () => {
    const tracker = new ChangeTracker(10000, [1]);
    tracker.markRange(1, 0, 500);

    const ranges: [number, number][] = [];
    tracker.forEachDirtyRange(1, 150, (start, end) => {
      ranges.push([start, end]);
    });

    expect(ranges).toEqual([[0, 150]]);
  });

  it('clears dirty bits', () => {
    const tracker = new ChangeTracker(10000, [1]);
    tracker.markRange(1, 0, 100);
    tracker.clear(1);

    const cb = vi.fn();
    tracker.forEachDirtyRange(1, 200, cb);
    expect(cb).not.toHaveBeenCalled();
  });
});
