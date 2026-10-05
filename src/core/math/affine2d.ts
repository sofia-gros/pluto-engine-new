// @pluto-hot
/**
 * @file 2x3 アフィン変換行列関数 (Float32Array(6)ベース、out出力)。
 */

/**
 * 新しい単位行列を作成する。
 * @returns [1, 0, 0, 1, 0, 0] で初期化された行列
 */
export function create(): Float32Array {
  const out = new Float32Array(6);
  out[0] = 1;
  out[3] = 1;
  return out;
}

/**
 * 行列に単位行列を設定する。
 * @hot
 * @param out 出力行列
 * @returns out
 */
export function identity(out: Float32Array): Float32Array {
  out[0] = 1;
  out[1] = 0;
  out[2] = 0;
  out[3] = 1;
  out[4] = 0;
  out[5] = 0;
  return out;
}

/**
 * 行列をコピーする。
 * @hot
 * @param out 出力行列
 * @param a コピー元行列
 * @returns out
 */
export function copy(out: Float32Array, a: Float32Array): Float32Array {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];
  out[4] = a[4];
  out[5] = a[5];
  return out;
}

/**
 * 2つの行列の積を計算する (out = a * b)。
 * @hot
 * @param out 出力行列
 * @param a 左側の行列
 * @param b 右側の行列
 * @returns out
 */
export function multiply(out: Float32Array, a: Float32Array, b: Float32Array): Float32Array {
  const a0 = a[0];
  const a1 = a[1];
  const a2 = a[2];
  const a3 = a[3];
  const a4 = a[4];
  const a5 = a[5];

  const b0 = b[0];
  const b1 = b[1];
  const b2 = b[2];
  const b3 = b[3];
  const b4 = b[4];
  const b5 = b[5];

  out[0] = a0 * b0 + a2 * b1;
  out[1] = a1 * b0 + a3 * b1;
  out[2] = a0 * b2 + a2 * b3;
  out[3] = a1 * b2 + a3 * b3;
  out[4] = a0 * b4 + a2 * b5 + a4;
  out[5] = a1 * b4 + a3 * b5 + a5;
  return out;
}

/**
 * 行列の逆行列を計算する。
 * @hot
 * @param out 出力行列
 * @param a 対象行列
 * @returns 成功した場合は out、行列式が0の場合は null
 */
export function invert(out: Float32Array, a: Float32Array): Float32Array | null {
  const a0 = a[0];
  const a1 = a[1];
  const a2 = a[2];
  const a3 = a[3];
  const a4 = a[4];
  const a5 = a[5];

  let det = a0 * a3 - a1 * a2;

  if (det === 0) {
    return null;
  }

  det = 1.0 / det;

  out[0] = a3 * det;
  out[1] = -a1 * det;
  out[2] = -a2 * det;
  out[3] = a0 * det;
  out[4] = (a2 * a5 - a3 * a4) * det;
  out[5] = (a1 * a4 - a0 * a5) * det;

  return out;
}

/**
 * 2Dベクトルに行列を適用して座標変換を行う。
 * @hot
 * @param out 出力ベクトル (サイズ2)
 * @param m 変換行列
 * @param v 対象ベクトル
 * @returns out
 */
export function transformVec2(out: Float32Array, m: Float32Array, v: Float32Array): Float32Array {
  const x = v[0];
  const y = v[1];
  out[0] = m[0] * x + m[2] * y + m[4];
  out[1] = m[1] * x + m[3] * y + m[5];
  return out;
}
