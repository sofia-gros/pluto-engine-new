/**
 * @file 静止スプライトベンチマーク (docs/07-renderer.md §13, docs/12-roadmap.md T-4.7)。
 * 100 万スプライト (16×16, 画面内, Alpha 50% / Opaque 50%) の描画性能を計測する。
 */

import { World } from '../../src/core/ecs';
import {
  FLAG_OPAQUE,
  FLAG_VISIBLE,
  packSprite,
  Renderer,
  Sprite,
  SpriteBuffer,
  SpriteRenderer,
  SpriteSlot,
} from '../../src/render';
import { FrameTable } from '../../src/render/texture/frame-table';
import {
  createDevice,
  TextureDimension,
  TextureFormat,
  TextureUsage,
  type RhiDevice,
} from '../../src/rhi';
import { WorldTransform } from '../../src/transform';
import type { BenchContext, BenchScene } from '../bench-types';

let device: RhiDevice | null = null;
let world: World | null = null;
let renderer: Renderer | null = null;

/** 静止スプライトベンチマークシーン (既定 1,000,000 スプライト)。 */
export const scene: BenchScene = {
  name: 'static-sprites',
  defaultCount: 1_000_000,
  async setup(ctx: BenchContext, count: number): Promise<void> {
    const actualCount = ctx.backend === 'webgl2' && count === 1_000_000 ? 100_000 : count;

    try {
      device = await createDevice({
        canvas: ctx.canvas,
        backend: ctx.backend,
      });
    } catch {
      ctx.metrics['gpuUnavailable'] = 1;
      return;
    }

    const texWidth = 16;
    const texHeight = 16;
    const colorTexture = device.createTexture({
      width: texWidth,
      height: texHeight,
      layers: 1,
      format: TextureFormat.RGBA8Unorm,
      usage: TextureUsage.TextureBinding | TextureUsage.CopyDst,
      dimension: TextureDimension.D2Array,
      label: 'BenchColorTexture',
    });

    const whiteData = new Uint8Array(texWidth * texHeight * 4).fill(255);
    device.writeTexture(
      colorTexture,
      {
        offsetX: 0,
        offsetY: 0,
        layer: 0,
        width: texWidth,
        height: texHeight,
      },
      whiteData,
    );

    const compressedTexture = device.createTexture({
      width: texWidth,
      height: texHeight,
      layers: 1,
      format: TextureFormat.RGBA8Unorm,
      usage: TextureUsage.TextureBinding | TextureUsage.CopyDst,
      dimension: TextureDimension.D2Array,
      label: 'BenchDummyCompressed',
    });

    const frameTable = new FrameTable();
    const spriteBuffer = new SpriteBuffer(actualCount);
    const sampler = device.createSampler({});

    const spriteRenderer = new SpriteRenderer(
      device,
      spriteBuffer,
      frameTable,
      {
        colorTexture,
        compressedTexture,
        sampler,
      },
      { maxSprites: actualCount },
    );

    renderer = new Renderer(device, spriteRenderer, {
      width: ctx.canvas.width,
      height: ctx.canvas.height,
    });

    world = new World({ maxEntities: actualCount });

    // スプライトを画面内 (1920x1080) に格子状に配置
    const cols = Math.ceil(Math.sqrt((actualCount * 1920) / 1080));
    const stepX = 1920 / cols;
    const stepY = 1080 / Math.ceil(actualCount / cols);

    const tPack0 = ctx.now();
    for (let i = 0; i < actualCount; i++) {
      const col = i % cols;
      const row = Math.floor(i / cols);
      const posX = col * stepX;
      const posY = row * stepY;

      // 50% は Opaque, 50% は Alpha
      const isOpaque = i % 2 === 0;
      const flags = FLAG_VISIBLE | (isOpaque ? FLAG_OPAQUE : 0);
      const layer = i % 8;
      const sortKey = (i % 100) * 0.01;

      const e = world.spawn(WorldTransform, Sprite, SpriteSlot);
      world.set(e, WorldTransform.tx, posX);
      world.set(e, WorldTransform.ty, posY);
      world.set(e, WorldTransform.a, 1.0);
      world.set(e, WorldTransform.d, 1.0);
      world.set(e, Sprite.frame, 0);
      world.set(e, Sprite.flags, flags);
      world.set(e, SpriteSlot.slot, i);

      packSprite(
        spriteBuffer.u32View,
        spriteBuffer.f32View,
        i,
        posX,
        posY,
        1.0,
        1.0,
        0.0,
        layer,
        0,
        0xffffffff,
        flags,
        sortKey,
      );
    }
    ctx.metrics['initialPackMs'] = ctx.now() - tPack0;

    // 全領域を dirty にマーク
    const blockCount = Math.ceil(actualCount / 64);
    for (let b = 0; b < blockCount; b++) {
      spriteBuffer.dirtyBlocks.set(b);
    }
  },

  step(): void {
    if (renderer && world) {
      renderer.render(world);
    }
  },
};
