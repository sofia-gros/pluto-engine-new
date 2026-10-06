import { describe, expect, it } from 'vitest';
import {
  MAX_ENTITIES,
  NULL_ENTITY,
  entityGeneration,
  entityIndex,
  makeEntity,
} from '../../../../src/core/ecs/entity';

describe('entity', () => {
  it('index と世代を pack / unpack できる', () => {
    const e = makeEntity(12345, 678);
    expect(entityIndex(e)).toBe(12345);
    expect(entityGeneration(e)).toBe(678);
  });

  it('境界値: index の最大値 (MAX_ENTITIES - 1) と世代 1023 を往復できる', () => {
    const e = makeEntity(MAX_ENTITIES - 1, 1023);
    expect(entityIndex(e)).toBe(MAX_ENTITIES - 1);
    expect(entityGeneration(e)).toBe(1023);
    expect(e).toBeGreaterThanOrEqual(0);
  });

  it('世代は 10 ビットで循環する', () => {
    expect(entityGeneration(makeEntity(1, 1024))).toBe(0);
  });

  it('MAX_ENTITIES は 4194303 で、index 0x3FFFFF は NULL_ENTITY 用に予約されている', () => {
    expect(MAX_ENTITIES).toBe(4194303);
    expect(makeEntity(0x3fffff, 1023)).toBe(NULL_ENTITY);
    expect(makeEntity(MAX_ENTITIES - 1, 1023)).not.toBe(NULL_ENTITY);
  });
});
