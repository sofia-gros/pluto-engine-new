// @pluto-hot
/**
 * @file 2Dベクトル関数 (Float32Arrayベース、out出力)。
 */

/**
 * 新しい2Dベクトルを作成する。
 * @cold 初期化時に作業領域を確保するための関数 (フレーム中に呼ばない)
 * @returns [0, 0] で初期化された2Dベクトル
 */
export function create(): Float32Array {
  return new Float32Array(2);
}

/**
 * ベクトルの値を設定する。
 * @hot
 * @param out 出力ベクトル
 * @param x X成分
 * @param y Y成分
 * @returns out
 */
export function set(out: Float32Array, x: number, y: number): Float32Array {
  out[0] = x;
  out[1] = y;
  return out;
}

/**
 * ベクトルをコピーする。
 * @hot
 * @param out 出力ベクトル
 * @param a コピー元ベクトル
 * @returns out
 */
export function copy(out: Float32Array, a: Float32Array): Float32Array {
  out[0] = a[0];
  out[1] = a[1];
  return out;
}

/**
 * 2つのベクトルを加算する。
 * @hot
 * @param out 出力ベクトル
 * @param a 加算されるベクトル
 * @param b 加算するベクトル
 * @returns out
 */
export function add(out: Float32Array, a: Float32Array, b: Float32Array): Float32Array {
  out[0] = a[0] + b[0];
  out[1] = a[1] + b[1];
  return out;
}

/**
 * 2つのベクトルを減算する。
 * @hot
 * @param out 出力ベクトル
 * @param a 引かれるベクトル
 * @param b 引くベクトル
 * @returns out
 */
export function sub(out: Float32Array, a: Float32Array, b: Float32Array): Float32Array {
  out[0] = a[0] - b[0];
  out[1] = a[1] - b[1];
  return out;
}

/**
 * ベクトルをスカラー倍する。
 * @hot
 * @param out 出力ベクトル
 * @param a 対象ベクトル
 * @param s スカラー値
 * @returns out
 */
export function scale(out: Float32Array, a: Float32Array, s: number): Float32Array {
  out[0] = a[0] * s;
  out[1] = a[1] * s;
  return out;
}

/**
 * 2つのベクトルの内積を計算する。
 * @hot
 * @param a ベクトルA
 * @param b ベクトルB
 * @returns 内積
 */
export function dot(a: Float32Array, b: Float32Array): number {
  return a[0] * b[0] + a[1] * b[1];
}

/**
 * 2つのベクトルの外積（2DでのZ成分）を計算する。
 * @hot
 * @param a ベクトルA
 * @param b ベクトルB
 * @returns 外積のZ成分
 */
export function cross(a: Float32Array, b: Float32Array): number {
  return a[0] * b[1] - a[1] * b[0];
}

/**
 * ベクトルの長さの二乗を計算する。
 * @hot
 * @param a ベクトル
 * @returns 長さの二乗
 */
export function lenSq(a: Float32Array): number {
  const x = a[0];
  const y = a[1];
  return x * x + y * y;
}

/**
 * ベクトルの長さを計算する。
 * @hot
 * @param a ベクトル
 * @returns 長さ
 */
export function len(a: Float32Array): number {
  const x = a[0];
  const y = a[1];
  return Math.sqrt(x * x + y * y);
}

/**
 * ベクトルを正規化する。
 * @hot
 * @param out 出力ベクトル
 * @param a 対象ベクトル
 * @returns out
 */
export function normalize(out: Float32Array, a: Float32Array): Float32Array {
  const x = a[0];
  const y = a[1];
  let l = x * x + y * y;
  if (l > 0) {
    l = 1 / Math.sqrt(l);
  }
  out[0] = x * l;
  out[1] = y * l;
  return out;
}
