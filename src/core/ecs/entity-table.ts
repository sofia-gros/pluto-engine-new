// @pluto-hot
/**
 * @file エンティティテーブル (生存状態、アーキタイプ、行番号の管理)。
 */

import { assert } from '../debug/assert';
import { FreeList } from '../memory/free-list';
import type { Entity } from './entity';
import {
  entityIndex,
  entityGeneration,
  makeEntity,
  NULL_ENTITY,
  MAX_ENTITIES,
  ENTITY_GENERATION_MASK,
} from './entity';

export const NULL_ARCHETYPE = 0xffff;

/**
 * エンティティの属性(所属アーキタイプや行番号)を SoA で管理するテーブル。
 */
export class EntityTable {
  public readonly capacity: number;
  public readonly archetypeIds: Uint16Array;
  public readonly rows: Uint32Array;
  public readonly generations: Uint16Array;
  private readonly freeList: FreeList;

  /**
   * @param capacity 最大エンティティ数
   */
  public constructor(capacity: number) {
    assert(capacity <= MAX_ENTITIES, 'capacity は MAX_ENTITIES 以下でなければなりません');

    this.capacity = capacity;
    this.archetypeIds = new Uint16Array(capacity);
    this.rows = new Uint32Array(capacity);
    this.generations = new Uint16Array(capacity);
    this.freeList = new FreeList(capacity);

    for (let i = 0; i < capacity; i++) {
      this.archetypeIds[i] = NULL_ARCHETYPE;
    }

    for (let i = capacity - 1; i >= 0; i--) {
      this.freeList.push(i);
    }
  }

  /**
   * 新しいエンティティを生成する。
   * @hot
   * @returns 生成されたエンティティ
   */
  public create(): Entity {
    assert(!this.freeList.isEmpty(), 'エンティティの最大数に達しました');
    const index = this.freeList.pop();

    this.archetypeIds[index] = 0; // アーキタイプ0 (空アーキタイプ)
    this.rows[index] = 0;

    return makeEntity(index, this.generations[index]);
  }

  /**
   * エンティティを破棄する。
   * @hot
   * @param e 破棄するエンティティ
   */
  public destroy(e: Entity): void {
    assert(this.isAlive(e), '死んでいるエンティティを破棄しようとしました');
    const index = entityIndex(e);

    this.archetypeIds[index] = NULL_ARCHETYPE;
    this.generations[index] = (this.generations[index] + 1) & ENTITY_GENERATION_MASK;
    this.freeList.push(index);
  }

  /**
   * エンティティが生きているかどうかを返す。
   * @hot
   * @param e エンティティ
   * @returns 生きているか
   */
  public isAlive(e: Entity): boolean {
    if (e === NULL_ENTITY) {
      return false;
    }
    const index = entityIndex(e);
    if (index >= this.capacity) {
      return false;
    }

    return (
      this.generations[index] === entityGeneration(e) && this.archetypeIds[index] !== NULL_ARCHETYPE
    );
  }

  /**
   * @hot
   * @param e エンティティ
   * @returns アーキタイプID
   */
  public getArchetype(e: Entity): number {
    const index = entityIndex(e);
    return this.archetypeIds[index];
  }

  /**
   * @hot
   * @param e エンティティ
   * @returns アーキタイプ内の行番号
   */
  public getRow(e: Entity): number {
    const index = entityIndex(e);
    return this.rows[index];
  }

  /**
   * @hot
   * @param e エンティティ
   * @param archetypeId アーキタイプID
   * @param row 行番号
   */
  public update(e: Entity, archetypeId: number, row: number): void {
    const index = entityIndex(e);
    this.archetypeIds[index] = archetypeId;
    this.rows[index] = row;
  }
}
