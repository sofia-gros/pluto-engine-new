import { describe, expect, it } from 'vitest';
import {
  CMD_ADD_COMPONENT,
  CMD_DESPAWN,
  CMD_REMOVE_COMPONENT,
  CMD_SET,
  CMD_SPAWN,
  CommandBuffer,
} from '../../../../src/core/ecs/command-buffer';
import { EntityTable } from '../../../../src/core/ecs/entity-table';
import { defineComponent } from '../../../../src/core/ecs/component';
import { ScalarType } from '../../../../src/core/memory/scalar-type';
import { ErrorCode, PlutoError } from '../../../../src/core/debug/pluto-error';

const A = defineComponent('A', { f: ScalarType.F32, i: ScalarType.I32 });
const B = defineComponent('B', {});

describe('CommandBuffer', () => {
  it('spawn1 / spawnN / spawn は index を予約して CMD_SPAWN を積む', () => {
    const t = new EntityTable(10);
    const cb = new CommandBuffer(64, t);
    const e1 = cb.spawn1(A);
    const e2 = cb.spawnN([A, B]);
    const e3 = cb.spawn(B);
    expect(t.isReserved(e1) && t.isReserved(e2) && t.isReserved(e3)).toBe(true);
    expect(t.isAlive(e1)).toBe(false);
    expect(Array.from(cb.data)).toEqual([
      CMD_SPAWN,
      e1,
      1,
      A.id,
      CMD_SPAWN,
      e2,
      2,
      A.id,
      B.id,
      CMD_SPAWN,
      e3,
      1,
      B.id,
    ]);
  });

  it('despawn / add / remove / set を語列に積み、clear で空になる', () => {
    const t = new EntityTable(10);
    const cb = new CommandBuffer(64, t);
    const e = t.allocate();
    cb.despawn(e);
    cb.addComponent(e, B);
    cb.removeComponent(e, B);
    cb.set(e, A.f, 1.5);
    cb.set(e, A.i, -7);
    const d = cb.data;
    expect([d[0], d[2], d[5], d[8], d[13]]).toEqual([
      CMD_DESPAWN,
      CMD_ADD_COMPONENT,
      CMD_REMOVE_COMPONENT,
      CMD_SET,
      CMD_SET,
    ]);
    expect(cb.floatData[12]).toBe(1.5);
    expect(cb.int32Data[17]).toBe(-7);
    expect(cb.length).toBe(18);
    cb.clear();
    expect(cb.length).toBe(0);
  });

  it('容量 (u32 語数) を超えると PlutoError(CapacityExceeded) で、index を消費しない', () => {
    const t = new EntityTable(10);
    const cb = new CommandBuffer(5, t);
    cb.spawn1(A); // 4 語
    expect(() => cb.spawn1(A)).toThrow(
      expect.objectContaining({ code: ErrorCode.CapacityExceeded }),
    );
    let reserved = 0;
    while (t.canAllocate()) {
      t.allocate();
      reserved++;
    }
    expect(reserved).toBe(9);
  });

  it('エンティティ数の上限では spawn が PlutoError(CapacityExceeded)', () => {
    const t = new EntityTable(1);
    const cb = new CommandBuffer(64, t);
    cb.spawn1(A);
    expect(() => cb.spawn1(A)).toThrow(PlutoError);
  });

  it('capacity が 5 未満なら PlutoError(InvalidArgument)', () => {
    expect(() => new CommandBuffer(4, new EntityTable(1))).toThrow(
      expect.objectContaining({ code: ErrorCode.InvalidArgument }),
    );
  });
});
