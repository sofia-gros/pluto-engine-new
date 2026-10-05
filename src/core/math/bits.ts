// @pluto-hot
/**
 * @file ビット演算関数。
 */

/**
 * 指定した値以上の最小の2の冪乗を求める。
 * @hot
 * @param n 値
 * @returns 最小の2の冪乗
 */
export function nextPow2(n: number): number {
  let v = (n >>> 0) - 1;
  v |= v >>> 1;
  v |= v >>> 2;
  v |= v >>> 4;
  v |= v >>> 8;
  v |= v >>> 16;
  return v + 1;
}

/**
 * 値が2の冪乗か判定する。
 * @hot
 * @param n 値
 * @returns 2の冪乗であれば true
 */
export function isPow2(n: number): boolean {
  const v = n >>> 0;
  return v !== 0 && (v & (v - 1)) === 0;
}

/**
 * 32ビット整数の立っているビットの数を数える (Population count)。
 * @hot
 * @param n 値
 * @returns ビット数
 */
export function popcount32(n: number): number {
  let v = n >>> 0;
  v = v - ((v >>> 1) & 0x55555555);
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  v = (v + (v >>> 4)) & 0x0f0f0f0f;
  return (v * 0x01010101) >>> 24;
}

/**
 * 32ビット整数の最下位から連続する0のビット数を数える (Count trailing zeros)。
 * @hot
 * @param n 値
 * @returns 連続する0のビット数
 */
export function ctz32(n: number): number {
  const v = n >>> 0;
  if (v === 0) return 32;
  return popcount32((v & -v) - 1);
}

/**
 * 32ビット整数の底が2の対数の切り捨てを求める (最上位ビットの位置)。
 * @hot
 * @param n 値
 * @returns 対数
 */
export function log2Floor(n: number): number {
  const v = n >>> 0;
  if (v === 0) return 0;
  return 31 - Math.clz32(v);
}
