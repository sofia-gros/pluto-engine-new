/**
 * @file バイト範囲などを管理する汎用的な first-fit 範囲アロケータ。
 */

export interface Range {
  start: number;
  size: number;
}

/**
 * 範囲アロケータ。
 * 空き領域のリストを管理し、隣接する解放領域は結合する。
 */
export class RangeAllocator {
  public readonly capacity: number;
  private readonly freeRanges: Range[];

  /**
   * @param capacity 全体の容量
   */
  public constructor(capacity: number) {
    this.capacity = capacity;
    this.freeRanges = [{ start: 0, size: capacity }];
  }

  /**
   * 指定したサイズの範囲を確保する。
   * @param size 確保するサイズ
   * @param alignment アライメント (2の冪乗)
   * @returns 確保できた場合は開始位置、失敗した場合は -1
   */
  public allocate(size: number, alignment = 1): number {
    for (let i = 0; i < this.freeRanges.length; i++) {
      const range = this.freeRanges[i];
      const alignOffset = (alignment - (range.start % alignment)) % alignment;
      const alignedStart = range.start + alignOffset;
      const availableSize = range.size - alignOffset;

      if (availableSize >= size) {
        if (alignOffset > 0) {
          const newFree: Range = { start: range.start, size: alignOffset };
          this.freeRanges.splice(i, 0, newFree);
          i++;
        }

        if (availableSize > size) {
          range.start = alignedStart + size;
          range.size = availableSize - size;
        } else {
          this.freeRanges.splice(i, 1);
        }

        return alignedStart;
      }
    }

    return -1;
  }

  /**
   * 指定した範囲を解放し、隣接する空き領域があれば結合する。
   * @param start 解放する開始位置
   * @param size 解放するサイズ
   */
  public free(start: number, size: number): void {
    if (size <= 0) return;

    let insertIndex = 0;
    while (insertIndex < this.freeRanges.length && this.freeRanges[insertIndex].start < start) {
      insertIndex++;
    }

    this.freeRanges.splice(insertIndex, 0, { start, size });

    if (insertIndex > 0) {
      const prev = this.freeRanges[insertIndex - 1];
      if (prev.start + prev.size === start) {
        prev.size += size;
        this.freeRanges.splice(insertIndex, 1);
        insertIndex--;
        start = prev.start;
        size = prev.size;
      }
    }

    if (insertIndex < this.freeRanges.length - 1) {
      const next = this.freeRanges[insertIndex + 1];
      if (start + size === next.start) {
        this.freeRanges[insertIndex].size += next.size;
        this.freeRanges.splice(insertIndex + 1, 1);
      }
    }
  }
}
