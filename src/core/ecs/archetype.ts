// @pluto-hot
/**
 * @file アーキタイプ (同じコンポーネント構成を持つエンティティの集合と、そのデータのバッファ群)。
 */

import { assert } from '../debug/assert';
import { Bitset } from '../memory/bitset';
import { MAX_COMPONENTS } from './component';
import { Column, INITIAL_ARCHETYPE_ROWS } from './column';
import type { ScalarType, TypedArrayOf } from '../memory/scalar-type';
import type { AnyTypedArray } from '../memory/ring-buffer';
import type { FieldToken } from './schema';
import type { AnyComponentDef } from './component';
import type { Entity } from './entity';
import { NULL_ENTITY } from './entity';
import { ChangeTracker } from './change-tracking';

/**
 * 特定のコンポーネント群を持つエンティティのデータを SoA 形式で保持するブロック。
 */
export class Archetype {
  public readonly id: number;
  public readonly mask: Bitset;
  private maxRows: number;
  public count: number;

  public readonly changeTracker: ChangeTracker;

  // 拡張可能な Entity 配列
  public entities: Uint32Array;

  // フィールドごとの Column (キーは fieldId)
  private readonly columns = new Map<number, Column>();

  /**
   * @param id アーキタイプID
   * @param components 属するコンポーネントのリスト
   * @param maxRows アーキタイプの最大行数 (EntityTable の capacity など)
   */
  public constructor(id: number, components: readonly AnyComponentDef[], maxRows: number) {
    this.id = id;
    this.maxRows = maxRows;
    this.count = 0;
    this.mask = new Bitset(MAX_COMPONENTS);

    const fieldIds: number[] = [];
    for (const comp of components) {
      this.mask.set(comp.id);
      for (const field of comp.fields) {
        this.columns.set(field.fieldId, new Column(field.type, maxRows));
        fieldIds.push(field.fieldId);
      }
    }

    this.changeTracker = new ChangeTracker(maxRows, fieldIds);

    this.entities = new Uint32Array(Math.min(INITIAL_ARCHETYPE_ROWS, maxRows));
  }

  /**
   * 指定したフィールドのデータ配列 (TypedArray) を取得する。
   * @hot
   * @param field フィールドトークン
   * @returns TypedArray
   */
  public getColumn<T extends ScalarType>(field: FieldToken<T>): TypedArrayOf<T> {
    const col = this.columns.get(field.fieldId);
    assert(col !== undefined, 'Archetype: 指定されたフィールドが存在しません');
    return col.data as TypedArrayOf<T>;
  }

  public getColumnByFieldId(fieldId: number): AnyTypedArray | undefined {
    return this.columns.get(fieldId)?.data;
  }

  /**
   * 指定したコンポーネントを持っているか判定する。
   * @hot
   * @param componentId コンポーネントID
   * @returns 持っているか
   */
  public hasComponent(componentId: number): boolean {
    return this.mask.test(componentId);
  }

  /**
   * 新しい行を追加し、その行番号を返す。
   * @hot
   * @param entity 追加するエンティティ
   * @returns 行番号
   */
  public pushRow(entity: Entity): number {
    assert(this.count < this.maxRows, 'Archetype: 最大行数に達しました');

    if (this.count >= this.entities.length) {
      // 拡張する
      let nextRows = this.entities.length * 2;
      if (nextRows > this.maxRows) {
        nextRows = this.maxRows;
      }

      const newEntities = new Uint32Array(nextRows);
      newEntities.set(this.entities);
      this.entities = new Uint32Array(newEntities.buffer);

      for (const col of this.columns.values()) {
        col.grow(nextRows);
      }
    }

    const row = this.count++;
    this.entities[row] = entity;
    return row;
  }

  /**
   * 指定した行を削除し、空いた穴を末尾の行で埋める (swap-remove)。
   * @hot
   * @param row 削除する行番号
   * @returns 移動してきたエンティティ。移動がなかった(削除行が末尾だった)場合は NULL_ENTITY。
   */
  public swapRemove(row: number): Entity {
    assert(row < this.count, 'Archetype: 範囲外の行を削除しようとしました');

    const lastRow = --this.count;
    if (row === lastRow) {
      return NULL_ENTITY;
    }

    const movedEntity = this.entities[lastRow];
    this.entities[row] = movedEntity;

    // 各フィールドのデータもコピーして埋める
    for (const col of this.columns.values()) {
      col.data[row] = col.data[lastRow];
    }

    return movedEntity as Entity;
  }

  /**
   * 指定した行のデータを、別のアーキタイプの指定した行へコピーする。
   * 共通するフィールドのみコピーされる。
   * @hot
   * @param row コピー元の行番号
   * @param dst コピー先のアーキタイプ
   * @param dstRow コピー先の行番号
   */
  public copyRowTo(row: number, dst: Archetype, dstRow: number): void {
    // 共通するフィールドのデータのみをコピー
    for (const [fieldId, srcCol] of this.columns.entries()) {
      const dstCol = dst.columns.get(fieldId);
      if (dstCol !== undefined) {
        dstCol.data[dstRow] = srcCol.data[row];
      }
    }
  }
}
