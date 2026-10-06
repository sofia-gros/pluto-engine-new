import { describe, expect, it } from 'vitest';
import { createRng } from '../../../../src/core/math/rng';

/**
 * 参照列は Vigna の参照実装 (xoshiro128starstar.c) を Python に書き写し、
 * splitmix32 によるシード展開 (rng.ts と同じ定数) と組み合わせて独立に計算したもの。
 * 書き写しの正しさは、状態 {1, 2, 3, 4} の出力 11520, 0, 5927040, 70819200 … で確認済み (T-R.3 レビュー記録)。
 */
const REFERENCE: Readonly<Record<number, readonly number[]>> = {
  12345: [
    518667457, 440444462, 4232892992, 3757857622, 3939018813, 1334683535, 3795058715, 2092637810,
  ],
  0: [3809008728, 1133695204, 53579671, 2891528803, 139681546, 2203266335, 104831812, 1587294886],
};

describe('rng', () => {
  it('シード 12345 の先頭 8 個が参照実装の出力列と一致する', () => {
    const r = createRng(12345);
    expect(Array.from({ length: 8 }, () => r.next())).toEqual(REFERENCE[12345]);
  });

  it('シード 0 (境界値) でも参照実装の出力列と一致する', () => {
    const r = createRng(0);
    expect(Array.from({ length: 8 }, () => r.next())).toEqual(REFERENCE[0]);
  });

  it('同じシードからは同じ列が生成される', () => {
    const r1 = createRng(42);
    const r2 = createRng(42);
    for (let i = 0; i < 100; i++) {
      expect(r1.next()).toBe(r2.next());
      expect(r1.nextFloat()).toBe(r2.nextFloat());
    }
  });

  it('next は 32 ビット符号なし整数、nextFloat は [0, 1) を返す', () => {
    const r = createRng(7);
    for (let i = 0; i < 1000; i++) {
      const u = r.next();
      expect(Number.isInteger(u) && u >= 0 && u <= 0xffffffff).toBe(true);
      const f = r.nextFloat();
      expect(f >= 0 && f < 1).toBe(true);
    }
  });

  it('nextFloat は next の上位 24 ビットを 2^-24 倍した値である', () => {
    const a = createRng(99);
    const b = createRng(99);
    for (let i = 0; i < 16; i++) {
      expect(a.nextFloat()).toBe((b.next() >>> 8) * 2 ** -24);
    }
  });
});
