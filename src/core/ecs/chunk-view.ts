// @pluto-hot
/**
 * @file アーキタイプの行データに対するチャンク単位のビュー。
 */

import type { Archetype } from './archetype';
import type { ScalarType, TypedArrayOf } from '../memory/scalar-type';
import type { FieldToken } from './schema';
import type { Entity } from './entity';
import { assert } from '../debug/assert';

export const CHUNK_ROWS = 16384;

/**
 * アーキタイプの一部範囲(チャンク)にアクセスするためのビュー。
 * インスタンスは使い回される。
 */
export class ChunkView {
  public archetype!: Archetype;
  public start = 0;
  public end = 0;
  public chunkIndex = 0;

  /**
   * 指定したフィールドのデータ配列を取得する。
   * @hot
   * @param field フィールドトークン
   * @returns TypedArray
   */
  public column<T extends ScalarType>(field: FieldToken<T>): TypedArrayOf<T> {
    return this.archetype.getColumn(field);
  }

  /**
   * 指定した行のエンティティを取得する。
   * @hot
   * @param row 行番号 (start <= row < end の範囲)
   * @returns エンティティ
   */
  public entity(row: number): Entity {
    assert(row >= this.start && row < this.end, 'ChunkView: 範囲外の行です');
    return this.archetype.entities[row] as Entity;
  }

  /**
   * このチャンクの範囲 ([start, end)) のデータを変更した(dirty)としてマークする。
   * @hot
   * @param field 変更したフィールド
   */
  public markDirty(field: FieldToken): void {
    this.archetype.changeTracker.markRange(field.fieldId, this.start, this.end);
  }
}
