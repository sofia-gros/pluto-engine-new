/**
 * @file core/ecs モジュールの公開窓口。
 */
export {
  ENTITY_INDEX_BITS,
  ENTITY_INDEX_MASK,
  ENTITY_GENERATION_MASK,
  MAX_ENTITIES,
  NULL_ENTITY,
  makeEntity,
  entityIndex,
  entityGeneration,
} from './entity';
export type { Entity } from './entity';
export { EntityTable, NULL_ARCHETYPE } from './entity-table';
export type { ComponentSchema, FieldToken } from './schema';
export {
  defineComponent,
  MAX_COMPONENTS,
  COMPONENT_REGISTRY,
  getComponentLayout,
  applyComponentLayout,
} from './component';
export type {
  AnyComponentDef,
  ComponentDef,
  ComponentId,
  ComponentLayout,
  ComponentLayoutEntry,
} from './component';
export { Column, INITIAL_ARCHETYPE_ROWS, createTrackingView } from './column';
export { Archetype } from './archetype';
export type { SharedArchetypeDesc, ArchetypeGrowCallback } from './archetype';
export { ArchetypeGraph, MAX_ARCHETYPES, maskToKey } from './archetype-graph';
export type { ArchetypeCreatedCallback } from './archetype-graph';
export { ChangeTracker, DIRTY_BLOCK_ROWS } from './change-tracking';
export type { DirtyRangeCallback, SharedDirtyDesc } from './change-tracking';
export { ChunkView, CHUNK_ROWS } from './chunk-view';
export { Query, queryKey } from './query';
export type { QueryDesc, ChunkCallback } from './query';
export {
  CommandBuffer,
  CMD_SPAWN,
  CMD_DESPAWN,
  CMD_ADD_COMPONENT,
  CMD_REMOVE_COMPONENT,
  CMD_SET,
} from './command-buffer';
export { defineSystem, Phase, MAX_KERNEL_PARAMS } from './system';
export type { KernelExecutor, KernelRef, SystemDef, SystemRunFn } from './system';
export { World, DEFAULT_MAX_ENTITIES, DEFAULT_COMMAND_CAPACITY } from './world';
export type { WorldConfig } from './world';
