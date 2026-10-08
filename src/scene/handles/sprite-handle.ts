/**
 * @file 単一スプライトの操作ハンドル (docs/09-api-design.md §4.4, docs/02-directory-structure.md §22)
 *
 * SoA ECS のエンティティをカプセル化し、fluent setter およびプロパティアクセサを提供する。
 */

import { ErrorCode, PlutoError } from '../../core/debug';
import type { Entity, FieldToken, World } from '../../core/ecs';
import { EventEmitter } from '../../core/events';
import {
  FLAG_ADDITIVE,
  FLAG_FLIP_X,
  FLAG_FLIP_Y,
  FLAG_OPAQUE,
  FLAG_VISIBLE,
  type FrameTable,
  Sprite,
  type SpriteBuffer,
  SpriteSlot,
} from '../../render';
import { Transform } from '../../transform';

/** スプライトブレンドモード */
export type BlendMode = 'alpha' | 'additive' | 'opaque';

/** レイヤーの最大値 (docs/07-renderer.md §2 MAX_LAYERS = 1024 の排他上限)。 */
const MAX_LAYER_VALUE = 1023;

/**
 * 単一スプライト操作ハンドルクラス。
 */
export class SpriteHandle {
  /** 関連付けられた ECS World */
  public readonly world: World;
  /** 対象 ECS エンティティ */
  public readonly entity: Entity;
  /** レンダラフレームテーブル */
  public readonly frameTable: FrameTable;
  /** イベントエミッター */
  public readonly events: EventEmitter<Record<string, unknown>>;

  private readonly spriteBuffer: SpriteBuffer | undefined;
  private _isDestroyed = false;
  private _baseFrameId = 0;
  private _originX = 0.5;
  private _originY = 0.5;
  private _alpha = 1.0;
  private _blend: BlendMode = 'alpha';

  /** @param world 関連 World @param entity 対象エンティティ @param frameTable フレームテーブル @param spriteBuffer 破棄時にスロット解放するバッファ (省略時は解放しない) */
  public constructor(
    world: World,
    entity: Entity,
    frameTable: FrameTable,
    spriteBuffer?: SpriteBuffer,
  ) {
    this.world = world;
    this.entity = entity;
    this.frameTable = frameTable;
    this.spriteBuffer = spriteBuffer;
    this.events = new EventEmitter<Record<string, unknown>>();

    this._baseFrameId = world.get(entity, Sprite.frame);
    const existingFlags = world.get(entity, Sprite.flags);
    if ((existingFlags & FLAG_ADDITIVE) !== 0) {
      this._blend = 'additive';
    } else if ((existingFlags & FLAG_OPAQUE) !== 0) {
      this._blend = 'opaque';
    } else {
      this._blend = 'alpha';
    }
  }

