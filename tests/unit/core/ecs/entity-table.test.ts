import { describe, expect, it } from 'vitest';
import { EntityTable, NULL_ARCHETYPE } from '../../../../src/core/ecs/entity-table';
import {
  MAX_ENTITIES,
  NULL_ENTITY,
  entityGeneration,
  entityIndex,
  makeEntity,
} from '../../../../src/core/ecs/entity';
import { PlutoError } from '../../../../src/core/debug/pluto-error';

describe('EntityTable', () => {
  it('allocate 直後は予約済みだが生存していない。update で所属させると生存する', () => {
    const t = new EntityTable(4);
    const e = t.allocate();
    expect(t.isReserved(e)).toBe(true);
    expect(t.isAlive(e)).toBe(false);
    expect(t.getArchetype(e)).toBe(NULL_ARCHETYPE);
    t.update(e, 3, 7);
    expect(t.isAlive(e)).toBe(true);
    expect(t.getArchetype(e)).toBe(3);
    expect(t.getRow(e)).toBe(7);
  });

  it('destroy で世代が進み、同じ index が新しい世代で再利用される', () => {
    const t = new EntityTable(1);
    const e1 = t.allocate();
    t.update(e1, 0, 0);
    t.destroy(e1);
    expect(t.isAlive(e1)).toBe(false);
    const e2 = t.allocate();
    expect(entityIndex(e2)).toBe(entityIndex(e1));
    expect(entityGeneration(e2)).toBe(entityGeneration(e1) + 1);
    expect(t.isReserved(e1)).toBe(false);
  });

  it('世代は 1023 の次に 0 へ循環する', () => {
    const t = new EntityTable(1);
    let e = t.allocate();
    for (let i = 0; i < 1024; i++) {
      t.update(e, 0, 0);
      t.destroy(e);
      e = t.allocate();
    }
    expect(entityGeneration(e)).toBe(0);
  });

  it('NULL_ENTITY・範囲外の index は生存していない', () => {
    const t = new EntityTable(2);
    expect(t.isAlive(NULL_ENTITY)).toBe(false);
    expect(t.isReserved(NULL_ENTITY)).toBe(false);
    expect(t.isAlive(makeEntity(5, 0))).toBe(false);
    expect(t.isReserved(makeEntity(5, 0))).toBe(false);
  });

  it('容量を使い切ると canAllocate が false になり、allocate は PlutoError (release でも不正な index を返さない)', () => {
    const t = new EntityTable(2);
    t.allocate();
    t.allocate();
    expect(t.canAllocate()).toBe(false);
    expect(() => t.allocate()).toThrow(PlutoError);
  });

  it('capacity が 0 以下・MAX_ENTITIES 超・非整数なら PlutoError', () => {
    expect(() => new EntityTable(0)).toThrow(PlutoError);
    expect(() => new EntityTable(MAX_ENTITIES + 1)).toThrow(PlutoError);
    expect(() => new EntityTable(1.5)).toThrow(PlutoError);
  });

  it('生存していないエンティティの destroy は assert で失敗する', () => {
    const t = new EntityTable(1);
    const e = t.allocate();
    expect(() => {
      t.destroy(e);
    }).toThrow(PlutoError);
  });
});
