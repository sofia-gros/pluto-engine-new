import { describe, expect, it } from 'vitest';
import { ChangeTracker, DIRTY_BLOCK_ROWS } from '../../../../src/core/ecs/change-tracking';
import { PlutoError } from '../../../../src/core/debug/pluto-error';

/**
 * dirty 範囲を配列で集める。
 * @param t トラッカー
 * @param fieldId フィールド ID
 * @param rowCount 行数
 * @returns [start, end] の配列
 */
function ranges(t: ChangeTracker, fieldId: number, rowCount: number): number[][] {
  const out: number[][] = [];
  t.forEachDirtyRange(fieldId, rowCount, (s, e) => out.push([s, e]));
  return out;
}

describe('ChangeTracker', () => {
  it('64 行ブロック単位で dirty になり、連続ブロックは 1 範囲に結合される', () => {
    const t = new ChangeTracker(10_000, [3]);
    t.markRange(3, 10, 20);
    t.markRange(3, 70, 130);
    expect(ranges(t, 3, 10_000)).toEqual([[0, 192]]);
  });

  it('離れたブロックは別の範囲になり、rowCount で末尾が切り詰められる', () => {
    const t = new ChangeTracker(10_000, [1]);
    t.markRange(1, 0, 1);
    t.markRange(1, 5000, 5001);
    expect(ranges(t, 1, 5010)).toEqual([
      [0, 64],
      [4992, 5010],
    ]);
  });

  it('clean な語 (32 ブロック) をまたいでも正しく列挙する', () => {
    const t = new ChangeTracker(100_000, [1]);
    t.markRange(1, 31 * DIRTY_BLOCK_ROWS, 33 * DIRTY_BLOCK_ROWS);
    t.markRange(1, 96 * DIRTY_BLOCK_ROWS, 97 * DIRTY_BLOCK_ROWS);
    expect(ranges(t, 1, 100_000)).toEqual([
      [31 * 64, 33 * 64],
      [96 * 64, 97 * 64],
    ]);
  });

  it('境界値: 空範囲・rowCount 0 では何も報告しない。clear で消える', () => {
    const t = new ChangeTracker(100, [1]);
    t.markRange(1, 5, 5);
    expect(ranges(t, 1, 100)).toEqual([]);
    t.markRange(1, 0, 100);
    expect(ranges(t, 1, 0)).toEqual([]);
    t.clear(1);
    expect(ranges(t, 1, 100)).toEqual([]);
  });

  it('追跡していないフィールド・範囲外は assert で失敗する', () => {
    const t = new ChangeTracker(100, [1]);
    expect(() => {
      t.markRange(2, 0, 1);
    }).toThrow(PlutoError);
    expect(() => {
      t.markRange(1, 0, 101);
    }).toThrow(PlutoError);
    expect(() => {
      t.markRange(1, 5, 4);
    }).toThrow(PlutoError);
  });

  it('共有バッファから作ったトラッカーは元のトラッカーの dirty を読める (Worker のミラー用)', () => {
    const t = new ChangeTracker(1000, [7]);
    t.markRange(7, 100, 101);
    const mirror = new ChangeTracker(
      1000,
      [7],
      t.sharedDescs.map((d) => d.buffer),
    );
    expect(ranges(mirror, 7, 1000)).toEqual([[64, 128]]);
    mirror.markRange(7, 900, 901);
    expect(ranges(t, 7, 1000)).toEqual([
      [64, 128],
      [896, 960],
    ]);
  });
});
