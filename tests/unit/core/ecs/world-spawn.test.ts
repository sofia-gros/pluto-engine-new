import { describe, expect, it } from 'vitest';
import { ArchetypeGraph } from '../../../../src/core/ecs/archetype-graph';
import { defineComponent } from '../../../../src/core/ecs/component';
import { EntityTable } from '../../../../src/core/ecs/entity-table';
import { makeEntity } from '../../../../src/core/ecs/entity';
import { ScalarType } from '../../../../src/core/memory/scalar-type';
import { ErrorCode } from '../../../../src/core/debug/pluto-error';
import {
  archetypeOfIds,
  emptyArchetypeOf,
  spawnOne,
  spawnRows,
  targetArchetype,
} from '../../../../src/core/ecs/world-spawn';
import type { SpawnState } from '../../../../src/core/ecs/world-spawn';

const Position = defineComponent('SpawnPosition', { x: ScalarType.F32, y: ScalarType.F32 });
const Velocity = defineComponent('SpawnVelocity', { dx: ScalarType.F32 });
const Tag = defineComponent('SpawnTag', { n: ScalarType.U32 });

/** `SpawnState` を組み立てる。`isIterating` は引数で変更できる箱を通す。 */
function makeState(
  maxEntities = 100,
  maxRows = 100,
): {
  state: SpawnState;
  setIterating: (v: boolean) => void;
} {
  const box = { isIterating: false };
  const graph = new ArchetypeGraph(maxRows);
  return {
    state: {
      isIterating: () => box.isIterating,
      graph,
      entityTable: new EntityTable(maxEntities),
    },
    setIterating: (v: boolean) => {
      box.isIterating = v;
    },
  };
}

/** `archetypeOfIds` へ渡す ID 列を作る。 */
function idsOf(...comps: { id: number }[]): Uint32Array {
  const ids = new Uint32Array(comps.length);
  for (let i = 0; i < comps.length; i++) ids[i] = comps[i].id;
  return ids;
}

