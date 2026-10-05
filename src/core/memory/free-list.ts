// @pluto-hot
/**
 * @file u32 インデックスの再利用スタック。
 */

/**
 * u32 インデックスの再利用スタック (LIFO)。
 */
export class FreeList {
  private readonly data: Uint32Array;
  private count: number;

  /**
   * @param capacity 最大要素数
   */
  public constructor(capacity: number) {
    this.data = new Uint32Array(capacity);
    this.count = 0;
  }

  /**
   * 空かどうかを判定する。
   * @hot
   * @returns 空であれば true
   */
  public isEmpty(): boolean {
    return this.count === 0;
  }

  /**
   * インデックスを追加 (解放) する。
   * @hot
   * @param index 追加するインデックス
   */
  public push(index: number): void {
    this.data[this.count++] = index;
  }

  /**
   * インデックスを取り出し (再利用) する。
   * @hot
   * @returns 取り出したインデックス
   */
  public pop(): number {
    return this.data[--this.count];
  }
}
