// @pluto-hot
/**
 * @file AABB (軸並行境界箱) の演算。
 */

/**
 * 新しいAABBを作成する。
 * @returns [0, 0, 0, 0] で初期化された Float32Array
 */
export function create(): Float32Array {
  return new Float32Array(4);
}

/**
 * AABBの値を設定する。
 * @hot
 * @param out 出力AABB
 * @param minX 最小X
 * @param minY 最小Y
 * @param maxX 最大X
 * @param maxY 最大Y
 * @returns out
 */
export function set(
  out: Float32Array,
  minX: number,
  minY: number,
  maxX: number,
  maxY: number,
): Float32Array {
  out[0] = minX;
  out[1] = minY;
  out[2] = maxX;
  out[3] = maxY;
  return out;
}

/**
 * AABBをコピーする。
 * @hot
 * @param out 出力AABB
 * @param a コピー元AABB
 * @returns out
 */
export function copy(out: Float32Array, a: Float32Array): Float32Array {
  out[0] = a[0];
  out[1] = a[1];
  out[2] = a[2];
  out[3] = a[3];
  return out;
}

/**
 * 2つのAABBが交差しているか判定する。
 * @hot
 * @param a AABB A
 * @param b AABB B
 * @returns 交差していれば true
 */
export function intersects(a: Float32Array, b: Float32Array): boolean {
  return a[0] <= b[2] && a[2] >= b[0] && a[1] <= b[3] && a[3] >= b[1];
}

/**
 * AABBが点を含んでいるか判定する。
 * @hot
 * @param a AABB
 * @param x 点のX座標
 * @param y 点のY座標
 * @returns 含んでいれば true
 */
export function containsPoint(a: Float32Array, x: number, y: number): boolean {
  return x >= a[0] && x <= a[2] && y >= a[1] && y <= a[3];
}
