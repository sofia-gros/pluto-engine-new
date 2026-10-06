// @pluto-hot
/**
 * @file エンティティハンドル (index 22bit + generation 10bit) の pack / unpack (docs/04-memory-and-ecs.md §2.1)。
 */

/**
 * エンティティ ID。下位 22 ビットが index、上位 10 ビットが世代 (generation)。
 */
export type Entity = number & { readonly __brand: 'Entity' };

/** index に使うビット数。 */
export const ENTITY_INDEX_BITS = 22;
/** index を取り出すマスク。 */
export const ENTITY_INDEX_MASK = 0x3fffff;
/** 世代を取り出すマスク (index ビットを除いた後)。 */
export const ENTITY_GENERATION_MASK = 0x3ff;
/** エンティティ数の上限 (4,194,303)。index 0x3FFFFF は NULL_ENTITY 用に予約し、発行しない。 */
export const MAX_ENTITIES = (1 << ENTITY_INDEX_BITS) - 1;
/** 「エンティティなし」を表す値 (= makeEntity(0x3FFFFF, 1023))。 */
export const NULL_ENTITY = 0xffffffff as Entity;

/**
 * index と世代からエンティティを作る。
 * @hot
 * @param index index (0 〜 MAX_ENTITIES - 1)
 * @param generation 世代 (下位 10 ビットを使う)
 * @returns エンティティ
 */
export function makeEntity(index: number, generation: number): Entity {
  return ((((generation & ENTITY_GENERATION_MASK) << ENTITY_INDEX_BITS) |
    (index & ENTITY_INDEX_MASK)) >>>
    0) as Entity;
}

/**
 * エンティティから index を取り出す。
 * @hot
 * @param e エンティティ
 * @returns index
 */
export function entityIndex(e: Entity): number {
  return (e & ENTITY_INDEX_MASK) >>> 0;
}

/**
 * エンティティから世代を取り出す。
 * @hot
 * @param e エンティティ
 * @returns 世代
 */
export function entityGeneration(e: Entity): number {
  return (e >>> ENTITY_INDEX_BITS) & ENTITY_GENERATION_MASK;
}
