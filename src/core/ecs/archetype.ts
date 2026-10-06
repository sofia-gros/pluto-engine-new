// @pluto-hot
/**
 * @file アーキタイプ: 同じコンポーネント構成の行集合 (docs/04-memory-and-ecs.md §4.2)。
 * 行は常に密 (0 〜 count-1)。削除は swap-remove。
 * Worker 用の読み取り専用ミラーは `Archetype.fromShared()` で作る (同じクラスなので ChunkView がそのまま使える)。
 * バッファは固定長で、伸長時は新しいバッファへコピーして `bufferVersion` を進める (E-002)。
 */
import { assert } from '../debug';
import { Bitset, createBackingBuffer } from '../memory';
import type { BackingBuffer, ScalarType, TypedArrayOf } from '../memory';
import { ChangeTracker } from './change-tracking';
import { Column, INITIAL_ARCHETYPE_ROWS } from './column';
import { MAX_COMPONENTS } from './component';
import type { AnyComponentDef } from './component';
import { NULL_ENTITY } from './entity';
import type { Entity } from './entity';
import type { FieldToken } from './schema';

/** Worker に送るアーキタイプの共有記述 (docs/04-memory-and-ecs.md §4.2)。 */
export interface SharedArchetypeDesc {
  /** アーキタイプ ID。 */
  readonly id: number;
  /** 最大行数。 */
  readonly maxRows: number;
  /** 所有コンポーネントの ID。 */
  readonly componentIds: readonly number[];
  /** フィールドごとのカラムのバッファ。 */
  readonly fields: readonly {
    readonly fieldId: number;
    readonly type: ScalarType;
    readonly buffer: BackingBuffer;
  }[];
  /** 行 → エンティティのバッファ。 */
  readonly entitiesBuffer: BackingBuffer;
  /** フィールドごとの dirty ビットのバッファ (fields と同じ順)。 */
  readonly dirtyBuffers: readonly BackingBuffer[];
}

/** バッファを作り直したときに呼ばれる関数。 */
export type ArchetypeGrowCallback = (archetype: Archetype) => void;

/**
 * 同一コンポーネント構成のエンティティの SoA データ。
 */
export class Archetype {
  /** アーキタイプ ID (0 は空アーキタイプ)。 */
  public readonly id: number;
  /** 所有コンポーネントのビットマスク (256 ビット)。 */
  public readonly mask: Bitset;
  /** 使用中の行数。 */
  public count: number;
  /** 行 → エンティティ (伸長すると差し替わる)。 */
  public entities: Uint32Array;
  /** フィールド ID → カラム (外部からの列挙用)。 */
  public readonly columns: ReadonlyMap<number, Column>;
  /** 変更追跡。 */
  public readonly changeTracker: ChangeTracker;
  /** 読み取り専用ミラーか (Worker 側)。構造変更を禁止する。 */
  public readonly isMirror: boolean;
  private readonly maxRows: number;
  private entitiesBuffer: BackingBuffer;
  private version = 0;
  private readonly onGrow: ArchetypeGrowCallback | undefined;
  private readonly componentIdList: number[] = [];
  /** HOT ループ用: カラムと fieldId の並び。 */
  private readonly columnList: Column[] = [];
  private readonly fieldIdList: number[] = [];
  /** fieldId → カラム (疎な配列。O(1) で引く)。 */
  private readonly columnByField: (Column | undefined)[] = [];

  /**
   * @param id アーキタイプ ID
   * @param components 所有コンポーネント
   * @param maxRows 最大行数
   * @param shared Worker のミラーを作る場合の共有記述 (`fromShared` から渡す)
   * @param onGrow バッファを作り直したときの通知 (World が structureVersion を進めるため)
   */
  public constructor(
    id: number,
    components: readonly AnyComponentDef[],
    maxRows: number,
    shared?: SharedArchetypeDesc,
    onGrow?: ArchetypeGrowCallback,
  ) {
    this.id = id;
    this.onGrow = onGrow;
    this.maxRows = maxRows;
    this.count = 0;
    this.isMirror = shared !== undefined;
    this.mask = new Bitset(MAX_COMPONENTS);
    const columns = new Map<number, Column>();
    // ミラーは desc だけから作る (Worker のレジストリに依存しない)
    const componentIds = shared?.componentIds ?? components.map((c) => c.id);
    const fields =
      shared?.fields ??
      components.flatMap((c) =>
        c.fields.map((f) => ({ fieldId: f.fieldId, type: f.type, buffer: undefined })),
      );
    for (const id of componentIds) {
      this.mask.set(id);
      this.componentIdList.push(id);
    }
    for (const field of fields) {
      const col = new Column(field.type, maxRows, field.buffer);
      columns.set(field.fieldId, col);
      this.columnList.push(col);
      this.fieldIdList.push(field.fieldId);
      this.columnByField[field.fieldId] = col;
    }
    this.columns = columns;
    this.changeTracker = new ChangeTracker(maxRows, this.fieldIdList, shared?.dirtyBuffers);
    const initialRows = Math.min(INITIAL_ARCHETYPE_ROWS, maxRows);
    this.entitiesBuffer = shared?.entitiesBuffer ?? createBackingBuffer((initialRows * 4 + 7) & ~7);
    this.entities = new Uint32Array(this.entitiesBuffer);
  }

  /**
   * 共有記述から読み取り専用ミラーを作る (Worker 側)。
   * @cold Worker の同期メッセージ受信時にだけ呼ぶ
   * @param desc 共有記述
   * @returns ミラー
   */
  public static fromShared(desc: SharedArchetypeDesc): Archetype {
    return new Archetype(desc.id, [], desc.maxRows, desc);
  }

