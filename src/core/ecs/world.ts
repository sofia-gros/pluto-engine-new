/**
 * @file World: エンティティ・アーキタイプ・クエリ・システム・同期点をまとめる (docs/04-memory-and-ecs.md §7〜9)。
 */
import { assert, ErrorCode, PlutoError } from '../debug';
import { ScalarType } from '../memory';
import type { Archetype } from './archetype';
import { ArchetypeGraph } from './archetype-graph';
import {
  CMD_ADD_COMPONENT,
  CMD_DESPAWN,
  CMD_REMOVE_COMPONENT,
  CMD_SET,
  CMD_SPAWN,
  CommandBuffer,
} from './command-buffer';
import { COMPONENT_REGISTRY } from './component';
import type { AnyComponentDef } from './component';
import { MAX_ENTITIES, NULL_ENTITY } from './entity';
import type { Entity } from './entity';
import { EntityTable } from './entity-table';
import { Query, queryKey } from './query';
import type { QueryDesc } from './query';
import type { FieldToken } from './schema';
import { defineSystem } from './system';
import type { KernelExecutor, Phase, SystemDef } from './system';
import type { SpawnState } from './world-spawn';
import { archetypeOfIds, spawnOne, spawnRows } from './world-spawn';

/** `WorldConfig.maxEntities` の既定値。 */
export const DEFAULT_MAX_ENTITIES = 1_048_576;
/** `WorldConfig.commandCapacity` の既定値 (u32 語数)。 */
export const DEFAULT_COMMAND_CAPACITY = 1_048_576;

/** World の設定。 */
export interface WorldConfig {
  /** 最大エンティティ数 (既定 1,048,576、上限 MAX_ENTITIES)。 */
  maxEntities?: number;
  /** 1 アーキタイプの最大行数 (既定 = maxEntities)。 */
  maxRowsPerArchetype?: number;
  /** コマンドバッファの容量 (u32 語数、既定 1,048,576)。 */
  commandCapacity?: number;
}

/** 登録済みシステムの内部表現。 */
interface SystemEntry {
  readonly def: SystemDef;
  readonly query: Query;
  readonly params: Float32Array;
  readonly order: number;
  readonly seq: number;
}

/**
 * SoA ECS の中心。即時 API (spawn 等) はシステム実行外でのみ使い、システム内では `commands` に積む。
 */
export class World {
  /** 遅延コマンド (同期点 `flush()` で適用)。 */
  public readonly commands: CommandBuffer;
  /** アーキタイプの集合と遷移。 */
  public readonly graph: ArchetypeGraph;
  private readonly entityTable: EntityTable;
  private readonly queryList: Query[] = [];
  private readonly queryCache = new Map<string, Query>();
  private readonly systemsByPhase: SystemEntry[][] = [[], [], [], [], []];
  private iterating = false;
  private version = 0;
  private syncedVersion = -1;
  private executor: KernelExecutor | null = null;
  private systemSeq = 0;
  /** 新しいアーキタイプを全クエリに登録する (ArchetypeGraph から 1 回だけ呼ばれる)。 */
  private readonly onArchetypeCreated = (arch: Archetype): void => {
    for (const q of this.queryList) q.tryRegister(arch);
    this.version++;
  };
  /** バッファが作り直されたら版を進め、jobs に Worker へ送り直させる (E-002)。 */
  private readonly onArchetypeGrown = (): void => {
    this.version++;
  };
  /**
   * spawn の実装本体へ渡す内部状態 (graph の生成後に組み立てる)。
   * 実行中フラグは複製せず `this.iterating` を直接読ませる。
   * 複製すると `flush()` の入れ子復帰などで値が追従せず、実バグになる。
   */
  private readonly spawnState: SpawnState;

