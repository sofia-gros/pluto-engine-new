/**
 * @file ゲームオブジェクト生成ファクトリ (`scene.add.*`) (docs/09-api-design.md §4.3, docs/02-directory-structure.md §22)
 *
 * スプライト、イメージ、一括スプライト等の高レベルハンドルを生成する。
 */

import type { AssetCache, AtlasAsset, ImageAsset } from '../assets';
import { AssetType } from '../assets';
import { ErrorCode, PlutoError } from '../core/debug';
import type { World } from '../core/ecs';
import {
  ATLAS_PAGE_SIZE,
  FLAG_VISIBLE,
  type FrameInfo,
  type FrameTable,
  Sprite,
  type SpriteBuffer,
  SpriteSlot,
  WHITE_FRAME_ID,
} from '../render';
import { Transform, WorldTransform } from '../transform';
import { SpriteBatch, type SpriteBatchConfig } from './handles/sprite-batch';
import { SpriteHandle } from './handles/sprite-handle';

/**
 * preload texture 登録に必要なテクスチャ配列操作の最小形。
 * TextureArrayManager が構造的に満たす (テストではスタブで代用できる)。
 */
export interface TextureUploader {
  /**
   * 新しい RGBA8 ページを割り当てる。
   *
   * @returns 割り当てられた層インデックス
   */
  allocateRgbaPage(): number;
  /**
   * RGBA8 画像データを指定位置にアップロードする。
   *
   * @param page 層番号
   * @param offsetX X 座標 (px)
   * @param offsetY Y 座標 (px)
   * @param width 幅 (px)
   * @param height 高さ (px)
   * @param data 画像データ
   */
  uploadRgba(
    page: number,
    offsetX: number,
    offsetY: number,
    width: number,
    height: number,
    data: ArrayBufferView | ImageBitmap,
  ): void;
}

/**
 * ゲームオブジェクト生成ファクトリクラス。
 */
export class GameObjectFactory {
  /** 関連付けられた ECS World */
  public readonly world: World;
  /** レンダラフレームテーブル */
  public readonly frameTable: FrameTable;
  /** スプライトバッファ */
  public readonly spriteBuffer: SpriteBuffer;
  /** アセットキャッシュ */
  public readonly assetCache: AssetCache;

  /** テクスチャキー → 既定フレーム ID の登録表 (preload 完了時に scene が登録する) */
  private readonly textureFrames = new Map<string, number>();
  /** テクスチャキー + フレーム名 → フレーム ID の登録表 */
  private readonly namedFrames = new Map<string, number>();

  public constructor(
    world: World,
    frameTable: FrameTable,
    spriteBuffer: SpriteBuffer,
    assetCache: AssetCache,
  ) {
    this.world = world;
    this.frameTable = frameTable;
    this.spriteBuffer = spriteBuffer;
    this.assetCache = assetCache;
  }

  /**
   * テクスチャのフレーム対応を登録する (preload 完了時の texture 登録用)。
   *
   * @param textureKey テクスチャキー
   * @param frameId 既定フレーム ID (画像全体など)
   * @param frameName フレーム名 (アトラス内名。省略時は既定のみ登録)
   */
  public registerTextureFrame(textureKey: string, frameId: number, frameName?: string): void {
    if (frameName === undefined) {
      this.textureFrames.set(textureKey, frameId);
    } else {
      this.namedFrames.set(`${textureKey}:${frameName}`, frameId);
    }
  }

  /**
   * preload で読み込まれた画像・アトラスをテクスチャ配列へ登録する。
   * 画像を先に、アトラスを後に処理する (アトラスは対応画像を参照するため)。
   *
   * @param uploader 登録先のテクスチャ配列操作
   */
  public registerPreloadedTextures(uploader: TextureUploader): void {
    const uploadedImageKeys = new Set<string>();
    const atlasEntries: { key: string; asset: AtlasAsset }[] = [];
    for (const key of this.assetCache.keys()) {
      const asset = this.assetCache.get(key);
      if (asset === undefined) {
        continue;
      }
      if (asset.type === AssetType.Image) {
        this.uploadImageTexture(uploader, key, asset as ImageAsset);
        uploadedImageKeys.add(key);
      } else if (asset.type === AssetType.Atlas) {
        atlasEntries.push({ key, asset: asset as AtlasAsset });
      }
    }
    for (const entry of atlasEntries) {
      this.uploadAtlasTexture(uploader, entry.key, entry.asset, uploadedImageKeys);
    }
  }

