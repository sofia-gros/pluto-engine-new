import { describe, expect, it } from 'vitest';
import { ChunkView } from '../../../../src/core/ecs/chunk-view';
import { Archetype } from '../../../../src/core/ecs/archetype';
import { defineComponent } from '../../../../src/core/ecs/component';
import { makeEntity } from '../../../../src/core/ecs/entity';
import { ScalarType } from '../../../../src/core/memory/scalar-type';
import { PlutoError } from '../../../../src/core/debug/pluto-error';

const V = defineComponent('V', { v: ScalarType.F32 });

describe('ChunkView', () => {
  it('column / entity / markDirty がアーキタイプの範囲を扱う', () => {
    const a = new Archetype(1, [V], 300);
    for (let i = 0; i < 200; i++) a.pushRow(makeEntity(i, 0));
    a.changeTracker.clear(V.v.fieldId);
    const view = new ChunkView();
    view.archetype = a;
    view.start = 64;
    view.end = 130;
    expect(view.column(V.v)).toBe(a.getColumn(V.v));
    expect(view.entity(64)).toBe(makeEntity(64, 0));
    view.markDirty(V.v);
    const out: number[][] = [];
    a.changeTracker.forEachDirtyRange(V.v.fieldId, a.count, (s, e) => out.push([s, e]));
    expect(out).toEqual([[64, 192]]);
  });

  it('アーキタイプ未設定・範囲外の行は assert で失敗する', () => {
    const view = new ChunkView();
    expect(() => view.column(V.v)).toThrow(PlutoError);
    expect(() => view.entity(0)).toThrow(PlutoError);
    expect(() => {
      view.markDirty(V.v);
    }).toThrow(PlutoError);
    view.archetype = new Archetype(1, [V], 10);
    view.start = 0;
    view.end = 1;
    expect(() => view.entity(1)).toThrow(PlutoError);
  });
});
