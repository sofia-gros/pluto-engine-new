// @pluto-hot
/**
 * @file 固定長 TypedArray リングバッファ。
 */

/** リングバッファに使える TypedArray。 */
export type AnyTypedArray =
  Float32Array | Int32Array | Uint32Array | Int16Array | Uint16Array | Int8Array | Uint8Array;

/**
 * 任意の TypedArray を用いたリングバッファ。
 */
export class RingBuffer<T extends AnyTypedArray> {
  /** バッキング配列。 */
  public readonly data: T;
  /** 格納できる要素数。 */
  public readonly capacity: number;
  private head: number;
  private count: number;

  /**
   * @param data バッキング配列
   */
  public constructor(data: T) {
    this.data = data;
    this.capacity = data.length;
    this.head = 0;
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
   * 満杯かどうかを判定する。
   * @hot
   * @returns 満杯であれば true
   */
  public isFull(): boolean {
    return this.count === this.capacity;
  }

  /**
   * 要素を末尾に追加する。
   * @hot
   * @param value 追加する値
   * @returns 成功した場合は true、満杯の場合は false
   */
  public push(value: number): boolean {
    if (this.count === this.capacity) {
      return false;
    }
    const tail = (this.head + this.count) % this.capacity;
    this.data[tail] = value;
    this.count++;
    return true;
  }

  /**
   * 先頭から要素を取り出す。
   * @hot
   * @returns 取り出した値、または空の場合は 0
   */
  public shift(): number {
    if (this.count === 0) {
      return 0;
    }
    const value = this.data[this.head];
    this.head = (this.head + 1) % this.capacity;
    this.count--;
    return value;
  }

  /**
   * 現在の要素数を返す。
   * @hot
   * @returns 要素数
   */
  public size(): number {
    return this.count;
  }
}
