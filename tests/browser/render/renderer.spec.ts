/**
 * @file Renderer のブラウザテスト (docs/07-renderer.md §12, docs/12-roadmap.md T-4.7)
 *
 * Renderer によるマルチカメラ画面分割描画の実行を検証する。
 */
import { expect, test } from '../helpers/harness-test';

test.describe('Renderer マルチカメラ描画 (T-4.7)', () => {
  test('Renderer でスプリットスクリーン描画が実行できる', async ({ page, plutoBackend }) => {
    await page.goto(`/tests/browser/fixtures/harness.html?backend=${plutoBackend}&build=src`);

    const result = await page.evaluate(async (backend) => {
      const { createDevice, TextureFormat, TextureUsage, TextureDimension } =
        await import('../../../src/rhi');
      const { World } = await import('../../../src/core/ecs');
      const { WorldTransform } = await import('../../../src/transform');
      const {
        Renderer,
        SpriteRenderer,
        SpriteBuffer,
        packSprite,
        Sprite,
        SpriteSlot,
        FLAG_VISIBLE,
        FLAG_OPAQUE,
      } = await import('../../../src/render');
      const { FrameTable } = await import('../../../src/render/texture/frame-table');

      const canvas = document.getElementById('pluto-canvas') as HTMLCanvasElement;
      canvas.width = 256;
      canvas.height = 256;
      let device;
      try {
        device = await createDevice({ canvas, backend });
      } catch {
        return { isUnsupported: true, success: true };
      }

      // カラーテクスチャ配列 (RGBA8, 16x16, 1層)
      const texWidth = 16;
      const texHeight = 16;
      const colorTexture = device.createTexture({
        width: texWidth,
        height: texHeight,
        layers: 1,
        format: TextureFormat.RGBA8Unorm,
        usage: TextureUsage.TextureBinding | TextureUsage.CopyDst,
        dimension: TextureDimension.D2Array,
        label: 'TestColorTexture',
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
        label: 'TestCompressedTexture',
      });

      const frameTable = new FrameTable();
      const spriteBuffer = new SpriteBuffer(64);

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
        { maxSprites: 64 },
      );

      const renderer = new Renderer(device, spriteRenderer, {
        width: 256,
        height: 256,
      });

      // カメラ 0 (左半分: 0..128, 0..256, 背景赤)
      renderer.cameraStore.setViewport(0, 0, 0, 128, 256);
      renderer.cameraStore.setCenter(0, 64, 128);
      renderer.cameraStore.setClearColor(0, 0.5, 0.0, 0.0, 1.0);

      // カメラ 1 (右半分: 128..256, 0..256, 背景青)
      const cam1 = renderer.cameraStore.allocate(128, 256);
      renderer.cameraStore.setViewport(cam1, 128, 0, 128, 256);
      renderer.cameraStore.setCenter(cam1, 64, 128);
      renderer.cameraStore.setClearColor(cam1, 0.0, 0.0, 0.5, 1.0);

      const world = new World({ maxEntities: 64 });
      const e = world.spawn(WorldTransform, Sprite, SpriteSlot);
      world.set(e, WorldTransform.tx, 64);
      world.set(e, WorldTransform.ty, 128);
      world.set(e, WorldTransform.a, 1.0);
      world.set(e, WorldTransform.d, 1.0);
      world.set(e, Sprite.frame, 0);
      world.set(e, Sprite.flags, FLAG_VISIBLE | FLAG_OPAQUE);
      world.set(e, SpriteSlot.slot, 0);

      packSprite(
        spriteBuffer.u32View,
        spriteBuffer.f32View,
        0,
        64,
        128,
        2.0,
        2.0,
        0.0,
        0,
        0,
        0xffffffff,
        FLAG_VISIBLE | FLAG_OPAQUE,
        0.0,
      );
      spriteBuffer.dirtyBlocks.set(0);

      renderer.render(world);
      return { success: true };
    }, plutoBackend);

    expect(result.success).toBe(true);
  });
});