  /** 破棄済みか判定する */
  public get isDestroyed(): boolean {
    return this._isDestroyed;
  }
  /** ワールド X 座標 */
  public get x(): number {
    return this.getField(Transform.x);
  }
  public set x(value: number) {
    this.setField(Transform.x, value);
  }
  /** ワールド Y 座標 */
  public get y(): number {
    return this.getField(Transform.y);
  }
  public set y(value: number) {
    this.setField(Transform.y, value);
  }
  /** X スケール */
  public get scaleX(): number {
    return this.getField(Transform.scaleX);
  }
  public set scaleX(value: number) {
    this.setField(Transform.scaleX, value);
  }
  /** Y スケール */
  public get scaleY(): number {
    return this.getField(Transform.scaleY);
  }
  public set scaleY(value: number) {
    this.setField(Transform.scaleY, value);
  }
  /** 回転角 (ラジアン) */
  public get rotation(): number {
    return this.getField(Transform.rotation);
  }
  public set rotation(value: number) {
    this.setField(Transform.rotation, value);
  }
  /** 回転角 (度) */
  public get angle(): number {
    return (this.rotation * 180) / Math.PI;
  }
  public set angle(value: number) {
    this.rotation = (value * Math.PI) / 180;
  }
  /** 深度・ソートキー (0.0〜1.0 未満) */
  public get depth(): number {
    return this.getField(Sprite.sortKey);
  }
  public set depth(value: number) {
    this.setDepth(value);
  }
  /** 描画レイヤー (0〜1023) */
  public get layer(): number {
    return this.getField(Sprite.layer);
  }
  public set layer(value: number) {
    this.setLayer(value);
  }
  /** 可視フラグ */
  public get visible(): boolean {
    return this.getFlagBits(FLAG_VISIBLE);
  }
  public set visible(value: boolean) {
    this.ensureAlive();
    this.setFlagBits(FLAG_VISIBLE, value);
  }
  /** 左右反転フラグ */
  public get flipX(): boolean {
    return this.getFlagBits(FLAG_FLIP_X);
  }
  public set flipX(value: boolean) {
    this.ensureAlive();
    this.setFlagBits(FLAG_FLIP_X, value);
  }
  /** 上下反転フラグ */
  public get flipY(): boolean {
    return this.getFlagBits(FLAG_FLIP_Y);
  }
  public set flipY(value: boolean) {
    this.ensureAlive();
    this.setFlagBits(FLAG_FLIP_Y, value);
  }
  /** アルファ値 (0.0〜1.0) */
  public get alpha(): number {
    return this._alpha;
  }
  public set alpha(value: number) {
    this.setAlpha(value);
  }
  /** カラーティント (0xRRGGBB) */
  public get tint(): number {
    this.ensureAlive();
    const packed = this.world.get(this.entity, Sprite.tint);
    const r = (packed >>> 24) & 0xff;
    const g = (packed >>> 16) & 0xff;
    const b = (packed >>> 8) & 0xff;
    return (r << 16) | (g << 8) | b;
  }
  public set tint(rgb: number) {
    this.setTint(rgb);
  }
  /** ブレンドモード */
  public get blend(): BlendMode {
    return this._blend;
  }
  public set blend(mode: BlendMode) {
    this.setBlend(mode);
  }
  /** フレーム ID */
  public get frame(): number {
    return this._baseFrameId;
  }
  public set frame(frameId: number) {
    this.setFrame(frameId);
  }
  /** X アンカー (originX) */
  public get originX(): number {
    return this._originX;
  }
  /** Y アンカー (originY) */
  public get originY(): number {
    return this._originY;
  }
  /** 位置を設定する (@param x ワールド X 座標 @param y ワールド Y 座標 @returns this)。 */
  public setPosition(x: number, y: number): this {
    this.ensureAlive();
    this.world.set(this.entity, Transform.x, x);
    this.world.set(this.entity, Transform.y, y);
    return this;
  }
  /** スケールを設定する (@param scaleX X スケール @param scaleY Y スケール。省略時は scaleX と同じ @returns this)。 */
  public setScale(scaleX: number, scaleY = scaleX): this {
    this.ensureAlive();
    this.world.set(this.entity, Transform.scaleX, scaleX);
    this.world.set(this.entity, Transform.scaleY, scaleY);
    return this;
  }
  /** 回転角 (ラジアン) を設定する (@param rotation ラジアン @returns this)。 */
  public setRotation(rotation: number): this {
    this.ensureAlive();
    this.world.set(this.entity, Transform.rotation, rotation);
    return this;
  }
  /** 回転角 (度) を設定する (@param angle 度数法角度 @returns this)。 */
  public setAngle(angle: number): this {
    return this.setRotation((angle * Math.PI) / 180);
  }
  /** 深度・ソートキー (0.0〜1.0 未満) を設定する (@param depth 深度 @returns this)。 */
  public setDepth(depth: number): this {
    this.ensureAlive();
    if (!(depth >= 0) || !(depth < 1)) {
      throw new PlutoError(ErrorCode.InvalidArgument, 'depth は 0 以上 1 未満にしてください。');
    }
    this.world.set(this.entity, Sprite.sortKey, depth);
    return this;
  }
  /** 描画レイヤーを設定する (@param layer レイヤー番号 0〜1023 @returns this)。 */
  public setLayer(layer: number): this {
    this.ensureAlive();
    if (!Number.isInteger(layer) || layer < 0 || layer > MAX_LAYER_VALUE) {
      throw new PlutoError(ErrorCode.InvalidArgument, 'layer は 0〜1023 の整数にしてください。');
    }
    this.world.set(this.entity, Sprite.layer, layer);
    return this;
  }
  /** 可視状態を設定する (@param visible 可視フラグ @returns this)。 */
  public setVisible(visible: boolean): this {
    this.visible = visible;
    return this;
  }
  /** 左右・上下反転を設定する (@param flipX 左右反転フラグ @param flipY 上下反転フラグ @returns this)。 */
  public setFlip(flipX: boolean, flipY: boolean): this {
    this.flipX = flipX;
    this.flipY = flipY;
    return this;
  }
  /** アルファ値を設定する (@param alpha 0.0〜1.0 @returns this)。 */
  public setAlpha(alpha: number): this {
    this.ensureAlive();
    this._alpha = Math.max(0, Math.min(1, alpha));
    this.updatePackedTint();
    return this;
  }
  /** カラーティントを設定する (@param rgb 0xRRGGBB 数値 @param alpha アルファ。省略時は現在の alpha @returns this)。 */
  public setTint(rgb: number, alpha = this._alpha): this {
    this.ensureAlive();
    this._alpha = Math.max(0, Math.min(1, alpha));
    const r = (rgb >>> 16) & 0xff;
    const g = (rgb >>> 8) & 0xff;
    const b = rgb & 0xff;
    const a = Math.round(this._alpha * 255) & 0xff;
    const packed = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
    this.world.set(this.entity, Sprite.tint, packed);
    return this;
  }
  /** ブレンドモードを設定する (@param mode 'alpha' | 'additive' | 'opaque' @returns this)。 */
  public setBlend(mode: BlendMode): this {
    this.ensureAlive();
    this._blend = mode;
    let flags = this.world.get(this.entity, Sprite.flags);
    flags &= ~(FLAG_ADDITIVE | FLAG_OPAQUE);
    if (mode === 'additive') {
      flags |= FLAG_ADDITIVE;
    } else if (mode === 'opaque') {
      flags |= FLAG_OPAQUE;
    }
    this.world.set(this.entity, Sprite.flags, flags);
    return this;
  }
  /** 表示フレームを変更する (@param frameId フレーム ID @returns this)。 */
  public setFrame(frameId: number): this {
    this.ensureAlive();
    this._baseFrameId = frameId;
    const effectiveFrameId = this.frameTable.getDerivedFrame(
      this._baseFrameId,
      this._originX,
      this._originY,
    );
    this.world.set(this.entity, Sprite.frame, effectiveFrameId);
    return this;
  }
  /** 表示原点 (アンカー) を設定する (@param originX X アンカー 0.0〜1.0 @param originY Y アンカー。省略時は originX と同じ @returns this)。 */
  public setOrigin(originX: number, originY = originX): this {
    this.ensureAlive();
    if (!(originX >= 0) || !(originX <= 1) || !(originY >= 0) || !(originY <= 1)) {
      throw new PlutoError(ErrorCode.InvalidArgument, 'origin は 0.0〜1.0 の範囲にしてください。');
    }
    this._originX = originX;
    this._originY = originY;
    const effectiveFrameId = this.frameTable.getDerivedFrame(
      this._baseFrameId,
      this._originX,
      this._originY,
    );
    this.world.set(this.entity, Sprite.frame, effectiveFrameId);
    return this;
  }
  /** イベントリスナーを登録する (@param event イベント名 @param listener コールバック関数 @returns this)。 */
  public on(event: string, listener: (...args: unknown[]) => void): this {
    this.ensureAlive();
    this.events.on(event, listener);
    return this;
  }
  /** イベントリスナーを解除する (@param event イベント名 @param listener コールバック関数 @returns this)。 */
  public off(event: string, listener: (...args: unknown[]) => void): this {
    this.ensureAlive();
    this.events.off(event, listener);
    return this;
  }
  /** 1 回限りのイベントリスナーを登録する (@param event イベント名 @param listener コールバック関数 @returns this)。 */
  public once(event: string, listener: (...args: unknown[]) => void): this {
    this.ensureAlive();
    this.events.once(event, listener);
    return this;
  }
  /** スプライトおよび関連エンティティを破棄する。スロットも解放する。 */
  public destroy(): void {
    if (this._isDestroyed) {
      return;
    }
    this._isDestroyed = true;
    if (this.world.isAlive(this.entity)) {
      const slot = this.world.get(this.entity, SpriteSlot.slot);
      this.world.despawn(this.entity);
      if (this.spriteBuffer !== undefined) {
        this.spriteBuffer.freeSlot(slot);
      }
    }
  }
  private getField(field: FieldToken): number {
    this.ensureAlive();
    return this.world.get(this.entity, field);
  }
  private setField(field: FieldToken, value: number): void {
    this.ensureAlive();
    this.world.set(this.entity, field, value);
  }
  private getFlagBits(mask: number): boolean {
    this.ensureAlive();
    return (this.world.get(this.entity, Sprite.flags) & mask) !== 0;
  }
  private setFlagBits(mask: number, value: boolean): void {
    let flags = this.world.get(this.entity, Sprite.flags);
    if (value) {
      flags |= mask;
    } else {
      flags &= ~mask;
    }
    this.world.set(this.entity, Sprite.flags, flags);
  }
  private ensureAlive(): void {
    if (this._isDestroyed || !this.world.isAlive(this.entity)) {
      throw new PlutoError(ErrorCode.InvalidState, '破棄済みの SpriteHandle にアクセスしました。');
    }
  }
  private updatePackedTint(): void {
    const existing = this.world.get(this.entity, Sprite.tint);
    const r = (existing >>> 24) & 0xff;
    const g = (existing >>> 16) & 0xff;
    const b = (existing >>> 8) & 0xff;
    const a = Math.round(this._alpha * 255) & 0xff;
    const packed = ((r << 24) | (g << 16) | (b << 8) | a) >>> 0;
    this.world.set(this.entity, Sprite.tint, packed);
  }
}
