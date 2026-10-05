import { describe, expect, it } from 'vitest';
import {
  makeEntity,
  entityIndex,
  entityGeneration,
  NULL_ENTITY,
  ENTITY_INDEX_MASK,
  ENTITY_GENERATION_MASK,
} from '../../../../src/core/ecs/entity';

describe('Entity', () => {
  it('makes entity and retrieves index and generation', () => {
    const e = makeEntity(123, 45);
    expect(entityIndex(e)).toBe(123);
    expect(entityGeneration(e)).toBe(45);
  });

  it('handles boundary values', () => {
    const maxIndex = ENTITY_INDEX_MASK;
    const maxGen = ENTITY_GENERATION_MASK;
    const e = makeEntity(maxIndex, maxGen);

    expect(entityIndex(e)).toBe(maxIndex);
    expect(entityGeneration(e)).toBe(maxGen);
  });

  it('handles 0', () => {
    const e = makeEntity(0, 0);
    expect(entityIndex(e)).toBe(0);
    expect(entityGeneration(e)).toBe(0);
  });

  it('handles NULL_ENTITY', () => {
    expect(entityIndex(NULL_ENTITY)).toBe(ENTITY_INDEX_MASK);
    expect(entityGeneration(NULL_ENTITY)).toBe(ENTITY_GENERATION_MASK);
  });
});
