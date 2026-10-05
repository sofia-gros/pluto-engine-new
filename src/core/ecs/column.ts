// @pluto-hot
/**
 * @file 単一のフィールドのデータを保持する列バッファ。
 */

import { assert } from '../debug/assert';
import { ScalarType, SCALAR_BYTES } from '../memory/scalar-type';
import type { TypedArrayOf } from '../memory/scalar-type';
import { createBackingBuffer } from '../memory/buffer-factory';

export const INITIAL_ARCHETYPE_ROWS = 1024;

/**
 * ArrayBuffer から特定の型の TypedArray を生成する。
 */
function createTypedArray<T extends ScalarType>(
  type: T,
  buffer: ArrayBufferLike,
  offset: number,
  length: number,
): TypedArrayOf<T> {
  switch (type) {
    case ScalarType.F32:
      return new Float32Array(buffer, offset, length) as TypedArrayOf<T>;
    case ScalarType.I32:
      return new Int32Array(buffer, offset, length) as TypedArrayOf<T>;
    case ScalarType.U32:
      return new Uint32Array(buffer, offset, length) as TypedArrayOf<T>;
    case ScalarType.I16:
      return new Int16Array(buffer, offset, length) as TypedArrayOf<T>;
    case ScalarType.U16:
      return new Uint16Array(buffer, offset, length) as TypedArrayOf<T>;
    case ScalarType.I8:
      return new Int8Array(buffer, offset, length) as TypedArrayOf<T>;
    case ScalarType.U8:
      return new Uint8Array(buffer, offset, length) as TypedArrayOf<T>;
    default:
      throw new Error(`未対応の ScalarType: ${String(type)}`);
  }
}

/**
 * 1つのフィールドに対応するSoA用の配列。
 */
export class Column<T extends ScalarType = ScalarType> {
  public readonly type: T;
  private readonly maxRows: number;
  private currentRows: number;
  private buffer: ArrayBufferLike;
  public data: TypedArrayOf<T>;

  /**
   * @param type フィールドの型
   * @param maxRows 最大行数 (WorldConfig.maxEntities など)
   */
  public constructor(type: T, maxRows: number) {
    this.type = type;
    this.maxRows = maxRows;
    this.currentRows = Math.min(INITIAL_ARCHETYPE_ROWS, this.maxRows);

    const bytesPerElement = SCALAR_BYTES[type];
    const initialBytes = (this.currentRows * bytesPerElement + 7) & ~7;
    const maxBytes = (this.maxRows * bytesPerElement + 7) & ~7;

    // SharedArrayBuffer (並列ビルド) に対応するため buffer-factory を経由する
    this.buffer = createBackingBuffer(initialBytes, maxBytes);
    this.data = createTypedArray(type, this.buffer, 0, this.currentRows);
  }

  /**
   * バッファを行数に合わせて拡張する。
   * (SharedArrayBuffer であればリサイズ済みの可能性が高いが、ArrayBuffer の場合は新しいバッファを作成してコピーする)
   * @param newRows 必要な行数
   */
  public grow(newRows: number): void {
    if (newRows <= this.currentRows) {
      return;
    }

    assert(newRows <= this.maxRows, 'Column: maxRows を超えて拡張しようとしました');

    let nextRows = this.currentRows * 2;
    while (nextRows < newRows) {
      nextRows *= 2;
    }
    if (nextRows > this.maxRows) {
      nextRows = this.maxRows;
    }

    const bytesPerElement = SCALAR_BYTES[this.type];
    const newBytes = (nextRows * bytesPerElement + 7) & ~7;
    const maxBytes = (this.maxRows * bytesPerElement + 7) & ~7;
    const newBuffer = createBackingBuffer(newBytes, maxBytes);
    const newData = createTypedArray(this.type, newBuffer, 0, nextRows);

    newData.set(this.data);

    this.buffer = newBuffer;
    this.data = newData;
    this.currentRows = nextRows;
  }
}
