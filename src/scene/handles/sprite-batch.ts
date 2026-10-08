/**
 * @file 大量スプライトの一括操作ハンドル (docs/09-api-design.md §4.5, docs/02-directory-structure.md §22)
 *
 * 個別オブジェクトを作らず、SoA ECS の連続スロットまたはバッファを直接一括操作する。
 */

import { ErrorCode, PlutoError } from '../../core/debug';
import type { Entity, World } from '../../core/ecs';
import {
  FLAG_ADDITIVE,
  FLAG_OPAQUE,
  FLAG_VISIBLE,
  type FrameTable,
  Sprite,
  type SpriteBuffer,
  SpriteSlot,
} from '../../render';
import { Transform, WorldTransform } from '../../transform';
import type { BlendMode } from './sprite-handle';

/**
 * SpriteBatch 生成設定。
 */
export interface SpriteBatchConfig {
  /** 生成するスプライト数 */
  readonly count: number;
  /** 使用テクスチャキーまたはフレーム ID */
  readonly texture?: string;
  /** フレーム ID */
  readonly frame?: number;
  /** 初期 X 座標または生成関数 */
  readonly x?: number | ((index: number) => number);
  /** 初期 Y 座標または生成関数 */
  readonly y?: number | ((index: number) => number);
  /** 描画レイヤー */
  readonly layer?: number;
  /** ブレンドモード */
  readonly blend?: BlendMode;
}

/** 直接アクセス可能なカラム名 */
export type SpriteBatchColumnName = 'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY' | 'tint';

/**
 * 大量スプライトの一括操作ハンドルクラス。
 */
export class SpriteBatch {
  /** 関連付けられた ECS World */
  public readonly world: World;
  /** レンダラフレームテーブル */
  public readonly frameTable: FrameTable;
  /** スプライトバッファ */
  public readonly spriteBuffer: SpriteBuffer;

  private readonly entities: Entity[] = [];
  private readonly _count: number;
  private _isDestroyed = false;

  public constructor(
    world: World,
    frameTable: FrameTable,
    spriteBuffer: SpriteBuffer,
    config: SpriteBatchConfig,
  ) {
    this.world = world;
    this.frameTable = frameTable;
    this.spriteBuffer = spriteBuffer;
    this._count = config.count;

    if (config.count <= 0) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        'SpriteBatch の count は 1 以上である必要があります。',
      );
    }

    const frameId = config.frame ?? 0;
    const layer = config.layer ?? 0;
    let flags = FLAG_VISIBLE;
    if (config.blend === 'additive') {
      flags |= FLAG_ADDITIVE;
    } else if (config.blend === 'opaque') {
      flags |= FLAG_OPAQUE;
    }

    for (let i = 0; i < config.count; i++) {
      const e = world.spawn(Transform, WorldTransform, Sprite, SpriteSlot);
      this.entities.push(e);

      const xVal = typeof config.x === 'function' ? config.x(i) : (config.x ?? 0);
      const yVal = typeof config.y === 'function' ? config.y(i) : (config.y ?? 0);

      world.set(e, Transform.x, xVal);
      world.set(e, Transform.y, yVal);
      world.set(e, Transform.scaleX, 1);
      world.set(e, Transform.scaleY, 1);
      world.set(e, Transform.rotation, 0);

      world.set(e, Sprite.frame, frameId);
      world.set(e, Sprite.tint, 0xffffffff);
      world.set(e, Sprite.layer, layer);
      world.set(e, Sprite.flags, flags);
      world.set(e, Sprite.sortKey, 0);

      const slot = spriteBuffer.allocateSlot();
      world.set(e, SpriteSlot.slot, slot);
    }
  }

  /** スプライト数 */
  public get count(): number {
    this.ensureAlive();
    return this._count;
  }

  /** 破棄済みか判定する */
  public get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  /**
   * 内部カラムの TypedArray 配列を直接取得する。
   *
   * 返却配列は内部バッファの伸長で古くなることがあるため保持せず、
   * 使うたびに取り直すこと。書き換えた後は `markDirty()` を呼ぶこと。
   *
   * @param name カラム名
   * @returns 対応する TypedArray
   */
  public column(name: SpriteBatchColumnName): Float32Array | Uint32Array {
    this.ensureAlive();
    const firstEntity = this.entities.at(0);
    if (firstEntity === undefined) {
      return new Float32Array(0);
    }
    const arch = this.world.graph
      .getArchetypes()
      .find(
        (a) =>
          a.hasComponent(Transform.id) &&
          a.hasComponent(WorldTransform.id) &&
          a.hasComponent(Sprite.id) &&
          a.hasComponent(SpriteSlot.id),
      );
    if (!arch) {
      return new Float32Array(0);
    }

    switch (name) {
      case 'x':
        return arch.getColumn(Transform.x);
      case 'y':
        return arch.getColumn(Transform.y);
      case 'rotation':
        return arch.getColumn(Transform.rotation);
      case 'scaleX':
        return arch.getColumn(Transform.scaleX);
      case 'scaleY':
        return arch.getColumn(Transform.scaleY);
      case 'tint':
        return arch.getColumn(Sprite.tint);
    }
  }

  /**
   * 位置配列を一括設定する。
   *
   * @param xs X 座標配列
   * @param ys Y 座標配列
   */
  public setPositions(xs: Float32Array, ys: Float32Array): void {
    this.ensureAlive();
    const len = Math.min(this._count, xs.length, ys.length);
    for (let i = 0; i < len; i++) {
      const e = this.entities.at(i);
      const x = xs.at(i);
      const y = ys.at(i);
      if (e !== undefined && x !== undefined && y !== undefined) {
        this.world.set(e, Transform.x, x);
        this.world.set(e, Transform.y, y);
      }
    }
  }

  /**
   * ティント配列を一括設定する。
   *
   * @param tints RGBA32 ティント配列
   */
  public setTints(tints: Uint32Array): void {
    this.ensureAlive();
    const len = Math.min(this._count, tints.length);
    for (let i = 0; i < len; i++) {
      const e = this.entities.at(i);
      const t = tints.at(i);
      if (e !== undefined && t !== undefined) {
        this.world.set(e, Sprite.tint, t);
      }
    }
  }

  /**
   * 全スプライトの dirty マークを立てる。
   */
  public markDirty(): void {
    this.ensureAlive();
    for (const e of this.entities) {
      const slot = this.world.get(e, SpriteSlot.slot);
      this.spriteBuffer.markDirty(slot);
    }
  }

  /**
   * SpriteBatch を破棄する。
   */
  public destroy(): void {
    if (this._isDestroyed) {
      return;
    }
    this._isDestroyed = true;
    for (const e of this.entities) {
      if (this.world.isAlive(e)) {
        const slot = this.world.get(e, SpriteSlot.slot);
        this.spriteBuffer.freeSlot(slot);
        this.world.despawn(e);
      }
    }
    this.entities.length = 0;
  }

  private ensureAlive(): void {
    if (this._isDestroyed) {
      throw new PlutoError(ErrorCode.InvalidState, '破棄済みの SpriteBatch にアクセスしました。');
    }
  }
}
