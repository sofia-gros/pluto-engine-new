import { describe, expect, it } from 'vitest';
import { f16ToF32, f32ToF16, packHalf2x16 } from '../../../../src/core/math/half';

/**
 * 期待値は Python の struct ('<e', IEEE 754 binary16、最近接偶数丸め) で
 * f32 に丸めた値を変換して求めたもの (T-R.3 のレビュー記録に計算手順を記載)。
 */
const KNOWN: readonly (readonly [number, number])[] = [
  [0, 0x0000],
  [-0, 0x8000],
  [1, 0x3c00],
  [-2, 0xc000],
  [65504, 0x7bff], // 最大の正規化数
  [65519, 0x7bff], // 65520 未満は 65504 に丸まる
  [65520, 0x7c00], // ちょうど中間は偶数側 (Inf)
  [6.1e-5, 0x03ff], // 最小正規化数 6.1035e-5 ではなく、最大の非正規化数に丸まる
  [2 ** -14, 0x0400], // 最小正規化数
  [2 ** -24, 0x0001], // 最小の非正規化数
  [2 ** -25, 0x0000], // ちょうど中間 → 偶数 (0)
  [2 ** -25 * 1.5, 0x0001],
  [2 ** -26, 0x0000],
  [2 ** -110, 0x0000], // 旧実装ではシフト量が 32 を超えて誤った値になっていた
  [1 + 2 ** -10, 0x3c01],
  [1 + 2 ** -11, 0x3c00], // 中間 → 偶数 (切り捨て側)
  [1 + 3 * 2 ** -11, 0x3c02], // 中間 → 偶数 (切り上げ側)
  [Infinity, 0x7c00],
  [-Infinity, 0xfc00],
];

describe('half', () => {
  it('f32ToF16 は既知値表と最近接偶数丸めでビット一致する', () => {
    for (const [value, bits] of KNOWN) {
      expect(f32ToF16(value), `value=${String(value)}`).toBe(bits);
    }
  });

  it('f16 → f32 → f16 の往復がビット一致する (全 65536 パターン、NaN は NaN のまま)', () => {
    for (let h = 0; h <= 0xffff; h++) {
      const f = f16ToF32(h);
      const isNaNBits = (h & 0x7c00) === 0x7c00 && (h & 0x03ff) !== 0;
      if (isNaNBits) {
        expect(Number.isNaN(f)).toBe(true);
        expect(Number.isNaN(f16ToF32(f32ToF16(f)))).toBe(true);
      } else {
        expect(f32ToF16(f)).toBe(h);
      }
    }
  });

  it('既知値表の f16 → f32 が正確な値を返す (6.1e-5 は 0x03ff の値になる)', () => {
    expect(f16ToF32(0x3c00)).toBe(1);
    expect(f16ToF32(0x7bff)).toBe(65504);
    expect(f16ToF32(0x0001)).toBe(2 ** -24);
    expect(f16ToF32(0x03ff)).toBe(1023 * 2 ** -24);
    expect(Object.is(f16ToF32(0x8000), -0)).toBe(true);
    expect(f16ToF32(0xfc00)).toBe(-Infinity);
  });

  it('NaN は quiet NaN に変換される', () => {
    const h = f32ToF16(NaN);
    expect(h & 0x7c00).toBe(0x7c00);
    expect(h & 0x0200).toBe(0x0200);
    expect(Number.isNaN(f16ToF32(h))).toBe(true);
  });

  it('packHalf2x16 は lo を下位、hi を上位 16 ビットに詰める', () => {
    expect(packHalf2x16(1, -2)).toBe(0xc0003c00);
    expect(packHalf2x16(0, 0)).toBe(0);
    expect(packHalf2x16(-0, Infinity)).toBe(0x7c008000);
  });
});
