// @pluto-hot
/**
 * @file コマンドバッファ (遅延評価されるECSの構造変更とデータ更新)。
 */

import { PlutoError, ErrorCode } from '../debug/pluto-error';
import { ScalarType } from '../memory/scalar-type';
import type { Entity } from './entity';
import type { FieldToken } from './schema';
import type { AnyComponentDef } from './component';
import type { EntityTable } from './entity-table';

export const CMD_SPAWN = 1;
export const CMD_DESPAWN = 2;
export const CMD_ADD_COMPONENT = 3;
export const CMD_REMOVE_COMPONENT = 4;
export const CMD_SET = 5;

/**
 * 構造変更やデータ更新のコマンドをバッチとして蓄積し、あとでフラッシュするためのバッファ。
 * 内部でUint32Arrayを利用し、ホットパスでのオブジェクトアロケーションを回避する。
 */
export class CommandBuffer {
  private readonly buffer: Uint32Array;
  private readonly floatView: Float32Array;
  private readonly int32View: Int32Array;

  private head = 0;
  private readonly capacity: number;
  private readonly entityTable: EntityTable;

  /**
   * @param capacity コマンドストリームの最大要素数 (UInt32換算)
   * @param entityTable エンティティのアロケーション用
   */
  public constructor(capacity: number, entityTable: EntityTable) {
    this.capacity = capacity;
    this.entityTable = entityTable;

    const buffer = new ArrayBuffer(capacity * 4);
    this.buffer = new Uint32Array(buffer);
    this.floatView = new Float32Array(buffer);
    this.int32View = new Int32Array(buffer);
  }

  private ensureCapacity(words: number): void {
    if (this.head + words > this.capacity) {
      throw new PlutoError(ErrorCode.CapacityExceeded, 'CommandBufferの容量を超過しました');
    }
  }

  /**
   * 新しいエンティティを生成し、コマンドバッファにスポーン操作を積む。
   * (実際のアーキタイプへの追加はflush時だが、エンティティIDは事前割り当てされる)
   * @hot
   * @param components 追加するコンポーネント群
   * @returns 事前割り当てされたエンティティ
   */
  public spawn(...components: AnyComponentDef[]): Entity {
    const e = this.entityTable.allocate();
    const len = components.length;

    this.ensureCapacity(3 + len);

    this.buffer[this.head++] = CMD_SPAWN;
    this.buffer[this.head++] = e;
    this.buffer[this.head++] = len;

    // pluto-allow: for ループ内の配列アクセス。引数として渡された配列の反復処理であり、新たなアロケーションは伴わない。

    for (let i = 0; i < len; i++) {
      this.buffer[this.head++] = components[i].id;
    }

    return e;
  }

  /**
   * エンティティを破棄するコマンドを積む。
   * @hot
   * @param e 対象エンティティ
   */
  public despawn(e: Entity): void {
    this.ensureCapacity(2);
    this.buffer[this.head++] = CMD_DESPAWN;
    this.buffer[this.head++] = e;
  }

  /**
   * コンポーネントを追加するコマンドを積む。
   * @hot
   * @param e 対象エンティティ
   * @param c 追加するコンポーネント
   */
  public addComponent(e: Entity, c: AnyComponentDef): void {
    this.ensureCapacity(3);
    this.buffer[this.head++] = CMD_ADD_COMPONENT;
    this.buffer[this.head++] = e;
    this.buffer[this.head++] = c.id;
  }

  /**
   * コンポーネントを削除するコマンドを積む。
   * @hot
   * @param e 対象エンティティ
   * @param c 削除するコンポーネント
   */
  public removeComponent(e: Entity, c: AnyComponentDef): void {
    this.ensureCapacity(3);
    this.buffer[this.head++] = CMD_REMOVE_COMPONENT;
    this.buffer[this.head++] = e;
    this.buffer[this.head++] = c.id;
  }

  /**
   * コンポーネントのフィールド値を更新するコマンドを積む。
   * @hot
   * @param e 対象エンティティ
   * @param field 更新するフィールド
   * @param value 新しい値
   */
  public set<T extends ScalarType>(e: Entity, field: FieldToken<T>, value: number): void {
    this.ensureCapacity(5);
    this.buffer[this.head++] = CMD_SET;
    this.buffer[this.head++] = e;
    this.buffer[this.head++] = field.fieldId;
    this.buffer[this.head++] = field.type;

    if (field.type === ScalarType.F32) {
      this.floatView[this.head++] = value;
    } else {
      this.int32View[this.head++] = value;
    }
  }

  /**
   * バッファをクリアする(flush完了後に呼ばれる)。
   */
  public clear(): void {
    this.head = 0;
  }

  /**
   * 現在バッファに書き込まれているデータを Uint32Array (ビュー) として返す。
   * @returns 蓄積されたコマンドデータ
   */
  public get data(): Uint32Array {
    return this.buffer.subarray(0, this.head);
  }

  public get floatData(): Float32Array {
    return this.floatView;
  }

  public get int32Data(): Int32Array {
    return this.int32View;
  }
}
