import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { World } from '../../../src/core/ecs';
import { PlutoError } from '../../../src/core/debug';
import { AssetCache, AssetType, type AtlasAsset, type ImageAsset } from '../../../src/assets';
import { FrameTable, SpriteBuffer } from '../../../src/render';
import { GameObjectFactory, type TextureUploader } from '../../../src/scene/game-object-factory';
import { SpriteHandle } from '../../../src/scene/handles/sprite-handle';
import { SpriteBatch } from '../../../src/scene/handles/sprite-batch';

function createStubUploader(): TextureUploader {
  let pages = 0;
  return {
    allocateRgbaPage: (): number => {
      const page = pages;
      pages += 1;
      return page;
    },
    uploadRgba: (): void => {
      return;
    },
  };
}

describe('GameObjectFactory', () => {
  let world: World;
  let frameTable: FrameTable;
  let spriteBuffer: SpriteBuffer;
  let assetCache: AssetCache;
  let factory: GameObjectFactory;

  afterEach(() => {
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    world = new World();
    frameTable = new FrameTable();
    spriteBuffer = new SpriteBuffer(1000);
    assetCache = new AssetCache();
    factory = new GameObjectFactory(world, frameTable, spriteBuffer, assetCache);
  });

  it('sprite() で SpriteHandle を生成できる', () => {
    const s = factory.sprite(100, 200);
    expect(s).toBeInstanceOf(SpriteHandle);
    expect(s.x).toBe(100);
    expect(s.y).toBe(200);
  });

  it('image() で SpriteHandle を生成できる', () => {
    const img = factory.image(50, 60);
    expect(img).toBeInstanceOf(SpriteHandle);
    expect(img.x).toBe(50);
    expect(img.y).toBe(60);
  });

  it('sprites() で SpriteBatch を生成できる', () => {
    const batch = factory.sprites({ count: 10 });
    expect(batch).toBeInstanceOf(SpriteBatch);
    expect(batch.count).toBe(10);
  });

  it('frame 番号指定でスプライトを生成できる', () => {
    const frameId = frameTable.addFrame({
      uvMinX: 0,
      uvMinY: 0,
      uvMaxX: 1,
      uvMaxY: 1,
      width: 16,
      height: 16,
      page: 0,
    });
    const s = factory.sprite(0, 0, undefined, frameId);
    expect(s.frame).toBe(frameId);
  });

  it('存在しない frame 番号は InvalidArgument になる', () => {
    expect(() => factory.sprite(0, 0, undefined, 999)).toThrow(PlutoError);
    expect(() => factory.sprite(0, 0, undefined, -1)).toThrow(PlutoError);
  });

  it('未登録の texture 指定は InvalidArgument になる', () => {
    expect(() => factory.sprite(0, 0, 'unknown')).toThrow(PlutoError);
    expect(() => factory.sprites({ count: 2, texture: 'unknown' })).toThrow(PlutoError);
  });

  it('registerTextureFrame で texture とフレーム名を解決できる', () => {
    const frameId = frameTable.addFrame({
      uvMinX: 0,
      uvMinY: 0,
      uvMaxX: 0.5,
      uvMaxY: 0.5,
      width: 32,
      height: 32,
      page: 0,
    });
    factory.registerTextureFrame('hero', frameId);
    factory.registerTextureFrame('hero', frameId, 'walk');
    const s = factory.sprite(10, 20, 'hero');
    expect(s.frame).toBe(frameId);
    const named = factory.sprite(0, 0, 'hero', 'walk');
    expect(named.frame).toBe(frameId);
    expect(() => factory.sprite(0, 0, 'hero', 'run')).toThrow(PlutoError);
    const batch = factory.sprites({ count: 3, texture: 'hero' });
    expect(batch.count).toBe(3);
  });

  it('registerPreloadedTextures は空キャッシュで何もしない', () => {
    expect(() => {
      factory.registerPreloadedTextures(createStubUploader());
    }).not.toThrow();
  });

  it('1 ページに収まらない画像は InvalidArgument になる', () => {
    const big: ImageAsset = {
      key: 'big',
      type: AssetType.Image,
      source: { width: 4096, height: 16 } as ImageBitmap,
      width: 4096,
      height: 16,
    };
    assetCache.set('big', big);
    expect(() => {
      factory.registerPreloadedTextures(createStubUploader());
    }).toThrow(PlutoError);
  });

  it('ImageBitmap でない画像は UnsupportedFeature になる', () => {
    const small: ImageAsset = {
      key: 'small',
      type: AssetType.Image,
      source: { width: 16, height: 16 } as ImageBitmap,
      width: 16,
      height: 16,
    };
    assetCache.set('small', small);
    expect(() => {
      factory.registerPreloadedTextures(createStubUploader());
    }).toThrow(PlutoError);
  });

  it('対応画像のないアトラスは InvalidState になる', () => {
    const atlas: AtlasAsset = {
      key: 'units',
      type: AssetType.Atlas,
      imageKey: 'units_image',
      size: { w: 64, h: 64 },
      frames: new Map([
        [
          'soldier',
          {
            frame: { x: 0, y: 0, w: 16, h: 16 },
            rotated: false,
            trimmed: false,
            spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
            sourceSize: { w: 16, h: 16 },
          },
        ],
      ]),
    };
    assetCache.set('units', atlas);
    expect(() => {
      factory.registerPreloadedTextures(createStubUploader());
    }).toThrow(PlutoError);
  });

  it('画像とアトラスを登録してスプライト生成に使える', () => {
    class FakeBitmap {
      public readonly width = 64;
      public readonly height = 64;
    }
    vi.stubGlobal('ImageBitmap', FakeBitmap);

    const image: ImageAsset = {
      key: 'tiles',
      type: AssetType.Image,
      source: new FakeBitmap() as ImageBitmap,
      width: 64,
      height: 64,
    };
    assetCache.set('tiles', image);
    const atlas: AtlasAsset = {
      key: 'units',
      type: AssetType.Atlas,
      imageKey: 'tiles',
      size: { w: 64, h: 64 },
      frames: new Map([
        [
          'soldier',
          {
            frame: { x: 0, y: 0, w: 16, h: 16 },
            rotated: false,
            trimmed: false,
            spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
            sourceSize: { w: 16, h: 16 },
          },
        ],
        [
          'archer',
          {
            frame: { x: 16, y: 0, w: 16, h: 16 },
            rotated: false,
            trimmed: false,
            spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
            sourceSize: { w: 16, h: 16 },
          },
        ],
      ]),
    };
    assetCache.set('units', atlas);

    factory.registerPreloadedTextures(createStubUploader());

    const plain = factory.sprite(5, 6, 'tiles');
    expect(plain.x).toBe(5);
    const soldier = factory.sprite(0, 0, 'units', 'soldier');
    const archer = factory.sprite(0, 0, 'units', 'archer');
    expect(soldier.frame).not.toBe(archer.frame);
    const fallback = factory.sprite(0, 0, 'units');
    expect(fallback.frame).toBe(soldier.frame);
  });

  it('回転フレームのアトラスは UnsupportedFeature になる', () => {
    class FakeBitmap {
      public readonly width = 64;
      public readonly height = 64;
    }
    vi.stubGlobal('ImageBitmap', FakeBitmap);

    const image: ImageAsset = {
      key: 'tiles',
      type: AssetType.Image,
      source: new FakeBitmap() as ImageBitmap,
      width: 64,
      height: 64,
    };
    assetCache.set('tiles', image);
    const atlas: AtlasAsset = {
      key: 'units',
      type: AssetType.Atlas,
      imageKey: 'tiles',
      size: { w: 64, h: 64 },
      frames: new Map([
        [
          'spun',
          {
            frame: { x: 0, y: 0, w: 16, h: 16 },
            rotated: true,
            trimmed: false,
            spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
            sourceSize: { w: 16, h: 16 },
          },
        ],
      ]),
    };
    assetCache.set('units', atlas);

    expect(() => {
      factory.registerPreloadedTextures(createStubUploader());
    }).toThrow(PlutoError);
  });
});
