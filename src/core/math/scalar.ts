// @pluto-hot
/**
 * @file スカラー演算関数と定数。
 */

export const DEG_TO_RAD = Math.PI / 180.0;
export const RAD_TO_DEG = 180.0 / Math.PI;
export const EPSILON = 0.000001;

/**
 * 値を指定した範囲にクランプする。
 * @hot
 * @param value 値
 * @param min 最小値
 * @param max 最大値
 * @returns クランプされた値
 */
export function clamp(value: number, min: number, max: number): number {
  return value < min ? min : value > max ? max : value;
}

/**
 * 線形補間を行う。
 * @hot
 * @param a 開始値
 * @param b 終了値
 * @param t 補間係数 (0.0 - 1.0)
 * @returns 補間結果
 */
export function lerp(a: number, b: number, t: number): number {
  return a + (b - a) * t;
}

/**
 * 逆線形補間を行う。
 * @hot
 * @param a 開始値
 * @param b 終了値
 * @param value 値
 * @returns 補間係数 (a と b の間にある場合 0.0 - 1.0)
 */
export function inverseLerp(a: number, b: number, value: number): number {
  return a !== b ? (value - a) / (b - a) : 0;
}

/**
 * スムースステップ補間を行う。
 * @hot
 * @param min 最小値
 * @param max 最大値
 * @param value 値
 * @returns 補間係数 (0.0 - 1.0)
 */
export function smoothstep(min: number, max: number, value: number): number {
  let x = (value - min) / (max - min);
  x = x < 0.0 ? 0.0 : x > 1.0 ? 1.0 : x;
  return x * x * (3 - 2 * x);
}

/**
 * 値を指定した範囲にラップする。
 * @hot
 * @param value 値
 * @param min 最小値
 * @param max 最大値
 * @returns ラップされた値
 */
export function wrap(value: number, min: number, max: number): number {
  const range = max - min;
  return min + ((((value - min) % range) + range) % range);
}

/**
 * 2つの値が近似的に等しいか判定する。
 * @hot
 * @param a 値A
 * @param b 値B
 * @param epsilon 許容誤差
 * @returns 近似的に等しければ true
 */
export function approxEqual(a: number, b: number, epsilon: number = EPSILON): boolean {
  return Math.abs(a - b) <= epsilon;
}
