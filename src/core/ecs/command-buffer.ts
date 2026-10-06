// @pluto-hot
/**
 * @file 構造変更 (spawn / despawn / add / remove) と値設定の遅延キュー (docs/04-memory-and-ecs.md §7.1)。
 * u32 の語列に積み、同期点 (`World.flush()`) で適用する。容量の単位は u32 語数。
 */
import { ErrorCode, PlutoError } from '../debug';
import { ScalarType } from '../memory';
import type { AnyComponentDef } from './component';
import type { Entity } from './entity';
import type { EntityTable } from './entity-table';
import type { FieldToken } from './schema';

/** コマンド: spawn (語数 = 3 + コンポーネント数: op, entity, n, id...)。 */
export const CMD_SPAWN = 1;
/** コマンド: despawn (2 語: op, entity)。 */
export const CMD_DESPAWN = 2;
/** コマンド: コンポーネント追加 (3 語: op, entity, componentId)。 */
export const CMD_ADD_COMPONENT = 3;
/** コマンド: コンポーネント削除 (3 語: op, entity, componentId)。 */
export const CMD_REMOVE_COMPONENT = 4;
/** コマンド: 値の設定 (5 語: op, entity, fieldId, type, value)。 */
export const CMD_SET = 5;

/**
 * 構造変更コマンドを u32 語列に蓄積するバッファ。ホットパスでオブジェクトを確保しない。
 */
export class CommandBuffer {
  /** 容量 (u32 語数)。 */
  public readonly capacity: number;
  private readonly words: Uint32Array;
  private readonly floatView: Float32Array;
  private readonly int32View: Int32Array;
  private readonly entityTable: EntityTable;
  private head = 0;

  /**
   * @param capacity 容量 (u32 語数)
   * @param entityTable spawn 時の index 予約に使う表
   */
  public constructor(capacity: number, entityTable: EntityTable) {
    if (!Number.isInteger(capacity) || capacity < 5) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        'CommandBuffer: capacity は 5 以上の整数にしてください。',
      );
    }
    this.capacity = capacity;
    this.entityTable = entityTable;
    const buffer = new ArrayBuffer(capacity * 4);
    this.words = new Uint32Array(buffer);
    this.floatView = new Float32Array(buffer);
    this.int32View = new Int32Array(buffer);
  }

  /** 積まれた語数。 */
  public get length(): number {
    return this.head;
  }

  /** 積まれたコマンド (u32 ビュー。flush でだけ使う)。 */
  public get data(): Uint32Array {
    return this.words.subarray(0, this.head);
  }

  /** CMD_SET の f32 値を読むためのビュー。 */
  public get floatData(): Float32Array {
    return this.floatView;
  }

  /** CMD_SET の整数値を読むためのビュー。 */
  public get int32Data(): Int32Array {
    return this.int32View;
  }

  /**
   * 容量を確認する。足りなければ例外。
   * @hot
   * @param words 必要な語数
   */
  private ensure(words: number): void {
    if (this.head + words > this.capacity) {
      throw new PlutoError(
        ErrorCode.CapacityExceeded,
        'CommandBuffer の容量を超えました。WorldConfig.commandCapacity を増やしてください。',
      );
    }
  }

  /**
   * spawn の共通処理。容量を確認してから index を予約する (失敗時に index を消費しない)。
   * @hot
   * @param count コンポーネント数
   * @returns 予約したエンティティ
   */
  private beginSpawn(count: number): Entity {
    this.ensure(3 + count);
    if (!this.entityTable.canAllocate()) {
      throw new PlutoError(
        ErrorCode.CapacityExceeded,
        'エンティティ数が上限に達しました。WorldConfig.maxEntities を増やしてください。',
      );
    }
    const e = this.entityTable.allocate();
    this.words[this.head++] = CMD_SPAWN;
    this.words[this.head++] = e;
    this.words[this.head++] = count;
    return e;
  }

  /**
   * コンポーネント 1 つで spawn を予約する。
   * @hot
   * @param c コンポーネント
   * @returns 予約したエンティティ (flush まで isAlive は false)
   */
  public spawn1(c: AnyComponentDef): Entity {
    const e = this.beginSpawn(1);
    this.words[this.head++] = c.id;
    return e;
  }

  /**
   * 複数コンポーネントで spawn を予約する (配列は事前に用意して使い回す)。
   * @hot
   * @param components コンポーネント
   * @returns 予約したエンティティ
   */
  public spawnN(components: readonly AnyComponentDef[]): Entity {
    const len = components.length;
    const e = this.beginSpawn(len);
    for (let i = 0; i < len; i++) this.words[this.head++] = components[i].id;
    return e;
  }

  /**
   * spawn を予約する (可変長引数で配列を確保するのでコールドパス用。HOT 経路では spawn1 / spawnN)。
   * @cold
   * @param components コンポーネント
   * @returns 予約したエンティティ
   */
  public spawn(...components: AnyComponentDef[]): Entity {
    return this.spawnN(components);
  }

  /**
   * despawn を積む。
   * @hot
   * @param e エンティティ
   */
  public despawn(e: Entity): void {
    this.ensure(2);
    this.words[this.head++] = CMD_DESPAWN;
    this.words[this.head++] = e;
  }

  /**
   * コンポーネント追加を積む。
   * @hot
   * @param e エンティティ
   * @param c 追加するコンポーネント
   */
  public addComponent(e: Entity, c: AnyComponentDef): void {
    this.ensure(3);
    this.words[this.head++] = CMD_ADD_COMPONENT;
    this.words[this.head++] = e;
    this.words[this.head++] = c.id;
  }

  /**
   * コンポーネント削除を積む。
   * @hot
   * @param e エンティティ
   * @param c 削除するコンポーネント
   */
  public removeComponent(e: Entity, c: AnyComponentDef): void {
    this.ensure(3);
    this.words[this.head++] = CMD_REMOVE_COMPONENT;
    this.words[this.head++] = e;
    this.words[this.head++] = c.id;
  }

  /**
   * 値の設定を積む (spawn を予約したエンティティの初期値にも使える)。
   * @hot
   * @param e エンティティ
   * @param field フィールド
   * @param value 値
   */
  public set<T extends ScalarType>(e: Entity, field: FieldToken<T>, value: number): void {
    this.ensure(5);
    this.words[this.head++] = CMD_SET;
    this.words[this.head++] = e;
    this.words[this.head++] = field.fieldId;
    this.words[this.head++] = field.type;
    if (field.type === ScalarType.F32) this.floatView[this.head++] = value;
    else this.int32View[this.head++] = value;
  }

  /**
   * 積んだコマンドを捨てる (flush の後に呼ぶ)。
   * @hot
   */
  public clear(): void {
    this.head = 0;
  }
}
