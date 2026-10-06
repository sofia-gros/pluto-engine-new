import { describe, expect, it } from 'vitest';
import { ArchetypeGraph, maskToKey } from '../../../../src/core/ecs/archetype-graph';
import type { Archetype } from '../../../../src/core/ecs/archetype';
import { defineComponent } from '../../../../src/core/ecs/component';
import { Bitset } from '../../../../src/core/memory/bitset';
import { ScalarType } from '../../../../src/core/memory/scalar-type';

const A = defineComponent('A', { a: ScalarType.F32 });
const B = defineComponent('B', { b: ScalarType.F32 });

describe('ArchetypeGraph', () => {
  it('maskToKey は語ごとに 8 桁固定の 16 進文字列を返す', () => {
    const m = new Bitset(64);
    m.set(0);
    m.set(33);
    expect(maskToKey(m)).toBe('0000000100000002');
  });

  it('ID 0 は空アーキタイプで、ID は配列で O(1) に引ける', () => {
    const g = new ArchetypeGraph(10);
    expect(g.size).toBe(1);
    expect(g.getArchetypeById(0)?.mask.data.every((w) => w === 0)).toBe(true);
    expect(g.getArchetypeById(99)).toBeUndefined();
  });

  it('同じ構成 (順序・重複によらない) には同じアーキタイプを返す', () => {
    const g = new ArchetypeGraph(10);
    const ab = g.getOrCreateArchetype([A, B]);
    expect(g.getOrCreateArchetype([B, A, B])).toBe(ab);
    expect(g.getArchetypes()).toHaveLength(2);
  });

  it('transition は追加・削除の遷移先を返し、エッジをキャッシュする', () => {
    const created: Archetype[] = [];
    const g = new ArchetypeGraph(10, (a) => created.push(a));
    const empty = g.getArchetypeById(0);
    if (empty === undefined) throw new Error('空アーキタイプがありません');
    const a = g.transition(empty, A, true);
    const ab = g.transition(a, B, true);
    expect(ab.hasComponent(A.id) && ab.hasComponent(B.id)).toBe(true);
    expect(g.transition(empty, A, true)).toBe(a);
    expect(g.transition(ab, B, false)).toBe(a);
    expect(created.map((x) => x.id)).toEqual([0, 1, 2]);
  });

  it('境界値: 既に持つコンポーネントの追加・持たないコンポーネントの削除は同じアーキタイプを返す', () => {
    const g = new ArchetypeGraph(10);
    const a = g.getOrCreateArchetype([A]);
    expect(g.transition(a, A, true)).toBe(a);
    expect(g.transition(a, B, false)).toBe(a);
  });
});