  /**
   * スプライトを生成する。
   *
   * @param x 初期 X 座標
   * @param y 初期 Y 座標
   * @param texture テクスチャキー (省略時はデフォルト白テクスチャ)
   * @param frame フレーム名またはインデックス
   * @returns 生成された SpriteHandle
   */
  public sprite(x = 0, y = 0, texture?: string, frame?: string | number): SpriteHandle {
    return this.createSpriteInternal(x, y, texture, frame);
  }

  /**
   * 静止画イメージを生成する。
   *
   * @param x 初期 X 座標
   * @param y 初期 Y 座標
   * @param texture テクスチャキー (省略時はデフォルト白テクスチャ)
   * @param frame フレーム名またはインデックス
   * @returns 生成された SpriteHandle
   */
  public image(x = 0, y = 0, texture?: string, frame?: string | number): SpriteHandle {
    return this.createSpriteInternal(x, y, texture, frame);
  }

  /**
   * 大量スプライトの一括操作バッチを生成する。
   *
   * @param config バッチ設定 (texture 指定時は登録済みフレームに解決する)
   * @returns 生成された SpriteBatch
   */
  public sprites(config: SpriteBatchConfig): SpriteBatch {
    const { texture, ...rest } = config;
    if (texture === undefined) {
      return new SpriteBatch(this.world, this.frameTable, this.spriteBuffer, config);
    }
    const frameId = this.resolveTextureDefault(texture);
    return new SpriteBatch(this.world, this.frameTable, this.spriteBuffer, {
      ...rest,
      frame: frameId,
    });
  }

  private createSpriteInternal(
    x: number,
    y: number,
    texture?: string,
    frame?: string | number,
  ): SpriteHandle {
    const entity = this.world.spawn(Transform, WorldTransform, Sprite, SpriteSlot);
    const slot = this.spriteBuffer.allocateSlot();

    this.world.set(entity, Transform.x, x);
    this.world.set(entity, Transform.y, y);
    this.world.set(entity, Transform.scaleX, 1);
    this.world.set(entity, Transform.scaleY, 1);
    this.world.set(entity, Transform.rotation, 0);

    const frameId = this.resolveFrameId(texture, frame);
    this.world.set(entity, Sprite.frame, frameId);
    this.world.set(entity, Sprite.tint, 0xffffffff);
    this.world.set(entity, Sprite.layer, 0);
    this.world.set(entity, Sprite.flags, FLAG_VISIBLE);
    this.world.set(entity, Sprite.sortKey, 0);
    this.world.set(entity, SpriteSlot.slot, slot);

    return new SpriteHandle(this.world, entity, this.frameTable, this.spriteBuffer);
  }

  private resolveFrameId(texture: string | undefined, frame: string | number | undefined): number {
    if (typeof frame === 'number') {
      if (!Number.isInteger(frame) || frame < 0 || this.frameTable.getFrame(frame) === undefined) {
        throw new PlutoError(
          ErrorCode.InvalidArgument,
          `存在しないフレーム ID です: ${String(frame)}`,
        );
      }
      return frame;
    }
    if (texture === undefined) {
      return WHITE_FRAME_ID;
    }
    if (typeof frame === 'string') {
      const named = this.namedFrames.get(`${texture}:${frame}`);
      if (named === undefined) {
        throw new PlutoError(
          ErrorCode.InvalidArgument,
          `テクスチャ ${texture} にフレーム ${frame} がありません。preload で読み込んだか確認してください。`,
        );
      }
      return named;
    }
    return this.resolveTextureDefault(texture);
  }

