import { describe, expect, it } from 'vitest';
import { createRng } from '../../../../src/core/math/rng';

describe('rng', () => {
  it('should generate same sequence for same seed', () => {
    const r1 = createRng(12345);
    const r2 = createRng(12345);

    for (let i = 0; i < 100; i++) {
      expect(r1.next()).toBe(r2.next());
      expect(r1.nextFloat()).toBe(r2.nextFloat());
    }
  });

  it('should generate numbers in expected ranges', () => {
    const r = createRng(42);
    for (let i = 0; i < 100; i++) {
      const f = r.nextFloat();
      expect(f).toBeGreaterThanOrEqual(0);
      expect(f).toBeLessThan(1);
    }
  });
});