  /** カラムまたは entities のバッファを作り直した回数 (jobs の再送判定に使う)。 */
  public get bufferVersion(): number {
    return this.version;
  }

  /**
   * ミラーのバッファを共有記述のものに差し替える (Worker 側。クエリが持つ参照を保つため同じオブジェクトのまま)。
   * @cold 同期メッセージ受信時のみ
   * @param desc メインの最新の共有記述
   */
  public rebindShared(desc: SharedArchetypeDesc): void {
    assert(this.isMirror, 'Archetype: rebindShared はミラー専用です');
    for (const f of desc.fields) this.columnByField[f.fieldId]?.rebind(f.buffer);
    this.entitiesBuffer = desc.entitiesBuffer;
    this.entities = new Uint32Array(desc.entitiesBuffer);
  }

  /**
   * Worker に送る共有記述を作る (メイン側)。
   * @cold 同期時にだけ呼ぶ
   * @returns 共有記述
   */
  public toShared(): SharedArchetypeDesc {
    return {
      id: this.id,
      maxRows: this.maxRows,
      componentIds: this.componentIdList.slice(),
      fields: this.fieldIdList.map((fieldId, i) => ({
        fieldId,
        type: this.columnList[i].type,
        buffer: this.columnList[i].buffer,
      })),
      entitiesBuffer: this.entitiesBuffer,
      dirtyBuffers: this.changeTracker.sharedDescs.map((d) => d.buffer),
    };
  }

  /**
   * フィールドのカラム (TypedArray) を返す。
   * @hot
   * @param field フィールドトークン
   * @returns カラム
   */
  public getColumn<T extends ScalarType>(field: FieldToken<T>): TypedArrayOf<T> {
    const col = this.columnByField[field.fieldId];
    assert(col !== undefined, 'Archetype: このアーキタイプに無いフィールドです');
    return col.data as TypedArrayOf<T>;
  }

  /**
   * フィールド ID でカラムを返す (無ければ undefined)。
   * @hot
   * @param fieldId フィールド ID
   * @returns カラムまたは undefined
   */
  public getColumnByFieldId(fieldId: number): Column | undefined {
    return this.columnByField[fieldId];
  }

  /**
   * コンポーネントを持つか。
   * @hot
   * @param componentId コンポーネント ID
   * @returns 持っていれば true
   */
  public hasComponent(componentId: number): boolean {
    return this.mask.test(componentId);
  }

  /**
   * 行を追加する。値はゼロ初期化され、全フィールドの新しい行は dirty になる (04 §6)。
   * @hot
   * @param entity 追加するエンティティ
   * @returns 新しい行番号
   */
  public pushRow(entity: Entity): number {
    assert(!this.isMirror, 'Archetype: ミラーは変更できません');
    assert(this.count < this.maxRows, 'Archetype: 最大行数に達しました');
    const row = this.count;
    if (row >= this.entities.length) this.growTo(row + 1);
    this.count = row + 1;
    this.entities[row] = entity;
    const cols = this.columnList;
    const fieldIds = this.fieldIdList;
    const len = cols.length;
    for (let i = 0; i < len; i++) {
      cols[i].data[row] = 0;
      this.changeTracker.markRange(fieldIds[i], row, row + 1);
    }
    return row;
  }

  /**
   * 最終行を row に移して行を削除する。
   * @hot
   * @param row 削除する行
   * @returns row に移動してきたエンティティ (移動が無ければ NULL_ENTITY)
   */
  public swapRemove(row: number): Entity {
    assert(!this.isMirror, 'Archetype: ミラーは変更できません');
    assert(row < this.count, 'Archetype: 範囲外の行を削除しようとしました');
    const last = this.count - 1;
    this.count = last;
    if (row === last) return NULL_ENTITY;
    const moved = this.entities[last];
    this.entities[row] = moved;
    const cols = this.columnList;
    const len = cols.length;
    for (let i = 0; i < len; i++) {
      const data = cols[i].data;
      data[row] = data[last];
    }
    return moved as Entity;
  }

  /**
   * 行のデータを別アーキタイプの行へコピーする (共通フィールドのみ)。
   * @hot
   * @param row コピー元の行
   * @param dst コピー先のアーキタイプ
   * @param dstRow コピー先の行
   */
  public copyRowTo(row: number, dst: Archetype, dstRow: number): void {
    const cols = this.columnList;
    const fieldIds = this.fieldIdList;
    const len = cols.length;
    for (let i = 0; i < len; i++) {
      const dstCol = dst.columnByField[fieldIds[i]];
      if (dstCol !== undefined) dstCol.data[dstRow] = cols[i].data[row];
    }
  }

  /**
   * 少なくとも rows 行入るように、entities と全カラムを新しいバッファへコピーして伸長する (2 倍ずつ)。
   * @cold 伸長は対数回しか起きない
   * @param rows 必要な行数
   */
  private growTo(rows: number): void {
    let next = Math.max(this.entities.length * 2, 1);
    while (next < rows) next *= 2;
    if (next > this.maxRows) next = this.maxRows;
    const buffer = createBackingBuffer((next * 4 + 7) & ~7);
    const entities = new Uint32Array(buffer);
    entities.set(this.entities);
    this.entitiesBuffer = buffer;
    this.entities = entities;
    const cols = this.columnList;
    const len = cols.length;
    for (let i = 0; i < len; i++) cols[i].grow(next);
    this.version++;
    this.onGrow?.(this);
  }
}
