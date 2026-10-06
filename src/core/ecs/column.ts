// @pluto-hot
/**
 * @file 1 フィールド分の可変長 TypedArray カラム (docs/04-memory-and-ecs.md §4.1)。
 * 固定長バッファを使い、容量不足時は 2 倍の新しいバッファにコピーして差し替える (E-002)。
 * 伸長前に取得したビューは古くなるので、カラムは使うたびに取り直す。
 */
import { assert, unreachable } from '../debug';
import { SCALAR_BYTES, ScalarType, createBackingBuffer } from '../memory';
import type { AnyTypedArray, BackingBuffer, TypedArrayOf } from '../memory';

/** アーキタイプの初期行数。 */
export const INITIAL_ARCHETYPE_ROWS = 1024;

/**
 * 行数をバイト数 (8 の倍数に切り上げ) に変換する。
 * @param rows 行数
 * @param type スカラ型
 * @returns バイト数
 */
function rowsToBytes(rows: number, type: ScalarType): number {
  return (rows * SCALAR_BYTES[type] + 7) & ~7;
}

/**
 * バッファ全体を覆う TypedArray を作る。
 * @cold カラムの生成・伸長時にだけ呼ぶ
 * @param type スカラ型
 * @param buffer バッキングバッファ
 * @returns TypedArray
 */
export function createTrackingView(type: ScalarType, buffer: BackingBuffer): AnyTypedArray {
  switch (type) {
    case ScalarType.F32:
      return new Float32Array(buffer);
    case ScalarType.I32:
      return new Int32Array(buffer);
    case ScalarType.U32:
      return new Uint32Array(buffer);
    case ScalarType.I16:
      return new Int16Array(buffer);
    case ScalarType.U16:
      return new Uint16Array(buffer);
    case ScalarType.I8:
      return new Int8Array(buffer);
    case ScalarType.U8:
      return new Uint8Array(buffer);
    default:
      return unreachable(type);
  }
}

/**
 * 1 フィールド分の SoA カラム。
 */
export class Column<T extends ScalarType = ScalarType> {
  /** フィールドのスカラ型。 */
  public readonly type: T;
  /** バッキングバッファ (伸長すると差し替わる)。 */
  public buffer: BackingBuffer;
  /** バッファ全体のビュー (伸長すると差し替わる)。 */
  public data: TypedArrayOf<T>;
  private readonly maxRows: number;

  /**
   * @param type フィールドの型
   * @param maxRows 最大行数
   * @param shared 既存の共有バッファから作る場合に指定 (Worker のミラー用)
   */
  public constructor(type: T, maxRows: number, shared?: BackingBuffer) {
    this.type = type;
    this.maxRows = maxRows;
    this.buffer =
      shared ?? createBackingBuffer(rowsToBytes(Math.min(INITIAL_ARCHETYPE_ROWS, maxRows), type));
    this.data = createTrackingView(type, this.buffer) as TypedArrayOf<T>;
  }

  /** 現在確保している行数。 */
  public get capacity(): number {
    return this.data.length;
  }

  /**
   * 少なくとも `rows` 行入るように伸長する (2 倍ずつ、maxRows を上限)。伸長したら true。
   * @cold 伸長は対数回しか起きない
   * @param rows 必要な行数
   * @returns バッファを作り直したら true
   */
  public grow(rows: number): boolean {
    if (rows <= this.data.length) return false;
    assert(rows <= this.maxRows, 'Column: maxRows を超えて伸長しようとしました');
    let next = Math.max(this.data.length * 2, 1);
    while (next < rows) next *= 2;
    if (next > this.maxRows) next = this.maxRows;
    const buffer = createBackingBuffer(rowsToBytes(next, this.type));
    const data = createTrackingView(this.type, buffer) as TypedArrayOf<T>;
    data.set(this.data);
    this.buffer = buffer;
    this.data = data;
    return true;
  }

  /**
   * 共有バッファに差し替える (Worker のミラーがメインの伸長に追従するため)。
   * @cold 同期メッセージ受信時のみ
   * @param buffer 新しいバッファ
   */
  public rebind(buffer: BackingBuffer): void {
    this.buffer = buffer;
    this.data = createTrackingView(this.type, buffer) as TypedArrayOf<T>;
  }
}
