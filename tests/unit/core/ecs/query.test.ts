import { describe, expect, it } from 'vitest';
import { Query, queryKey } from '../../../../src/core/ecs/query';
import { Archetype } from '../../../../src/core/ecs/archetype';
import { CHUNK_ROWS, ChunkView } from '../../../../src/core/ecs/chunk-view';
import { defineComponent } from '../../../../src/core/ecs/component';
import { makeEntity } from '../../../../src/core/ecs/entity';
import { ScalarType } from '../../../../src/core/memory/scalar-type';
import { PlutoError } from '../../../../src/core/debug/pluto-error';

const A = defineComponent('A', { a: ScalarType.F32 });
const B = defineComponent('B', { b: ScalarType.F32 });
const C = defineComponent('C', { c: ScalarType.F32 });

/**
 * 行数を指定してアーキタイプを作る。
 * @param id ID
 * @param comps コンポーネント
 * @param rows 行数
 * @returns アーキタイプ
 */
function filled(
  id: number,
  comps: ConstructorParameters<typeof Archetype>[1],
  rows: number,
): Archetype {
  const a = new Archetype(id, comps, 50_000);
  for (let i = 0; i < rows; i++) a.pushRow(makeEntity(i, 0));
  return a;
}

describe('Query', () => {
  it('all / none 条件でアーキタイプを判定する', () => {
    const q = new Query({ all: [A], none: [C] });
    expect(q.match(new Archetype(1, [A], 1))).toBe(true);
    expect(q.match(new Archetype(2, [A, B], 1))).toBe(true);
    expect(q.match(new Archetype(3, [A, C], 1))).toBe(false);
    expect(q.match(new Archetype(4, [B], 1))).toBe(false);
  });

  it('同じアーキタイプは 1 回だけ登録される (重複登録で件数が増えない)', () => {
    const q = new Query({ all: [A] });
    const a = filled(1, [A], 10);
    expect(q.tryRegister(a)).toBe(true);
    expect(q.tryRegister(a)).toBe(false);
    expect(q.tryRegister(new Archetype(2, [B], 1))).toBe(false);
    expect(q.archetypes).toHaveLength(1);
    expect(q.count()).toBe(10);
  });

  it('forEachChunk は CHUNK_ROWS ごとに分割し、chunkIndex はクエリ全体の通し番号', () => {
    const q = new Query({ all: [A] });
    q.tryRegister(filled(1, [A], 20_000));
    q.tryRegister(filled(2, [A, B], 5000));
    const seen: number[][] = [];
    q.forEachChunk((v) => seen.push([v.archetype?.id ?? -1, v.start, v.end, v.chunkIndex]));
    expect(seen).toEqual([
      [1, 0, CHUNK_ROWS, 0],
      [1, CHUNK_ROWS, 20_000, 1],
      [2, 0, 5000, 2],
    ]);
    expect(q.chunkCount()).toBe(3);
  });

  it('getChunk は forEachChunk と同じ範囲・同じ chunkIndex を返し、範囲外は PlutoError', () => {
    const q = new Query({ all: [A] });
    q.tryRegister(filled(1, [A], 20_000));
    q.tryRegister(filled(2, [A, B], 5000));
    const out = new ChunkView();
    q.getChunk(2, out);
    expect([out.archetype?.id, out.start, out.end, out.chunkIndex]).toEqual([2, 0, 5000, 2]);
    expect(() => {
      q.getChunk(3, out);
    }).toThrow(PlutoError);
  });

  it('境界値: 行が 0 のアーキタイプはチャンクを持たない', () => {
    const q = new Query({ all: [A] });
    q.tryRegister(filled(1, [A], 0));
    expect(q.chunkCount()).toBe(0);
    let calls = 0;
    q.forEachChunk(() => calls++);
    expect(calls).toBe(0);
  });

  it('queryKey は指定順序に依存しない', () => {
    expect(queryKey({ all: [B, A] })).toBe(queryKey({ all: [A, B] }));
    expect(queryKey({ all: [A] })).not.toBe(queryKey({ all: [A], none: [B] }));
    expect(queryKey({})).toBe('|');
  });
});