  private resolveTextureDefault(texture: string): number {
    const frameId = this.textureFrames.get(texture);
    if (frameId === undefined) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        `テクスチャ ${texture} が登録されていません。preload で読み込んだか確認してください。`,
      );
    }
    return frameId;
  }

  private findImageFrame(imageFrameId: number | undefined): FrameInfo | undefined {
    if (imageFrameId === undefined) {
      return undefined;
    }
    return this.frameTable.getFrame(imageFrameId);
  }

  private uploadImageTexture(uploader: TextureUploader, key: string, image: ImageAsset): number {
    if (image.width > ATLAS_PAGE_SIZE || image.height > ATLAS_PAGE_SIZE) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        `画像 ${key} (${String(image.width)}x${String(image.height)}) は 1 ページ (${String(ATLAS_PAGE_SIZE)}px) に収まりません。`,
      );
    }
    const source = image.source;
    const isBitmap = typeof ImageBitmap !== 'undefined' && source instanceof ImageBitmap;
    if (!isBitmap) {
      throw new PlutoError(
        ErrorCode.UnsupportedFeature,
        `画像 ${key} は GPU 転送可能な形式 (ImageBitmap) ではありません。`,
      );
    }
    const page = uploader.allocateRgbaPage();
    uploader.uploadRgba(page, 0, 0, image.width, image.height, source);
    const frameId = this.frameTable.addFrame({
      uvMinX: 0,
      uvMinY: 0,
      uvMaxX: image.width / ATLAS_PAGE_SIZE,
      uvMaxY: image.height / ATLAS_PAGE_SIZE,
      width: image.width,
      height: image.height,
      page,
    });
    this.registerTextureFrame(key, frameId);
    return frameId;
  }

  private uploadAtlasTexture(
    uploader: TextureUploader,
    key: string,
    atlas: AtlasAsset,
    uploadedImageKeys: Set<string>,
  ): void {
    const imageAsset = this.assetCache.get(atlas.imageKey);
    if (imageAsset?.type !== AssetType.Image) {
      throw new PlutoError(
        ErrorCode.InvalidState,
        `アトラス ${key} の対応画像 (${atlas.imageKey}) が読み込まれていません。`,
      );
    }
    const image = imageAsset as ImageAsset;
    let imageFrameId: number | undefined;
    if (!uploadedImageKeys.has(atlas.imageKey)) {
      imageFrameId = this.uploadImageTexture(uploader, atlas.imageKey, image);
      uploadedImageKeys.add(atlas.imageKey);
    } else {
      imageFrameId = this.textureFrames.get(atlas.imageKey);
    }
    const imageFrame = this.findImageFrame(imageFrameId);
    if (imageFrame === undefined) {
      throw new PlutoError(
        ErrorCode.InvalidState,
        `アトラス ${key} の対応画像 (${atlas.imageKey}) のフレームが登録されていません。`,
      );
    }
    let isFirst = true;
    for (const [name, frame] of atlas.frames) {
      if (frame.rotated) {
        throw new PlutoError(
          ErrorCode.UnsupportedFeature,
          `回転フレーム ${name} は v1 では非対応です。回転なしで再出力してください。`,
        );
      }
      const frameId = this.frameTable.addFrame({
        uvMinX: frame.frame.x / ATLAS_PAGE_SIZE,
        uvMinY: frame.frame.y / ATLAS_PAGE_SIZE,
        uvMaxX: (frame.frame.x + frame.frame.w) / ATLAS_PAGE_SIZE,
        uvMaxY: (frame.frame.y + frame.frame.h) / ATLAS_PAGE_SIZE,
        width: frame.frame.w,
        height: frame.frame.h,
        anchorX: frame.anchor?.x ?? frame.pivot?.x ?? 0.5,
        anchorY: frame.anchor?.y ?? frame.pivot?.y ?? 0.5,
        page: imageFrame.page,
      });
      this.registerTextureFrame(key, frameId, name);
      if (isFirst) {
        this.registerTextureFrame(key, frameId);
        isFirst = false;
      }
    }
  }
}
