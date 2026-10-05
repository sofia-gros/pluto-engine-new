import { describe, expect, it } from 'vitest';
import { Query } from '../../../../src/core/ecs/query';
import { Archetype } from '../../../../src/core/ecs/archetype';
import { defineComponent } from '../../../../src/core/ecs/component';
import { ScalarType } from '../../../../src/core/memory/scalar-type';
import type { Entity } from '../../../../src/core/ecs/entity';
import { ChunkView } from '../../../../src/core/ecs/chunk-view';

const CompA = defineComponent('CompA', { a: ScalarType.F32 });
const CompB = defineComponent('CompB', { b: ScalarType.F32 });
const CompC = defineComponent('CompC', { c: ScalarType.F32 });

describe('Query', () => {
  it('matches archetypes based on all and none', () => {
    const q = new Query({ all: [CompA], none: [CompC] });

    const arch1 = new Archetype(1, [CompA], 100);
    const arch2 = new Archetype(2, [CompA, CompB], 100);
    const arch3 = new Archetype(3, [CompA, CompC], 100); // none C に抵触
    const arch4 = new Archetype(4, [CompB], 100); // all A に抵触

    expect(q.match(arch1)).toBe(true);
    expect(q.match(arch2)).toBe(true);
    expect(q.match(arch3)).toBe(false);
    expect(q.match(arch4)).toBe(false);

    q.tryRegister(arch1);
    q.tryRegister(arch2);
    q.tryRegister(arch3);
  });

  it('iterates chunks correctly', () => {
    const q = new Query({ all: [CompA] });

    // Chunk size is 16384
    const arch1 = new Archetype(1, [CompA], 50000);
    for (let i = 0; i < 20000; i++) arch1.pushRow(i as Entity);

    q.tryRegister(arch1);

    expect(q.count()).toBe(20000);
    expect(q.chunkCount()).toBe(2); // 16384 と 3616

    const views: { start: number; end: number }[] = [];
    q.forEachChunk((view) => {
      views.push({ start: view.start, end: view.end });
    });

    expect(views).toEqual([
      { start: 0, end: 16384 },
      { start: 16384, end: 20000 },
    ]);
  });

  it('returns chunk by global index', () => {
    const q = new Query({ all: [CompA] });

    const arch1 = new Archetype(1, [CompA], 50000);
    for (let i = 0; i < 20000; i++) arch1.pushRow(i as Entity);

    const arch2 = new Archetype(2, [CompA, CompB], 50000);
    for (let i = 0; i < 5000; i++) arch2.pushRow(i as Entity);

    q.tryRegister(arch1);
    q.tryRegister(arch2);

    expect(q.chunkCount()).toBe(3); // arch1=2, arch2=1

    const out = new ChunkView();
    q.getChunk(1, out);
    expect(out.archetype.id).toBe(arch1.id);
    expect(out.start).toBe(16384);
    expect(out.end).toBe(20000);

    q.getChunk(2, out);
    expect(out.archetype.id).toBe(arch2.id);
    expect(out.start).toBe(0);
    expect(out.end).toBe(5000);

    expect(() => {
      q.getChunk(3, out);
    }).toThrow();
  });
});
