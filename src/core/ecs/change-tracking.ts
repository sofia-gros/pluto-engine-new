// @pluto-hot
/**
 * @file コンポーネント列の変更状態(Dirty)を64行ブロック単位で追跡する。
 */

import { assert } from '../debug/assert';

export const DIRTY_BLOCK_ROWS = 64;

/**
 * あるアーキタイプのすべてのフィールドについてのDirty状態を管理するトラッカー。
 * 1つのアーキタイプにつき1つ生成する。
 */
export class ChangeTracker {
  private readonly maxRows: number;
  private readonly blocksCount: number;
  // key: fieldId, value: Uint32Array (1 bit = 1 block of 64 rows)
  private readonly dirtyBits = new Map<number, Uint32Array>();

  /**
   * @param maxRows このアーキタイプの最大行数
   * @param fieldIds このアーキタイプが持つフィールドのIDリスト
   */
  public constructor(maxRows: number, fieldIds: readonly number[]) {
    this.maxRows = maxRows;
    this.blocksCount = Math.ceil(maxRows / DIRTY_BLOCK_ROWS);

    // blocksCount を 32 で割って、必要な Uint32Array の要素数を求める (1要素 = 32ビット = 2048行)
    const u32Count = Math.ceil(this.blocksCount / 32);

    for (const fieldId of fieldIds) {
      this.dirtyBits.set(fieldId, new Uint32Array(u32Count));
    }
  }

  /**
   * 指定したフィールドの指定した行範囲をdirtyとしてマークする。
   * @hot
   * @param fieldId フィールドID
   * @param startRow 開始行 (含む)
   * @param endRow 終了行 (含まない)
   */
  public markRange(fieldId: number, startRow: number, endRow: number): void {
    const bits = this.dirtyBits.get(fieldId);
    assert(bits !== undefined, 'ChangeTracker: 未知のフィールドです');
    assert(startRow <= endRow && endRow <= this.maxRows, 'ChangeTracker: 範囲が不正です');

    if (startRow === endRow) {
      return;
    }

    const startBlock = (startRow / DIRTY_BLOCK_ROWS) | 0;
    const endBlock = ((endRow - 1) / DIRTY_BLOCK_ROWS) | 0;

    for (let b = startBlock; b <= endBlock; b++) {
      const index = (b / 32) | 0;
      const bit = b % 32;
      bits[index] |= 1 << bit;
    }
  }

  /**
   * 指定したフィールドのdirtyとしてマークされた行範囲を列挙する。
   * 連続するdirtyブロックは1つの範囲に結合してコールバックを呼ぶ。
   * @hot
   * @param fieldId フィールドID
   * @param maxCount 現在の使用行数 (この行数未満の範囲のみを報告する)
   * @param cb コールバック (startRow, endRow)
   */
  public forEachDirtyRange(
    fieldId: number,
    maxCount: number,
    cb: (startRow: number, endRow: number) => void,
  ): void {
    const bits = this.dirtyBits.get(fieldId);
    assert(bits !== undefined, 'ChangeTracker: 未知のフィールドです');

    if (maxCount === 0) {
      return;
    }

    const maxBlock = ((maxCount - 1) / DIRTY_BLOCK_ROWS) | 0;
    const u32Count = bits.length;

    let inRange = false;
    let rangeStartRow = 0;

    for (let i = 0; i < u32Count; i++) {
      const word = bits[i];
      if (word === 0) {
        if (inRange) {
          // 範囲終了
          let endRow = i * 32 * DIRTY_BLOCK_ROWS;
          if (endRow > maxCount) endRow = maxCount;
          cb(rangeStartRow, endRow);
          inRange = false;
        }
        continue;
      }

      for (let bit = 0; bit < 32; bit++) {
        const b = i * 32 + bit;
        if (b > maxBlock) {
          break;
        }

        const isDirty = (word & (1 << bit)) !== 0;
        if (isDirty) {
          if (!inRange) {
            rangeStartRow = b * DIRTY_BLOCK_ROWS;
            inRange = true;
          }
        } else {
          if (inRange) {
            let endRow = b * DIRTY_BLOCK_ROWS;
            if (endRow > maxCount) endRow = maxCount;
            cb(rangeStartRow, endRow);
            inRange = false;
          }
        }
      }
    }

    if (inRange) {
      // 最後の範囲
      cb(rangeStartRow, maxCount);
    }
  }

  /**
   * 指定したフィールドのdirtyビットをすべてクリアする。
   * @hot
   * @param fieldId フィールドID
   */
  public clear(fieldId: number): void {
    const bits = this.dirtyBits.get(fieldId);
    assert(bits !== undefined, 'ChangeTracker: 未知のフィールドです');
    bits.fill(0);
  }
}
