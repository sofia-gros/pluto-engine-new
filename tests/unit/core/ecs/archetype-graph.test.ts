import { describe, expect, it } from 'vitest';
import { ArchetypeGraph, maskToString } from '../../../../src/core/ecs/archetype-graph';
import { defineComponent } from '../../../../src/core/ecs/component';
import type { AnyComponentDef } from '../../../../src/core/ecs/component';
import { ScalarType } from '../../../../src/core/memory/scalar-type';
import { Bitset } from '../../../../src/core/memory/bitset';

const CompA = defineComponent('CompA', { v: ScalarType.F32 });
const CompB = defineComponent('CompB', { v: ScalarType.F32 });

describe('ArchetypeGraph', () => {
  it('maskToString converts bitset to string correctly', () => {
    const mask = new Bitset(256);
    mask.set(1);
    mask.set(5);
    mask.set(10);
    expect(maskToString(mask)).toBe('1,5,10');
  });

  it('initializes with empty archetype (ID: 0)', () => {
    const graph = new ArchetypeGraph(10000);
    const arch0 = graph.getArchetypeById(0);
    expect(arch0).toBeDefined();
    expect(arch0?.id).toBe(0);
    expect(arch0?.mask.test(CompA.id)).toBe(false);
  });

  it('gets or creates archetype', () => {
    const graph = new ArchetypeGraph(10000);
    const archA1 = graph.getOrCreateArchetype([CompA]);
    const archA2 = graph.getOrCreateArchetype([CompA]); // キャッシュされるはず

    expect(archA1.id).toBe(archA2.id);
    expect(archA1.hasComponent(CompA.id)).toBe(true);

    const archAB = graph.getOrCreateArchetype([CompA, CompB]);
    expect(archAB.id).not.toBe(archA1.id);
    expect(archAB.hasComponent(CompA.id)).toBe(true);
    expect(archAB.hasComponent(CompB.id)).toBe(true);
  });

  it('handles transitions (add and remove) with edge caching', () => {
    const graph = new ArchetypeGraph(10000);
    const allComponents: AnyComponentDef[] = [];
    allComponents[CompA.id] = CompA;
    allComponents[CompB.id] = CompB;

    const emptyArch = graph.getArchetypeById(0);
    if (!emptyArch) throw new Error('emptyArch not found');

    // Add CompA
    const archA = graph.transition(emptyArch, CompA, true, allComponents);
    expect(archA.hasComponent(CompA.id)).toBe(true);

    // Cache hit on Add CompA
    const archACached = graph.transition(emptyArch, CompA, true, allComponents);
    expect(archACached.id).toBe(archA.id);

    // Add CompB to archA
    const archAB = graph.transition(archA, CompB, true, allComponents);
    expect(archAB.hasComponent(CompA.id)).toBe(true);
    expect(archAB.hasComponent(CompB.id)).toBe(true);

    // Remove CompA from archAB
    const archB = graph.transition(archAB, CompA, false, allComponents);
    expect(archB.hasComponent(CompA.id)).toBe(false);
    expect(archB.hasComponent(CompB.id)).toBe(true);

    // Get non-existent archetype
    expect(graph.getArchetypeById(9999)).toBeUndefined();
  });
});
