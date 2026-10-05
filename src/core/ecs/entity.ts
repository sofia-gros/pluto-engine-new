// @pluto-hot
/**
 * @file エンティティの型とビット操作。
 */

/**
 * エンティティID。下位22ビットがインデックス、上位10ビットが世代。
 */
export type Entity = number & { readonly __brand: 'Entity' };

export const ENTITY_INDEX_BITS = 22;
export const ENTITY_INDEX_MASK = 0x3fffff;
export const ENTITY_GENERATION_MASK = 0x3ff;
export const MAX_ENTITIES = 1 << 22;
export const NULL_ENTITY = 0xffffffff as Entity;

/**
 * インデックスと世代からエンティティを生成する。
 * @param index インデックス
 * @param generation 世代
 * @returns エンティティ
 */
export function makeEntity(index: number, generation: number): Entity {
  return ((((generation & ENTITY_GENERATION_MASK) << ENTITY_INDEX_BITS) |
    (index & ENTITY_INDEX_MASK)) >>>
    0) as Entity;
}

/**
 * エンティティからインデックスを取得する。
 * @param e エンティティ
 * @returns インデックス
 */
export function entityIndex(e: Entity): number {
  return (e & ENTITY_INDEX_MASK) >>> 0;
}

/**
 * エンティティから世代を取得する。
 * @param e エンティティ
 * @returns 世代
 */
export function entityGeneration(e: Entity): number {
  return (e >>> ENTITY_INDEX_BITS) & ENTITY_GENERATION_MASK;
}
