// @pluto-hot
/**
 * @file エンティティ ID → (archetypeId, row, generation) の SoA 表と ID 再利用 (docs/04-memory-and-ecs.md §2.2)。
 */
import { assert, ErrorCode, PlutoError } from '../debug';
import { FreeList } from '../memory';
import type { Entity } from './entity';
import {
  ENTITY_GENERATION_MASK,
  MAX_ENTITIES,
  NULL_ENTITY,
  entityGeneration,
  entityIndex,
  makeEntity,
} from './entity';

/** 「アーキタイプ未所属」を表す archetypeId。 */
export const NULL_ARCHETYPE = 0xffff;

/**
 * エンティティの所属アーキタイプ・行番号・世代を SoA で管理する表。
 */
export class EntityTable {
  /** 管理できるエンティティ数。 */
  public readonly capacity: number;
  /** index → 所属アーキタイプ (`NULL_ARCHETYPE` = 未使用)。 */
  public readonly archetypeIds: Uint16Array;
  /** index → アーキタイプ内の行番号。 */
  public readonly rows: Uint32Array;
  /** index → 現在の世代。 */
  public readonly generations: Uint16Array;
  private readonly freeList: FreeList;

  /**
   * @param capacity 最大エンティティ数 (1 〜 MAX_ENTITIES)
   */
  public constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1 || capacity > MAX_ENTITIES) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        'EntityTable: capacity は 1 以上 MAX_ENTITIES (4194303) 以下の整数にしてください。',
      );
    }
    this.capacity = capacity;
    this.archetypeIds = new Uint16Array(capacity).fill(NULL_ARCHETYPE);
    this.rows = new Uint32Array(capacity);
    this.generations = new Uint16Array(capacity);
    this.freeList = new FreeList(capacity);
    for (let i = capacity - 1; i >= 0; i--) {
      this.freeList.push(i);
    }
  }

  /**
   * まだ確保できる index が残っているか。
   * @hot
   * @returns 残っていれば true
   */
  public canAllocate(): boolean {
    return !this.freeList.isEmpty();
  }

  /**
   * index を予約してエンティティを返す。アーキタイプは未所属のまま (isAlive は false)。
   * CommandBuffer の事前割当用。
   * @hot
   * @returns 予約したエンティティ
   */
  public allocate(): Entity {
    if (this.freeList.isEmpty()) {
      throw new PlutoError(
        ErrorCode.CapacityExceeded,
        'エンティティ数が上限に達しました。WorldConfig.maxEntities を増やしてください。',
      );
    }
    const index = this.freeList.pop();
    this.archetypeIds[index] = NULL_ARCHETYPE;
    this.rows[index] = 0;
    return makeEntity(index, this.generations[index]);
  }

  /**
   * エンティティを解放し、世代を進める。
   * @hot
   * @param e 解放するエンティティ (生存していること)
   */
  public destroy(e: Entity): void {
    assert(this.isAlive(e), 'EntityTable: 生存していないエンティティを破棄しようとしました');
    const index = entityIndex(e);
    this.archetypeIds[index] = NULL_ARCHETYPE;
    this.generations[index] = (this.generations[index] + 1) & ENTITY_GENERATION_MASK;
    this.freeList.push(index);
  }

  /**
   * エンティティが生存しているか (index が範囲内・世代が一致・アーキタイプに所属)。
   * @hot
   * @param e エンティティ
   * @returns 生存していれば true
   */
  public isAlive(e: Entity): boolean {
    if (e === NULL_ENTITY) return false;
    const index = entityIndex(e);
    return (
      index < this.capacity &&
      this.generations[index] === entityGeneration(e) &&
      this.archetypeIds[index] !== NULL_ARCHETYPE
    );
  }

  /**
   * 予約済み (allocate 済みで未解放) か。CommandBuffer で予約した直後のエンティティも true。
   * @hot
   * @param e エンティティ
   * @returns 予約済みなら true
   */
  public isReserved(e: Entity): boolean {
    if (e === NULL_ENTITY) return false;
    const index = entityIndex(e);
    return index < this.capacity && this.generations[index] === entityGeneration(e);
  }

  /**
   * 所属アーキタイプを返す。
   * @hot
   * @param e エンティティ
   * @returns アーキタイプ ID
   */
  public getArchetype(e: Entity): number {
    return this.archetypeIds[entityIndex(e)];
  }

  /**
   * アーキタイプ内の行番号を返す。
   * @hot
   * @param e エンティティ
   * @returns 行番号
   */
  public getRow(e: Entity): number {
    return this.rows[entityIndex(e)];
  }

  /**
   * 所属アーキタイプと行番号を書き換える。
   * @hot
   * @param e エンティティ
   * @param archetypeId アーキタイプ ID
   * @param row 行番号
   */
  public update(e: Entity, archetypeId: number, row: number): void {
    const index = entityIndex(e);
    this.archetypeIds[index] = archetypeId;
    this.rows[index] = row;
  }
}
