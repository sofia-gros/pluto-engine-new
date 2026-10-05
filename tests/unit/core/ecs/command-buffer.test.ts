import { describe, expect, it } from 'vitest';
import {
  CommandBuffer,
  CMD_SPAWN,
  CMD_DESPAWN,
  CMD_ADD_COMPONENT,
  CMD_REMOVE_COMPONENT,
  CMD_SET,
} from '../../../../src/core/ecs/command-buffer';
import { EntityTable } from '../../../../src/core/ecs/entity-table';
import { defineComponent } from '../../../../src/core/ecs/component';
import { ScalarType } from '../../../../src/core/memory/scalar-type';
import type { Entity } from '../../../../src/core/ecs/entity';

const CompA = defineComponent('CompA', { a: ScalarType.F32 });
const CompB = defineComponent('CompB', { b: ScalarType.I32 });

describe('CommandBuffer', () => {
  it('records spawn command', () => {
    const table = new EntityTable(100);
    const cb = new CommandBuffer(100, table);

    const e = cb.spawn(CompA, CompB);

    // allocate されたがまだ isAlive は false
    expect(table.isAlive(e)).toBe(false);

    const data = cb.data;
    expect(data[0]).toBe(CMD_SPAWN);
    expect(data[1]).toBe(e);
    expect(data[2]).toBe(2); // components.length
    expect(data[3]).toBe(CompA.id);
    expect(data[4]).toBe(CompB.id);
  });

  it('records despawn command', () => {
    const table = new EntityTable(100);
    const cb = new CommandBuffer(100, table);
    const e = 123 as Entity;

    cb.despawn(e);
    expect(cb.data[0]).toBe(CMD_DESPAWN);
    expect(cb.data[1]).toBe(e);
  });

  it('records addComponent command', () => {
    const table = new EntityTable(100);
    const cb = new CommandBuffer(100, table);
    const e = 123 as Entity;

    cb.addComponent(e, CompA);
    expect(cb.data[0]).toBe(CMD_ADD_COMPONENT);
    expect(cb.data[1]).toBe(e);
    expect(cb.data[2]).toBe(CompA.id);
  });

  it('records removeComponent command', () => {
    const table = new EntityTable(100);
    const cb = new CommandBuffer(100, table);
    const e = 123 as Entity;

    cb.removeComponent(e, CompA);
    expect(cb.data[0]).toBe(CMD_REMOVE_COMPONENT);
    expect(cb.data[1]).toBe(e);
    expect(cb.data[2]).toBe(CompA.id);
  });

  it('records set command for F32 and I32', () => {
    const table = new EntityTable(100);
    const cb = new CommandBuffer(100, table);
    const e = 123 as Entity;

    cb.set(e, CompA.a, 3.14);
    cb.set(e, CompB.b, -42);

    expect(cb.data[0]).toBe(CMD_SET);
    expect(cb.data[1]).toBe(e);
    expect(cb.data[2]).toBe(CompA.a.fieldId);
    expect(cb.data[3]).toBe(ScalarType.F32);
    // 4番目はF32なので floatView 経由で確認する
    expect(cb.floatData[4]).toBeCloseTo(3.14);

    expect(cb.data[5]).toBe(CMD_SET);
    expect(cb.data[6]).toBe(e);
    expect(cb.data[7]).toBe(CompB.b.fieldId);
    expect(cb.data[8]).toBe(ScalarType.I32);
    expect(cb.int32Data[9]).toBe(-42);
  });

  it('throws when capacity exceeded', () => {
    const table = new EntityTable(100);
    const cb = new CommandBuffer(2, table); // 小さな容量

    expect(() => {
      cb.despawn(123 as Entity);
    }).not.toThrow();
    // 容量超過
    expect(() => {
      cb.despawn(124 as Entity);
    }).toThrow();
  });
});
