// @pluto-hot
/**
 * @file 64 行ブロック単位の dirty ビット管理 (docs/04-memory-and-ecs.md §6)。
 * ビット配列は固定長の backing buffer 上に置き (最大行数分を最初に確保。小さいので伸長しない)、Worker のカーネルからも `markDirty` できる。
 * チャンク (16384 行 = 256 ブロック = 8 語) は語の境界に揃うので、カーネルからの書込に Atomics は不要。
 */
import { assert } from '../debug';
import { createBackingBuffer } from '../memory';
import type { BackingBuffer } from '../memory';

/** dirty ビット 1 つが表す行数。 */
export const DIRTY_BLOCK_ROWS = 64;

/** 共有用の記述 (フィールド ID と dirty ビットのバッファ)。 */
export interface SharedDirtyDesc {
  /** フィールド ID。 */
  readonly fieldId: number;
  /** dirty ビットのバッファ。 */
  readonly buffer: BackingBuffer;
}

/** dirty 範囲を受け取るコールバック。 */
export type DirtyRangeCallback = (startRow: number, endRow: number) => void;

/**
 * 1 つのアーキタイプの全フィールドの dirty 状態。
 */
export class ChangeTracker {
  private readonly maxRows: number;
  /** fieldId → dirty ビット (疎な配列)。 */
  private readonly bitsByField: (Uint32Array | undefined)[] = [];
  private readonly shared: SharedDirtyDesc[] = [];

  /**
   * @param maxRows アーキタイプの最大行数
   * @param fieldIds 追跡するフィールド ID
   * @param sharedBuffers 既存の共有バッファから作る場合に指定 (Worker のミラー用。fieldIds と同じ順)
   */
  public constructor(
    maxRows: number,
    fieldIds: readonly number[],
    sharedBuffers?: readonly BackingBuffer[],
  ) {
    this.maxRows = maxRows;
    const words = Math.ceil(Math.ceil(maxRows / DIRTY_BLOCK_ROWS) / 32);
    const bytes = (words * 4 + 7) & ~7;
    for (let i = 0; i < fieldIds.length; i++) {
      const buffer = sharedBuffers?.[i] ?? createBackingBuffer(bytes);
      this.bitsByField[fieldIds[i]] = new Uint32Array(buffer, 0, words);
      this.shared.push({ fieldId: fieldIds[i], buffer });
    }
  }

  /** Worker に送るための共有記述。 */
  public get sharedDescs(): readonly SharedDirtyDesc[] {
    return this.shared;
  }

  /**
   * フィールドのビット配列を返す。
   * @hot
   * @param fieldId フィールド ID
   * @returns ビット配列
   */
  private bitsOf(fieldId: number): Uint32Array {
    const bits = this.bitsByField[fieldId];
    assert(bits !== undefined, 'ChangeTracker: 追跡していないフィールドです');
    return bits;
  }

  /**
   * 行範囲 [startRow, endRow) を dirty にする。
   * @hot
   * @param fieldId フィールド ID
   * @param startRow 開始行 (含む)
   * @param endRow 終了行 (含まない)
   */
  public markRange(fieldId: number, startRow: number, endRow: number): void {
    const bits = this.bitsOf(fieldId);
    assert(startRow <= endRow && endRow <= this.maxRows, 'ChangeTracker: 範囲が不正です');
    if (startRow === endRow) return;
    const startBlock = (startRow / DIRTY_BLOCK_ROWS) | 0;
    const endBlock = ((endRow - 1) / DIRTY_BLOCK_ROWS) | 0;
    for (let b = startBlock; b <= endBlock; b++) {
      bits[b >>> 5] |= 1 << (b & 31);
    }
  }

  /**
   * dirty な行範囲を列挙する。連続するブロックは 1 つの範囲に結合し、`rowCount` で切り詰める。
   * @hot
   * @param fieldId フィールド ID
   * @param rowCount 現在の行数
   * @param cb コールバック (startRow, endRow)
   */
  public forEachDirtyRange(fieldId: number, rowCount: number, cb: DirtyRangeCallback): void {
    const bits = this.bitsOf(fieldId);
    if (rowCount <= 0) return;
    const lastBlock = ((rowCount - 1) / DIRTY_BLOCK_ROWS) | 0;
    let rangeStart = -1;
    let b = 0;
    while (b <= lastBlock) {
      const word = bits[b >>> 5];
      if (word === 0 && (b & 31) === 0) {
        // 32 ブロックまとめて clean なので語ごと飛ばす
        if (rangeStart >= 0) {
          cb(rangeStart, Math.min(b * DIRTY_BLOCK_ROWS, rowCount));
          rangeStart = -1;
        }
        b += 32;
        continue;
      }
      const isDirty = (word & (1 << (b & 31))) !== 0;
      if (isDirty && rangeStart < 0) {
        rangeStart = b * DIRTY_BLOCK_ROWS;
      } else if (!isDirty && rangeStart >= 0) {
        cb(rangeStart, b * DIRTY_BLOCK_ROWS);
        rangeStart = -1;
      }
      b++;
    }
    if (rangeStart >= 0) cb(rangeStart, rowCount);
  }

  /**
   * フィールドの dirty ビットをすべて消す。
   * @hot
   * @param fieldId フィールド ID
   */
  public clear(fieldId: number): void {
    this.bitsOf(fieldId).fill(0);
  }
}
