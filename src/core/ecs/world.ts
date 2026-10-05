/**
 * @file ECSのコア。エンティティ、アーキタイプ、クエリ、システムを統括する。
 */

import { assert } from '../debug/assert';
import { EntityTable } from './entity-table';
import { ArchetypeGraph } from './archetype-graph';
import {
  CommandBuffer,
  CMD_SPAWN,
  CMD_DESPAWN,
  CMD_ADD_COMPONENT,
  CMD_REMOVE_COMPONENT,
  CMD_SET,
} from './command-buffer';
import { Query, type QueryDesc } from './query';
import type { AnyComponentDef } from './component';
import { COMPONENT_REGISTRY } from './component';
import { type Entity, MAX_ENTITIES } from './entity';
import type { FieldToken } from './schema';
import { ScalarType } from '../memory/scalar-type';
import type { SystemDef, Phase } from './system';

export interface WorldConfig {
  maxEntities?: number;
  maxRowsPerArchetype?: number;
  commandCapacity?: number;
}

export class World {
  private readonly entityTable: EntityTable;
  private readonly graph: ArchetypeGraph;
  public readonly commands: CommandBuffer;

  private readonly queries: Query[] = [];

  // システムリスト: フェーズごとに配列で保持
  private readonly systems = new Map<Phase, SystemDef[]>();

  public isIterating = false;

  public constructor(config?: WorldConfig) {
    const maxEntities = config?.maxEntities ?? MAX_ENTITIES;
    const maxRowsPerArchetype = config?.maxRowsPerArchetype ?? maxEntities;
    const commandCapacity = config?.commandCapacity ?? 1_048_576;

    this.entityTable = new EntityTable(maxEntities);
    this.graph = new ArchetypeGraph(maxRowsPerArchetype);
    this.commands = new CommandBuffer(commandCapacity, this.entityTable);
  }

  /**
   * エンティティを即時生成する。
   * (システム実行中(isIterating=true)はアサーションエラー)
   */
  public spawn(...components: AnyComponentDef[]): Entity {
    assert(
      !this.isIterating,
      'World: イテレーション中の即時spawnは禁止です。CommandBufferを使用してください',
    );

    const entity = this.entityTable.allocate();
    const archetype = this.graph.getOrCreateArchetype(components);
    const row = archetype.pushRow(entity);
    this.entityTable.update(entity, archetype.id, row);

    // 新しいアーキタイプが生成された可能性があるので、クエリのマッチングを更新
    for (const q of this.queries) {
      q.tryRegister(archetype);
    }

    return entity;
  }

  /**
   * エンティティを即時破棄する。
   */
  public despawn(e: Entity): void {
    assert(!this.isIterating, 'World: イテレーション中の即時despawnは禁止です');
    if (!this.entityTable.isAlive(e)) return;

    const archId = this.entityTable.getArchetype(e);
    const row = this.entityTable.getRow(e);
    const arch = this.graph.getArchetypeById(archId);

    if (arch) {
      const movedEntity = arch.swapRemove(row);
      if (movedEntity !== 0) {
        this.entityTable.update(movedEntity, arch.id, row);
      }
    }
    this.entityTable.destroy(e);
  }

  /**
   * コンポーネントを即時追加する。
   */
  public addComponent(e: Entity, c: AnyComponentDef): void {
    assert(!this.isIterating, 'World: イテレーション中の構造変更は禁止です');
    if (!this.entityTable.isAlive(e)) return;

    const archId = this.entityTable.getArchetype(e);
    const arch = this.graph.getArchetypeById(archId);
    assert(arch !== undefined, 'World: アーキタイプが存在しません');

    if (arch.hasComponent(c.id)) return;

    const row = this.entityTable.getRow(e);
    const nextArch = this.graph.transition(arch, c, true, COMPONENT_REGISTRY);
    const nextRow = nextArch.pushRow(e);

    arch.copyRowTo(row, nextArch, nextRow);
    const movedEntity = arch.swapRemove(row);
    if (movedEntity !== 0) {
      this.entityTable.update(movedEntity, arch.id, row);
    }
    this.entityTable.update(e, nextArch.id, nextRow);

    for (const q of this.queries) {
      q.tryRegister(nextArch);
    }
  }

  /**
   * コンポーネントを即時削除する。
   */
  public removeComponent(e: Entity, c: AnyComponentDef): void {
    assert(!this.isIterating, 'World: イテレーション中の構造変更は禁止です');
    if (!this.entityTable.isAlive(e)) return;

    const archId = this.entityTable.getArchetype(e);
    const arch = this.graph.getArchetypeById(archId);
    assert(arch !== undefined, 'World: アーキタイプが存在しません');

    if (!arch.hasComponent(c.id)) return;

    const row = this.entityTable.getRow(e);
    const nextArch = this.graph.transition(arch, c, false, COMPONENT_REGISTRY);
    const nextRow = nextArch.pushRow(e);

    arch.copyRowTo(row, nextArch, nextRow);
    const movedEntity = arch.swapRemove(row);
    if (movedEntity !== 0) {
      this.entityTable.update(movedEntity, arch.id, row);
    }
    this.entityTable.update(e, nextArch.id, nextRow);

    for (const q of this.queries) {
      q.tryRegister(nextArch);
    }
  }

