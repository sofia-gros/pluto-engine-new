import { describe, expect, it } from 'vitest';
import { ChunkView } from '../../../../src/core/ecs/chunk-view';
import { Archetype } from '../../../../src/core/ecs/archetype';
import { defineComponent } from '../../../../src/core/ecs/component';
import { ScalarType } from '../../../../src/core/memory/scalar-type';
import type { Entity } from '../../../../src/core/ecs/entity';

const Dummy = defineComponent('Dummy', { v: ScalarType.F32 });

describe('ChunkView', () => {
  it('provides access to data and entities', () => {
    const arch = new Archetype(0, [Dummy], 1000);

    // push 10 entities
    for (let i = 0; i < 10; i++) {
      const row = arch.pushRow((i + 100) as Entity);
      arch.getColumn(Dummy.v)[row] = i * 1.5;
    }

    const view = new ChunkView();
    view.archetype = arch;
    view.start = 0;
    view.end = 10;
    view.chunkIndex = 0;

    const vCol = view.column(Dummy.v);
    expect(vCol[5]).toBe(5 * 1.5);
    expect(view.entity(5)).toBe(105);

    // markDirty
    view.markDirty(Dummy.v);
    const dirtyRanges: [number, number][] = [];
    arch.changeTracker.forEachDirtyRange(Dummy.v.fieldId, 10, (start, end) => {
      dirtyRanges.push([start, end]);
    });
    // 0~64 のブロックがdirtyになるので maxCount(10) まで報告される
    expect(dirtyRanges).toEqual([[0, 10]]);
  });
});
