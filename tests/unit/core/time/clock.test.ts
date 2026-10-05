import { describe, expect, it, vi, afterEach } from 'vitest';
import { PerformanceClock, ManualClock } from '../../../../src/core/time/clock';

describe('Clock', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('PerformanceClock', () => {
    it('returns performance.now()', () => {
      const mockPerformance = {
        now: vi.fn(() => 1234.5),
      };
      vi.stubGlobal('performance', mockPerformance);

      const clock = new PerformanceClock();
      expect(clock.now()).toBe(1234.5);
      expect(mockPerformance.now).toHaveBeenCalledTimes(1);
    });
  });

  describe('ManualClock', () => {
    it('initializes with 0 by default', () => {
      const clock = new ManualClock();
      expect(clock.now()).toBe(0);
    });

    it('initializes with given time', () => {
      const clock = new ManualClock(100);
      expect(clock.now()).toBe(100);
    });

    it('advances time correctly', () => {
      const clock = new ManualClock(100);
      clock.advance(50);
      expect(clock.now()).toBe(150);
    });

    it('does not advance if ms is negative or zero', () => {
      const clock = new ManualClock(100);
      clock.advance(-10);
      expect(clock.now()).toBe(100);
      clock.advance(0);
      expect(clock.now()).toBe(100);
    });
  });
});
