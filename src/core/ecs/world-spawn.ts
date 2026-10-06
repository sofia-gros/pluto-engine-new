// @pluto-hot
/**
 * @file `World` の spawn 責務 (docs/04-memory-and-ecs.md §4.2 の `pushRows` を使う)。
 * 1 体ごとに `Archetype.pushRow` を呼ぶとフィールド数だけ dirty ビットを立てるため、
 * 一括生成では行をまとめて確保してから Entity ID を採番する。
 */
import { assert } from '../debug';
import { COMPONENT_REGISTRY } from './component';
import type { AnyComponentDef } from './component';
import { NULL_ENTITY } from './entity';
import type { Entity } from './entity';
import type { Archetype } from './archetype';
import type { ArchetypeGraph } from './archetype-graph';
import type { EntityTable } from './entity-table';

/**
 * spawn が使う `World` の内部状態。
 * `World` が保持し、ここに渡す (メソッドは持たない)。
 */
export interface SpawnState {
  /**
   * システム実行中か。
   * 値を複製せず `World.iterating` を直接読む関数を渡す。
   * そうしないと `World.flush()` の入れ子復帰などで実行中フラグが追従しない。
   */
  isIterating(): boolean;
  /** アーキタイプ遷移のキャッシュ。 */
  graph: ArchetypeGraph;
  /** エンティティ ID の表。 */
  entityTable: EntityTable;
}

/**
 * 空アーキタイプ (ID 0) を返す。
 * @hot spawn のたびに 1 回だけ呼ぶ
 * @param graph アーキタイプ遷移のキャッシュ
 * @returns 空アーキタイプ
 */
export function emptyArchetypeOf(graph: ArchetypeGraph): Archetype {
  const arch = graph.getArchetypeById(0);
  assert(arch !== undefined, 'World: 空アーキタイプがありません');
  return arch;
}

/**
 * コンポーネント ID の列から遷移先のアーキタイプを求める。
 * `CommandBuffer` に積んである spawn を同期点で適用するときに使う (docs/04 §7.1)。
 * @cold 適用するコマンド 1 件につき 1 回だけ呼ぶ
 * @param graph アーキタイプ遷移のキャッシュ
 * @param ids コンポーネント ID の列
 * @param start ID 列の開始位置
 * @param count ID の個数
 * @returns 遷移先のアーキタイプ
 */
export function archetypeOfIds(
  graph: ArchetypeGraph,
  ids: Uint32Array,
  start: number,
  count: number,
): Archetype {
  let arch = emptyArchetypeOf(graph);
  for (let i = 0; i < count; i++)
    arch = graph.transition(arch, COMPONENT_REGISTRY[ids[start + i]], true);
  return arch;
}

/**
 * コンポーネント構成から遷移先のアーキタイプを求める。
 * @cold spawn の前処理。1 体ごとに 1 回だけ呼ぶ
 * @param state World の内部状態
 * @param components 付与するコンポーネント
 * @returns 遷移先のアーキタイプ
 */
export function targetArchetype(
  state: SpawnState,
  components: readonly AnyComponentDef[],
): Archetype {
  assert(
    !state.isIterating(),
    'World: システム実行中は即時 spawn できません。commands を使ってください',
  );
  let arch = emptyArchetypeOf(state.graph);
  const n = components.length;
  for (let i = 0; i < n; i++) arch = state.graph.transition(arch, components[i], true);
  return arch;
}

/**
 * 同じコンポーネント構成の `count` 体を一括で即時生成し、最初の Entity を返す。
 * 行をまとめて確保してから Entity ID を採番するので、1 体ごとに dirty ビットを立てない。
 * @hot 生成される体数に比例してループする
 * @param state World の内部状態
 * @param count 生成する体数
 * @param components 付与するコンポーネント (1 つでも可。空なら空アーキタイプになる)
 * @returns 最初の Entity。`count` が 0 のときは `NULL_ENTITY`
 */
export function spawnRows(
  state: SpawnState,
  count: number,
  components: readonly AnyComponentDef[],
): Entity {
  assert(count >= 0, 'World: 生成する体数は 0 以上である必要があります');
  if (count === 0) return NULL_ENTITY;
  const arch = targetArchetype(state, components);
  const startRow = arch.pushRows(count);
  const table = state.entityTable;
  let first = NULL_ENTITY;
  for (let i = 0; i < count; i++) {
    const e = table.allocate();
    const row = startRow + i;
    table.update(e, arch.id, row);
    arch.writeEntityRow(row, e);
    if (i === 0) first = e;
  }
  return first;
}

/**
 * 1 体だけ即時生成する (`World.spawn` の実装本体)。
 * @hot 生成される体数に比例しないが、呼び出し回数に比例する
 * @param state World の内部状態
 * @param components 付与するコンポーネント
 * @returns 生成した Entity
 */
export function spawnOne(state: SpawnState, components: readonly AnyComponentDef[]): Entity {
  const arch = targetArchetype(state, components);
  const e = state.entityTable.allocate();
  state.entityTable.update(e, arch.id, arch.pushRow(e));
  return e;
}
