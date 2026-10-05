// @pluto-hot
/**
 * @file 半精度浮動小数点 (f16) 関数。
 */

const floatView = new Float32Array(1);
const int32View = new Int32Array(floatView.buffer);

/**
 * 単精度浮動小数点 (f32) を半精度 (f16) に変換する。
 * @hot
 * @param val 単精度浮動小数点
 * @returns 半精度浮動小数点 (16ビット整数)
 */
export function packHalf2x16(val: number): number {
  floatView[0] = val;
  const f32bits = int32View[0];

  const sign = (f32bits >>> 16) & 0x8000;
  let valAbs = f32bits & 0x7fffffff;

  if (valAbs >= 0x47800000) {
    // infinity or NaN
    if (valAbs > 0x7f800000) {
      // NaN
      return sign | 0x7c00 | ((valAbs >>> 13) & 0x3ff);
    }
    return sign | 0x7c00; // infinity
  }

  if (valAbs < 0x38800000) {
    // denormalized or zero
    const shift = 113 - (valAbs >>> 23);
    valAbs = (0x00800000 | (valAbs & 0x007fffff)) >>> shift;
    return sign | (valAbs >>> 13);
  }

  // normalized
  return sign | ((valAbs - 0x38000000) >>> 13);
}

/**
 * 半精度浮動小数点 (f16) を単精度浮動小数点 (f32) に変換する。
 * @hot
 * @param h 半精度浮動小数点 (16ビット整数)
 * @returns 単精度浮動小数点
 */
export function unpackHalf2x16(h: number): number {
  const sign = (h & 0x8000) << 16;
  const exp = (h & 0x7c00) >> 10;
  const frac = h & 0x03ff;

  if (exp === 0) {
    if (frac === 0) {
      int32View[0] = sign;
      return floatView[0];
    }
    // denormalized
    let e = -14;
    let m = frac;
    while ((m & 0x0400) === 0) {
      m <<= 1;
      e--;
    }
    int32View[0] = sign | ((e + 127) << 23) | ((m & 0x03ff) << 13);
    return floatView[0];
  }

  if (exp === 0x1f) {
    // Inf or NaN
    int32View[0] = sign | 0x7f800000 | (frac << 13);
    return floatView[0];
  }

  int32View[0] = sign | ((exp + 112) << 23) | (frac << 13);
  return floatView[0];
}
