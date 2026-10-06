// @pluto-hot
/**
 * @file Uint32Array ベースの固定長ビットセット。
 */

/**
 * 固定長ビットセット。
 */
export class Bitset {
  /** ビットを格納する語の配列 (1 語 = 32 ビット)。 */
  public readonly data: Uint32Array;
  /** ビット数。 */
  public readonly capacity: number;

  /**
   * @param capacity ビット数
   */
  public constructor(capacity: number) {
    this.capacity = capacity;
    this.data = new Uint32Array(Math.ceil(capacity / 32));
  }

  /**
   * 指定したビットを立てる。
   * @hot
   * @param index ビットインデックス
   */
  public set(index: number): void {
    const wordIndex = index >>> 5;
    const bitIndex = index & 31;
    this.data[wordIndex] |= 1 << bitIndex;
  }

  /**
   * 指定したビットを降ろす。
   * @hot
   * @param index ビットインデックス
   */
  public clear(index: number): void {
    const wordIndex = index >>> 5;
    const bitIndex = index & 31;
    this.data[wordIndex] &= ~(1 << bitIndex);
  }

  /**
   * 指定したビットが立っているか判定する。
   * @hot
   * @param index ビットインデックス
   * @returns 立っていれば true
   */
  public test(index: number): boolean {
    const wordIndex = index >>> 5;
    const bitIndex = index & 31;
    return (this.data[wordIndex] & (1 << bitIndex)) !== 0;
  }

  /**
   * すべてのビットを 0 にクリアする。
   */
  public clearAll(): void {
    this.data.fill(0);
  }
}
