import { describe, expect, it } from 'vitest';
import { EntityTable } from '../../../../src/core/ecs/entity-table';
import type { Entity } from '../../../../src/core/ecs/entity';
import { NULL_ENTITY, entityIndex, entityGeneration } from '../../../../src/core/ecs/entity';

describe('EntityTable', () => {
  it('initializes correctly', () => {
    const table = new EntityTable(100);
    expect(table.capacity).toBe(100);
    expect(table.isAlive(NULL_ENTITY)).toBe(false);
  });

  it('creates and destroys entities', () => {
    const table = new EntityTable(10);

    const e1 = table.create();
    expect(table.isAlive(e1)).toBe(true);
    expect(entityIndex(e1)).toBe(0);
    expect(entityGeneration(e1)).toBe(0);
    expect(table.getArchetype(e1)).toBe(0);
    expect(table.getRow(e1)).toBe(0);

    const e2 = table.create();
    expect(table.isAlive(e2)).toBe(true);
    expect(entityIndex(e2)).toBe(1);

    table.destroy(e1);
    expect(table.isAlive(e1)).toBe(false);

    // 再利用されるはず
    const e3 = table.create();
    expect(table.isAlive(e3)).toBe(true);
    expect(entityIndex(e3)).toBe(0);
    expect(entityGeneration(e3)).toBe(1); // generationが進む

    expect(table.isAlive(e1)).toBe(false); // 古いエンティティは死んだまま
  });

  it('updates archetype and row', () => {
    const table = new EntityTable(10);
    const e = table.create();

    table.update(e, 5, 42);
    expect(table.getArchetype(e)).toBe(5);
    expect(table.getRow(e)).toBe(42);
  });

  it('fails isAlive for invalid entities', () => {
    const table = new EntityTable(10);
    const e = table.create();
    table.destroy(e);

    // generation mismatch
    expect(table.isAlive(e)).toBe(false);

    // out of bounds
    // (mocking an out of bounds entity)
    const outOfBounds = 99999 as Entity;
    expect(table.isAlive(outOfBounds)).toBe(false);
  });

  it('throws on capacity exceed', () => {
    const table = new EntityTable(2);
    table.create();
    table.create();
    expect(() => table.create()).toThrow(); // 空きがない
  });

  it('throws on destroying already dead entity', () => {
    const table = new EntityTable(2);
    const e = table.create();
    table.destroy(e);
    expect(() => {
      table.destroy(e);
    }).toThrow();
  });
});
