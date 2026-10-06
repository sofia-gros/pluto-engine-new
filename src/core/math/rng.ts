// @pluto-hot
/**
 * @file xoshiro128** アルゴリズムの乱数生成器。
 */

/**
 * xoshiro128** の状態を持つ乱数生成器。
 */
export interface Rng {
  /**
   * 次の乱数を生成する。
   * @returns 32ビット符号なし整数
   */
  next(): number;
  /**
   * 次の 0.0 以上 1.0 未満の浮動小数点乱数を生成する。
   * @returns 0.0 <= x < 1.0 の浮動小数点数
   */
  nextFloat(): number;
}

function rotl(x: number, k: number): number {
  return (x << k) | (x >>> (32 - k));
}

function splitmix32(state: { s: number }): number {
  state.s = (state.s + 0x9e3779b9) | 0;
  let z = state.s;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b);
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35);
  return (z ^ (z >>> 16)) >>> 0;
}

/**
 * 指定したシードで xoshiro128** 乱数生成器を作成する。
 * シードは splitmix32 で 4 語の状態に展開する (状態がすべて 0 のときは s0 = 1)。
 * @see Blackman & Vigna, "Scrambled Linear Pseudorandom Number Generators", 2018 (xoshiro128**)
 * @cold 生成器の作成は初期化時に行う (next / nextFloat は HOT)
 * @param seed シード値
 * @returns Rng オブジェクト
 */
export function createRng(seed: number): Rng {
  const smState = { s: seed };
  let s0 = splitmix32(smState);
  let s1 = splitmix32(smState);
  let s2 = splitmix32(smState);
  let s3 = splitmix32(smState);

  if (s0 === 0 && s1 === 0 && s2 === 0 && s3 === 0) {
    s0 = 1;
  }

  return {
    next(): number {
      const result = Math.imul(rotl((s1 * 5) | 0, 7), 9) >>> 0;

      const t = s1 << 9;

      s2 ^= s0;
      s3 ^= s1;
      s1 ^= s2;
      s0 ^= s3;

      s2 ^= t;
      s3 = rotl(s3, 11);

      s0 >>>= 0;
      s1 >>>= 0;
      s2 >>>= 0;
      s3 >>>= 0;

      return result;
    },
    nextFloat(): number {
      return (this.next() >>> 8) * 0.000000059604644775390625;
    },
  };
}