  /**
   * コンポーネントを持っているか確認する。
   */
  public hasComponent(e: Entity, c: AnyComponentDef): boolean {
    if (!this.entityTable.isAlive(e)) return false;
    const archId = this.entityTable.getArchetype(e);
    const arch = this.graph.getArchetypeById(archId);
    return arch ? arch.hasComponent(c.id) : false;
  }

  public isAlive(e: Entity): boolean {
    return this.entityTable.isAlive(e);
  }

  /**
   * コンポーネントのフィールド値を取得する。
   */
  public get<T extends ScalarType>(e: Entity, field: FieldToken<T>): number {
    assert(this.isAlive(e), 'World: 死んだエンティティにアクセスしました');
    const archId = this.entityTable.getArchetype(e);
    const row = this.entityTable.getRow(e);
    const arch = this.graph.getArchetypeById(archId);
    assert(arch !== undefined, 'World: アーキタイプが存在しません');
    return arch.getColumn(field)[row];
  }

  /**
   * コンポーネントのフィールド値を設定し、dirtyを立てる。
   */
  public set<T extends ScalarType>(e: Entity, field: FieldToken<T>, v: number): void {
    assert(this.isAlive(e), 'World: 死んだエンティティにアクセスしました');
    const archId = this.entityTable.getArchetype(e);
    const row = this.entityTable.getRow(e);
    const arch = this.graph.getArchetypeById(archId);
    assert(arch !== undefined, 'World: アーキタイプが存在しません');
    arch.getColumn(field)[row] = v;
    arch.changeTracker.markRange(field.fieldId, row, row + 1);
  }

  private readonly queryCache = new Map<string, Query>();

  /**
   * 指定した条件のQueryを取得する（キャッシュ付き）
   */
  public query(desc: QueryDesc): Query {
    // 簡易的にJSONをキーにしてキャッシュする
    const key = JSON.stringify(desc);
    let q = this.queryCache.get(key);
    if (!q) {
      q = new Query(desc);
      this.queries.push(q);
      for (const arch of this.graph.getArchetypes()) {
        q.tryRegister(arch);
      }
      this.queryCache.set(key, q);
    }
    return q;
  }

  public addSystem(s: SystemDef): void {
    let list = this.systems.get(s.phase);
    if (!list) {
      list = [];
      this.systems.set(s.phase, list);
    }
    list.push(s);
    list.sort((a, b) => (a.order ?? 0) - (b.order ?? 0));
  }

  /**
   * 特定のフェーズのシステムを逐次実行する。
   */
  public runPhase(phase: Phase, dt: number): void {
    const list = this.systems.get(phase);
    if (!list) return;

    this.isIterating = true;
    const len = list.length;
    for (let i = 0; i < len; i++) {
      const s = list[i];
      if (s.run) {
        s.run(this, dt);
      }
    }
    this.isIterating = false;
  }

  /**
   * コマンドバッファに蓄積された構造変更と値更新を適用する。
   */
  public flush(): void {
    const data = this.commands.data;
    const len = data.length;
    let i = 0;

    // isIterating フラグを降ろして即時APIを使用可能にする
    const wasIterating = this.isIterating;
    this.isIterating = false;

    while (i < len) {
      const op = data[i++];
      if (op === CMD_SPAWN) {
        const entity = data[i++] as Entity;
        const count = data[i++];
        const components: AnyComponentDef[] = [];
        for (let j = 0; j < count; j++) {
          const compId = data[i++];
          components.push(COMPONENT_REGISTRY[compId]);
        }
        const archetype = this.graph.getOrCreateArchetype(components);
        const row = archetype.pushRow(entity);
        this.entityTable.update(entity, archetype.id, row);

        const qLen = this.queries.length;
        for (let q = 0; q < qLen; q++) {
          this.queries[q].tryRegister(archetype);
        }
      } else if (op === CMD_DESPAWN) {
        const entity = data[i++] as Entity;
        this.despawn(entity);
      } else if (op === CMD_ADD_COMPONENT) {
        const entity = data[i++] as Entity;
        const compId = data[i++];
        this.addComponent(entity, COMPONENT_REGISTRY[compId]);
      } else if (op === CMD_REMOVE_COMPONENT) {
        const entity = data[i++] as Entity;
        const compId = data[i++];
        this.removeComponent(entity, COMPONENT_REGISTRY[compId]);
      } else if (op === CMD_SET) {
        const entity = data[i++] as Entity;
        const fieldId = data[i++];
        const type = data[i++];
        let value: number;
        if (type === ScalarType.F32) {
          value = this.commands.floatData[i++];
        } else {
          value = this.commands.int32Data[i++];
        }

        if (this.entityTable.isAlive(entity)) {
          const archId = this.entityTable.getArchetype(entity);
          const arch = this.graph.getArchetypeById(archId);
          if (arch) {
            const row = this.entityTable.getRow(entity);
            const col = arch.getColumnByFieldId(fieldId); // 拡張が必要
            if (col) {
              col[row] = value;
              arch.changeTracker.markRange(fieldId, row, row + 1);
            }
          }
        }
      }
    }

    this.commands.clear();
    this.isIterating = wasIterating;
  }
}