describe('world-spawn', () => {
  it('emptyArchetypeOf は ID 0 のアーキタイプを返す', () => {
    const { state } = makeState();
    expect(emptyArchetypeOf(state.graph).id).toBe(0);
  });

  it('targetArchetype はコンポーネント順に遷移する', () => {
    const { state } = makeState();
    const arch = targetArchetype(state, [Position, Velocity]);
    expect(arch.hasComponent(Position.id)).toBe(true);
    expect(arch.hasComponent(Velocity.id)).toBe(true);
    expect(arch.hasComponent(Tag.id)).toBe(false);
    // 空のアーキタイプを起点に遷移するので、生成済みアーキタイプと同じものになる
    expect(arch).toBe(state.graph.getArchetypeById(arch.id));
  });

  it('targetArchetype は実行中なら InvalidState', () => {
    const { state, setIterating } = makeState();
    setIterating(true);
    expect(() => targetArchetype(state, [Position])).toThrow(
      expect.objectContaining({ code: ErrorCode.InvalidState }),
    );
  });

  it('spawnOne は 1 行だけ増やし、Entity と行の対応をテーブルに記録する', () => {
    const { state } = makeState();
    const arch = targetArchetype(state, [Position]);
    const e = spawnOne(state, [Position]);
    expect(arch.count).toBe(1);
    expect(state.entityTable.isAlive(e)).toBe(true);
    expect(state.entityTable.getArchetype(e)).toBe(arch.id);
    expect(state.entityTable.getRow(e)).toBe(0);
  });

  it('spawnOne は実行中なら InvalidState', () => {
    const { state, setIterating } = makeState();
    setIterating(true);
    expect(() => spawnOne(state, [Position])).toThrow(
      expect.objectContaining({ code: ErrorCode.InvalidState }),
    );
  });

  it('spawnRows は count 体まとめて生成し、最初の Entity を返す', () => {
    const { state } = makeState(10, 10);
    const arch = targetArchetype(state, [Position, Velocity]);
    const first = spawnRows(state, 4, [Position, Velocity]);
    expect(first).toBe(makeEntity(0, 0));
    expect(arch.count).toBe(4);
    for (let i = 0; i < 4; i++) {
      const e = makeEntity(i, 0);
      expect(state.entityTable.isAlive(e)).toBe(true);
      expect(state.entityTable.getRow(e)).toBe(i);
      expect(arch.entities[i]).toBe(e);
    }
  });

  it('spawnRows は既存の行の後に連結する', () => {
    const { state } = makeState(10, 10);
    const arch = targetArchetype(state, [Position]);
    spawnOne(state, [Position]);
    const first = spawnRows(state, 3, [Position]);
    expect(arch.count).toBe(4);
    expect(first).toBe(makeEntity(1, 0));
    expect(state.entityTable.getRow(first)).toBe(1);
    expect(state.entityTable.getRow(makeEntity(3, 0))).toBe(3);
  });

  it('spawnRows(0) は NULL_ENTITY を返し、行を増やさない', () => {
    const { state } = makeState();
    const arch = targetArchetype(state, [Position]);
    expect(spawnRows(state, 0, [Position])).toBe(0xffffffff);
    expect(arch.count).toBe(0);
  });

  it('spawnRows は負の数なら InvalidState', () => {
    const { state } = makeState();
    expect(() => spawnRows(state, -1, [Position])).toThrow(
      expect.objectContaining({ code: ErrorCode.InvalidState }),
    );
  });

  it('spawnRows は実行中なら InvalidState', () => {
    const { state, setIterating } = makeState();
    setIterating(true);
    expect(() => spawnRows(state, 2, [Position])).toThrow(
      expect.objectContaining({ code: ErrorCode.InvalidState }),
    );
  });

  it('回帰: 一括生成の結果が 1 体ずつの連鎖と一致する (行順・Entity・値・件数)', () => {
    const bulk = makeState(1000, 1000);
    const chain = makeState(1000, 1000);
    const bulkArch = targetArchetype(bulk.state, [Position, Velocity]);
    const chainArch = targetArchetype(chain.state, [Position, Velocity]);
    spawnRows(bulk.state, 500, [Position, Velocity]);
    for (let i = 0; i < 500; i++) spawnOne(chain.state, [Position, Velocity]);
    expect(bulkArch.count).toBe(chainArch.count);
    expect(bulkArch.count).toBe(500);
    for (let i = 0; i < 500; i++) {
      const e = makeEntity(i, 0);
      expect(bulk.state.entityTable.getRow(e)).toBe(chain.state.entityTable.getRow(e));
      expect(bulkArch.entities[i]).toBe(chainArch.entities[i]);
      expect(bulkArch.getColumn(Position.x)[i]).toBe(chainArch.getColumn(Position.x)[i]);
      expect(bulkArch.getColumn(Velocity.dx)[i]).toBe(chainArch.getColumn(Velocity.dx)[i]);
    }
  });

  it('回帰: 一括生成した行も全フィールドが dirty になる', () => {
    const { state } = makeState(128, 128);
    const arch = targetArchetype(state, [Position, Velocity]);
    spawnRows(state, 128, [Position, Velocity]);
    const ranges: string[] = [];
    for (const field of [Position.x, Position.y, Velocity.dx]) {
      arch.changeTracker.forEachDirtyRange(field.fieldId, arch.count, (s, e) => {
        ranges.push(`${String(field.fieldId)}:${String(s)}-${String(e)}`);
      });
    }
    // 1 体ずつ pushRow と同じ dirty 結果になる (差分は markRange の呼び出し回数だけ)
    expect(ranges).toEqual([
      `${String(Position.x.fieldId)}:0-128`,
      `${String(Position.y.fieldId)}:0-128`,
      `${String(Velocity.dx.fieldId)}:0-128`,
    ]);
    const chain = makeState(128, 128);
    const chainArch = targetArchetype(chain.state, [Position, Velocity]);
    for (let i = 0; i < 128; i++) spawnOne(chain.state, [Position, Velocity]);
    const chainRanges: string[] = [];
    for (const field of [Position.x, Position.y, Velocity.dx]) {
      chainArch.changeTracker.forEachDirtyRange(field.fieldId, chainArch.count, (s, e) =>
        chainRanges.push(`${String(field.fieldId)}:${String(s)}-${String(e)}`),
      );
    }
    expect(ranges).toEqual(chainRanges);
  });

  it('回帰: 空アーキタイプへの一括生成で fromShared のミラー薄膜が壊れない', () => {
    const { state } = makeState(8, 8);
    spawnRows(state, 3, []);
    const empty = emptyArchetypeOf(state.graph);
    expect(empty.count).toBe(3);
    expect(empty.entities[0]).toBe(makeEntity(0, 0));
  });

  it('archetypeOfIds は ID 列の区間から遷移先を求める', () => {
    const { state } = makeState();
    const ids = idsOf(Position, Velocity, Tag);
    const arch = archetypeOfIds(state.graph, ids, 0, 3);
    expect(arch.hasComponent(Position.id)).toBe(true);
    expect(arch.hasComponent(Velocity.id)).toBe(true);
    expect(arch.hasComponent(Tag.id)).toBe(true);
    // targetArchetype と同じアーキタイプになる
    expect(arch).toBe(targetArchetype(state, [Position, Velocity, Tag]));
  });

  it('archetypeOfIds は start をずらして区間だけを読む', () => {
    const { state } = makeState();
    const ids = idsOf(Tag, Position, Velocity, Tag);
    // start=1, count=2 → Position + Velocity
    expect(archetypeOfIds(state.graph, ids, 1, 2)).toBe(
      targetArchetype(state, [Position, Velocity]),
    );
  });

  it('archetypeOfIds は count 0 なら空アーキタイプを返す', () => {
    const { state } = makeState();
    expect(archetypeOfIds(state.graph, idsOf(Position), 0, 0)).toBe(emptyArchetypeOf(state.graph));
  });
});
