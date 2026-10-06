// @pluto-hot
/**
 * @file システム・カーネルに渡すチャンク (最大 CHUNK_ROWS 行) のビュー (docs/04-memory-and-ecs.md §5.2)。
 * インスタンスは使い回す。システム内で保持してはならない。
 */
import { assert } from '../debug';
import type { ScalarType, TypedArrayOf } from '../memory';
import type { Archetype } from './archetype';
import type { Entity } from './entity';
import type { FieldToken } from './schema';

/** 1 チャンクの行数 (並列化の単位)。 */
export const CHUNK_ROWS = 16384;

/**
 * アーキタイプの行範囲 [start, end) へのビュー。
 */
export class ChunkView {
  /** 対象アーキタイプ (未設定なら null)。 */
  public archetype: Archetype | null = null;
  /** 開始行 (含む)。 */
  public start = 0;
  /** 終了行 (含まない)。 */
  public end = 0;
  /** クエリ全体でのチャンク通し番号 (Serial / Threaded で同じ値)。 */
  public chunkIndex = 0;

  /**
   * フィールドのカラムを返す。`start`〜`end - 1` の範囲だけ読み書きしてよい。
   * @hot
   * @param field フィールドトークン
   * @returns カラム
   */
  public column<T extends ScalarType>(field: FieldToken<T>): TypedArrayOf<T> {
    const arch = this.archetype;
    assert(arch !== null, 'ChunkView: アーキタイプが設定されていません');
    return arch.getColumn(field);
  }

  /**
   * 行のエンティティを返す。
   * @hot
   * @param row 行番号 (start <= row < end)
   * @returns エンティティ
   */
  public entity(row: number): Entity {
    const arch = this.archetype;
    assert(arch !== null, 'ChunkView: アーキタイプが設定されていません');
    assert(row >= this.start && row < this.end, 'ChunkView: 範囲外の行です');
    return arch.entities[row] as Entity;
  }

  /**
   * このチャンクの範囲のフィールドを dirty にする。
   * @hot
   * @param field 変更したフィールド
   */
  public markDirty(field: FieldToken): void {
    const arch = this.archetype;
    assert(arch !== null, 'ChunkView: アーキタイプが設定されていません');
    arch.changeTracker.markRange(field.fieldId, this.start, this.end);
  }
}