  /**
   * @param config 設定 (省略時は既定値)
   */
  public constructor(config?: WorldConfig) {
    const maxEntities = config?.maxEntities ?? DEFAULT_MAX_ENTITIES;
    if (!Number.isInteger(maxEntities) || maxEntities < 1 || maxEntities > MAX_ENTITIES) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        'WorldConfig.maxEntities は 1 以上 4194303 (MAX_ENTITIES) 以下の整数にしてください。',
      );
    }
    this.entityTable = new EntityTable(maxEntities);
    const rows = config?.maxRowsPerArchetype ?? maxEntities;
    this.graph = new ArchetypeGraph(rows, this.onArchetypeCreated, this.onArchetypeGrown);
    this.spawnState = {
      isIterating: () => this.iterating,
      graph: this.graph,
      entityTable: this.entityTable,
    };
    this.commands = new CommandBuffer(
      config?.commandCapacity ?? DEFAULT_COMMAND_CAPACITY,
      this.entityTable,
    );
  }

  /** システム実行中か (実行中は即時 API を使えない)。 */
  public get isIterating(): boolean {
    return this.iterating;
  }

  /** アーキタイプ・クエリの新規作成、クエリへの登録、アーキタイプのバッファ作り直しで増える版番号 (jobs の同期判定に使う)。 */
  public get structureVersion(): number {
    return this.version;
  }

  /** 作成済みのクエリ (作成順)。 */
  public get queries(): readonly Query[] {
    return this.queryList;
  }

  /**
   * カーネルシステムの実行者 (jobs の Scheduler) を設定する。
   * @param executor 実行者
   */
  public setExecutor(executor: KernelExecutor): void {
    this.executor = executor;
    this.syncedVersion = -1;
  }

  /**
   * エンティティを即時に生成する (システム実行外でのみ)。
   * @param components コンポーネント
   * @returns 生成したエンティティ
   */
  public spawn(...components: AnyComponentDef[]): Entity {
    return spawnOne(this.spawnState, components);
  }

  /**
   * 同じ構成の `count` 体を一括生成し、最初の Entity を返す (docs/04 §4.2)。
   * 行をまとめて確保するので 1 体ごとに dirty ビットを立てない。
   * @param count 生成する体数
   * @param components 付与するコンポーネント
   * @returns 最初の Entity。`count` が 0 のときは NULL_ENTITY
   */
  public spawnN(count: number, components: readonly AnyComponentDef[]): Entity {
    return spawnRows(this.spawnState, count, components);
  }

  /**
   * エンティティを即時に破棄する。未生存なら何もしない。
   * @param e 破棄するエンティティ
   */
  public despawn(e: Entity): void {
    assert(!this.iterating, 'World: システム実行中は即時 despawn できません');
    if (!this.entityTable.isAlive(e)) return;
    this.removeRow(e, this.archetypeOf(e));
    this.entityTable.destroy(e);
  }

  /**
   * コンポーネントを即時に追加する (既に持っていれば何もしない)。
   * @param e エンティティ
   * @param c コンポーネント
   */
  public addComponent(e: Entity, c: AnyComponentDef): void {
    this.move(e, c, true);
  }

  /**
   * コンポーネントを即時に削除する (持っていなければ何もしない)。
   * @param e エンティティ
   * @param c コンポーネント
   */
  public removeComponent(e: Entity, c: AnyComponentDef): void {
    this.move(e, c, false);
  }

  /**
   * コンポーネントを持つか。
   * @param e エンティティ
   * @param c コンポーネント
   * @returns 生存していて持っていれば true
   */
  public hasComponent(e: Entity, c: AnyComponentDef): boolean {
    return this.entityTable.isAlive(e) && this.archetypeOf(e).hasComponent(c.id);
  }

  /**
   * エンティティが生存しているか。
   * @param e エンティティ
   * @returns 生存していれば true
   */
  public isAlive(e: Entity): boolean {
    return this.entityTable.isAlive(e);
  }

  /**
   * フィールドの値を読む (コールドパス用)。
   * @param e 生存しているエンティティ
   * @param field フィールド
   * @returns 値
   */
  public get<T extends ScalarType>(e: Entity, field: FieldToken<T>): number {
    assert(this.entityTable.isAlive(e), 'World: 生存していないエンティティです');
    return this.archetypeOf(e).getColumn(field)[this.entityTable.getRow(e)];
  }

  /**
   * フィールドの値を書き、dirty を立てる (コールドパス用)。
   * @param e 生存しているエンティティ
   * @param field フィールド
   * @param value 値
   */
  public set<T extends ScalarType>(e: Entity, field: FieldToken<T>, value: number): void {
    assert(this.entityTable.isAlive(e), 'World: 生存していないエンティティです');
    const arch = this.archetypeOf(e);
    const row = this.entityTable.getRow(e);
    arch.getColumn(field)[row] = value;
    arch.changeTracker.markRange(field.fieldId, row, row + 1);
  }

  /**
   * クエリを取得する。同じ条件 (順序によらない) なら同じインスタンスを返す。
   * @param desc 条件
   * @returns クエリ
   */
  public query(desc: QueryDesc): Query {
    const key = queryKey(desc);
    const cached = this.queryCache.get(key);
    if (cached !== undefined) return cached;
    const q = new Query(desc);
    for (const arch of this.graph.getArchetypes()) q.tryRegister(arch);
    this.queryList.push(q);
    this.queryCache.set(key, q);
    this.version++;
    return q;
  }

  /**
   * システムを登録する。
   * @param def システム記述子
   */
  public addSystem(def: SystemDef): void {
    defineSystem(def);
    const entry: SystemEntry = {
      def,
      query: this.query(def.query),
      params: def.params ?? new Float32Array(1),
      order: def.order ?? 0,
      seq: this.systemSeq++,
    };
    const list = this.systemsByPhase[def.phase];
    list.push(entry);
    list.sort((a, b) => a.order - b.order || a.seq - b.seq);
  }

  /**
   * フェーズのシステムを順に実行する。kernel システムは実行者 (Scheduler) でチャンク並列に動かす。
   * @param phase フェーズ
   * @param dt 経過時間 (秒)
   */
  public runPhase(phase: Phase, dt: number): void {
    const list = this.systemsByPhase[phase];
    this.iterating = true;
    try {
      const n = list.length;
      for (let i = 0; i < n; i++) this.runSystem(list[i], dt);
    } finally {
      this.iterating = false;
    }
  }

  /**
   * コマンドバッファの構造変更と値設定を適用する (同期点)。
   */
  public flush(): void {
    const data = this.commands.data;
    const isNested = this.iterating;
    this.iterating = false;
    let i = 0;
    while (i < data.length) {
      const op = data[i];
      const e = data[i + 1] as Entity;
      if (op === CMD_SPAWN) {
        const n = data[i + 2];
        const arch = archetypeOfIds(this.graph, data, i + 3, n);
        this.entityTable.update(e, arch.id, arch.pushRow(e));
        i += 3 + n;
      } else if (op === CMD_DESPAWN) {
        this.despawn(e);
        i += 2;
      } else if (op === CMD_ADD_COMPONENT || op === CMD_REMOVE_COMPONENT) {
        this.move(e, COMPONENT_REGISTRY[data[i + 2]], op === CMD_ADD_COMPONENT);
        i += 3;
      } else if (op === CMD_SET) {
        const isFloat = data[i + 3] === ScalarType.F32;
        this.applySet(
          e,
          data[i + 2],
          isFloat ? this.commands.floatData[i + 4] : this.commands.int32Data[i + 4],
        );
        i += 5;
      } else {
        throw new PlutoError(ErrorCode.InvalidState, 'World.flush: 不明なコマンドです。');
      }
    }
    this.commands.clear();
    this.iterating = isNested;
  }

  /**
   * 1 つのシステムを実行する。
   * @param s 登録済みシステム
   * @param dt 経過時間 (秒)
   */
  private runSystem(s: SystemEntry, dt: number): void {
    const kernel = s.def.kernel;
    if (kernel === undefined) {
      s.def.run?.(this, dt);
      return;
    }
    const executor = this.executor;
    if (executor === null) {
      throw new PlutoError(
        ErrorCode.NotInitialized,
        `システム ${s.def.name}: カーネルの実行者が未設定です。World.setExecutor() でスケジューラを設定してください。`,
      );
    }
    if (this.syncedVersion !== this.version) {
      executor.syncWorld(this);
      this.syncedVersion = this.version;
    }
    s.params[0] = dt;
    executor.runKernel(kernel, s.query, s.params);
  }

  /**
   * 生存エンティティの所属アーキタイプを返す。
   * @param e エンティティ
   * @returns アーキタイプ
   */
  private archetypeOf(e: Entity): Archetype {
    const arch = this.graph.getArchetypeById(this.entityTable.getArchetype(e));
    assert(arch !== undefined, 'World: アーキタイプが存在しません');
    return arch;
  }

  /**
   * 行を swap-remove し、移動してきたエンティティの表を直す。
   * @param e 取り除くエンティティ
   * @param arch 所属アーキタイプ
   */
  private removeRow(e: Entity, arch: Archetype): void {
    const row = this.entityTable.getRow(e);
    const moved = arch.swapRemove(row);
    if (moved !== NULL_ENTITY) this.entityTable.update(moved, arch.id, row);
  }

  /**
   * コンポーネントの追加/削除でアーキタイプを移す。
   * @param e エンティティ
   * @param c コンポーネント
   * @param isAdd 追加なら true
   */
  private move(e: Entity, c: AnyComponentDef, isAdd: boolean): void {
    assert(!this.iterating, 'World: システム実行中は即時に構造変更できません');
    if (!this.entityTable.isAlive(e)) return;
    const from = this.archetypeOf(e);
    const to = this.graph.transition(from, c, isAdd);
    if (to === from) return;
    const row = this.entityTable.getRow(e);
    const newRow = to.pushRow(e);
    from.copyRowTo(row, to, newRow);
    this.removeRow(e, from);
    this.entityTable.update(e, to.id, newRow);
  }

  /**
   * CMD_SET を適用する (エンティティが生存していなければ無視)。
   * @param e エンティティ
   * @param fieldId フィールド ID
   * @param value 値
   */
  private applySet(e: Entity, fieldId: number, value: number): void {
    if (!this.entityTable.isAlive(e)) return;
    const arch = this.archetypeOf(e);
    const col = arch.getColumnByFieldId(fieldId);
    if (col === undefined) return;
    const row = this.entityTable.getRow(e);
    col.data[row] = value;
    arch.changeTracker.markRange(fieldId, row, row + 1);
  }
}
