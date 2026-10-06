// @pluto-hot
/**
 * @file 半精度浮動小数点 (IEEE 754 binary16) の変換。
 * スプライトの scale / rotation (`docs/07-renderer.md` §3) を 16 ビットに詰めるために使う。
 * f32 → f16 は最近接偶数丸め (round-half-to-even)。
 */

const floatView = new Float32Array(1);
const uint32View = new Uint32Array(floatView.buffer);

/**
 * 数値を f32 に丸めたうえで f16 のビット列に変換する。
 * 範囲外は ±Infinity、NaN は quiet NaN、極小値は ±0 または非正規化数になる。
 * @hot
 * @param value 変換する値
 * @returns f16 のビット列 (0〜0xFFFF)
 */
export function f32ToF16(value: number): number {
  floatView[0] = value;
  const bits = uint32View[0];
  const sign = (bits >>> 16) & 0x8000;
  const exp = (bits >>> 23) & 0xff;
  const mant = bits & 0x7fffff;

  if (exp === 0xff) {
    // Inf (仮数 0) / NaN (quiet ビットを立てて保持)
    return mant === 0 ? sign | 0x7c00 : sign | 0x7e00 | (mant >>> 13);
  }
  const halfExp = exp - 112; // f32 のバイアス 127 → f16 のバイアス 15
  if (halfExp >= 0x1f) return sign | 0x7c00; // 桁あふれ → Inf
  if (halfExp <= 0) {
    // 非正規化数または 0。暗黙の 1 を付けた仮数を右シフトして丸める
    const shift = 14 - halfExp;
    if (shift > 24) return sign; // 2^-25 未満は 0 に丸まる (ちょうど 2^-25 は偶数丸めで 0)
    const m = mant | 0x800000;
    const result = m >>> shift;
    const rem = m & ((1 << shift) - 1);
    const halfway = 1 << (shift - 1);
    const shouldRoundUp = rem > halfway || (rem === halfway && (result & 1) === 1);
    return sign | (result + (shouldRoundUp ? 1 : 0));
  }
  // 正規化数。仮数の下位 13 ビットで丸める (繰り上がりで指数・Inf に進むのも正しい表現)
  const result = (halfExp << 10) | (mant >>> 13);
  const rem = mant & 0x1fff;
  const shouldRoundUp = rem > 0x1000 || (rem === 0x1000 && (result & 1) === 1);
  return sign | (result + (shouldRoundUp ? 1 : 0));
}

/**
 * f16 のビット列を数値に変換する (誤差なし)。
 * @hot
 * @param h f16 のビット列 (下位 16 ビットを使う)
 * @returns 数値
 */
export function f16ToF32(h: number): number {
  const sign = (h & 0x8000) << 16;
  const exp = (h & 0x7c00) >>> 10;
  const frac = h & 0x03ff;

  if (exp === 0) {
    if (frac === 0) {
      uint32View[0] = sign >>> 0;
      return floatView[0];
    }
    // 非正規化数: 先頭の 1 が現れるまで正規化する
    let e = -14;
    let m = frac;
    while ((m & 0x0400) === 0) {
      m <<= 1;
      e--;
    }
    uint32View[0] = (sign | ((e + 127) << 23) | ((m & 0x03ff) << 13)) >>> 0;
    return floatView[0];
  }
  if (exp === 0x1f) {
    uint32View[0] = (sign | 0x7f800000 | (frac << 13)) >>> 0;
    return floatView[0];
  }
  uint32View[0] = (sign | ((exp + 112) << 23) | (frac << 13)) >>> 0;
  return floatView[0];
}

/**
 * 2 つの値を f16 に変換して 1 つの u32 に詰める (GLSL / WGSL の `packHalf2x16` と同じ配置)。
 * @hot
 * @param lo 下位 16 ビットに入れる値
 * @param hi 上位 16 ビットに入れる値
 * @returns 詰めた u32
 */
export function packHalf2x16(lo: number, hi: number): number {
  return (f32ToF16(lo) | (f32ToF16(hi) << 16)) >>> 0;
}
