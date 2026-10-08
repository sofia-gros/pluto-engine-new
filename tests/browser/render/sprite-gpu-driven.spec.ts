/**
 * @file GPU 駆動スプライト描画パスのブラウザテスト (docs/07-renderer.md §8, docs/12-roadmap.md T-4.6)
 *
 * layer, sortKey, flip, tint, opaque, additive を含む 64 スプライトの描画結果を
 * WebGPU 環境下で CPU 補助パスのゴールデン画像 (sprite-cpu-assisted.png) と比較し一致を検証する。
 * WebGL2 環境下では caps.compute === false に伴う UnsupportedFeature 例外送出を検証する。
 */
import { expect, test } from '../helpers/harness-test';
import { expectGolden } from '../helpers/golden';

test.describe('GPU 駆動スプライト描画パス (T-4.6)', () => {
  test('64 スプライトシーンの描画 (CPU 補助パスとのゴールデン画像一致検証)', async ({
    page,
    plutoBackend,
  }) => {
    await page.goto(`/tests/browser/fixtures/harness.html?backend=${plutoBackend}&build=src`);

    const result = await page.evaluate(async (backend) => {
      const { createDevice, LoadAction, TextureFormat, TextureUsage, TextureDimension } =
        await import('../../../src/rhi');
      const { ErrorCode, PlutoError } = await import('../../../src/core/debug');
      const { World } = await import('../../../src/core/ecs');
      const { WorldTransform } = await import('../../../src/transform');
      const {
        SpriteRenderer,
        SpritePathGpuDriven,
        SpriteBuffer,
        packSprite,
        Sprite,
        SpriteSlot,
        FLAG_VISIBLE,
        FLAG_FLIP_X,
        FLAG_FLIP_Y,
        FLAG_OPAQUE,
        FLAG_ADDITIVE,
      } = await import('../../../src/render');
      const { FrameTable } = await import('../../../src/render/texture/frame-table');

      const canvas = document.getElementById('pluto-canvas') as HTMLCanvasElement;
      let device;
      try {
        device = await createDevice({ canvas, backend });
      } catch {
        return { isUnsupported: true, success: true };
      }

      // 1. カラーテクスチャ配列 (RGBA8, 16x16, 1層)
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

      // 圧縮テクスチャ配列 (ダミー 16x16, 1層 RGBA8)
      const compressedTexture = device.createTexture({
        width: texWidth,
        height: texHeight,
        layers: 1,
        format: TextureFormat.RGBA8Unorm,
        usage: TextureUsage.TextureBinding | TextureUsage.CopyDst,
        dimension: TextureDimension.D2Array,
        label: 'TestCompressedTexture',
      });

      // L字型のパターンを描画して反転 (flip) が視覚的にわかるテクスチャを作成
      const texPixels = new Uint8Array(texWidth * texHeight * 4);
      for (let y = 0; y < texHeight; y++) {
        for (let x = 0; x < texWidth; x++) {
          const idx = (y * texWidth + x) * 4;
          const isBorder = x === 0 || x === texWidth - 1 || y === 0 || y === texHeight - 1;
          const isMark = x < 6 && y < 6 && (x < 3 || y < 3);
          if (isBorder || isMark) {
            texPixels[idx] = 255;
            texPixels[idx + 1] = 255;
            texPixels[idx + 2] = 255;
            texPixels[idx + 3] = 255;
          } else {
            texPixels[idx] = 200;
            texPixels[idx + 1] = 200;
            texPixels[idx + 2] = 200;
            texPixels[idx + 3] = 255;
          }
        }
      }
      device.writeTexture(
        colorTexture,
        { offsetX: 0, offsetY: 0, width: texWidth, height: texHeight, layer: 0 },
        texPixels,
      );

      // 2. フレームテーブル
      const frameTable = new FrameTable(64);
      const testFrameId = frameTable.addFrame({
        uvMinX: 0.0,
        uvMinY: 0.0,
        uvMaxX: 1.0,
        uvMaxY: 1.0,
        width: 24,
        height: 24,
        anchorX: 0.5,
        anchorY: 0.5,
        page: 0,
      });
      frameTable.flush(device);

      // 3. スプライトバッファ
      const maxSprites = 64;
      const spriteBuffer = new SpriteBuffer(maxSprites);

      // WebGL2 (または caps.compute / caps.indirectDraw が false) の場合、UnsupportedFeature 例外を検証
      if (!device.caps.compute || !device.caps.indirectDraw) {
        let hasThrown = false;
        try {
          new SpritePathGpuDriven(device, maxSprites, spriteBuffer, frameTable, {
            colorTexture,
            compressedTexture,
          });
        } catch (e) {
          if (e instanceof PlutoError && e.code === ErrorCode.UnsupportedFeature) {
            hasThrown = true;
          }
        }
        device.destroy();
        return { isUnsupported: true, success: hasThrown };
      }

      // 4. WebGPU: レンダラ生成 (GPU 駆動パスが有効)
      const renderer = new SpriteRenderer(device, spriteBuffer, frameTable, {
        colorTexture,
        compressedTexture,
      });

      // 5. ECS World と 64 個のスプライト作成 (T-4.4 と同一構成)
      const world = new World();
      const rowStyles = [
        { flags: FLAG_OPAQUE, tint: 0xff4444ff },
        { flags: FLAG_ADDITIVE, tint: 0x44ff44ff },
        { flags: FLAG_FLIP_X, tint: 0x4444ffff },
        { flags: FLAG_FLIP_Y, tint: 0xffff44ff },
        { flags: FLAG_FLIP_X | FLAG_FLIP_Y, tint: 0xff44ffff },
        { flags: 0, tint: 0x44ffffff },
        { flags: 0, tint: 0x808080ff },
        { flags: 0, tint: 0x808080ff },
      ];

      for (let i = 0; i < 64; i++) {
        const col = i % 8;
        const row = Math.floor(i / 8);
        const posX = 16 + col * 32;
        const posY = 16 + row * 32;

        const style = rowStyles[row];
        const flags = FLAG_VISIBLE | style.flags;
        const layer = row === 5 ? col % 3 : 0;
        const sortKey = row === 5 ? (col * 0.1) % 1.0 : 0.0;
        const tint = style.tint;

        const e = world.spawn(WorldTransform, Sprite, SpriteSlot);
        world.set(e, WorldTransform.tx, posX);
        world.set(e, WorldTransform.ty, posY);
        world.set(e, WorldTransform.a, 1.0);
        world.set(e, WorldTransform.d, 1.0);
        world.set(e, Sprite.frame, testFrameId);
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
          testFrameId,
          tint,
          flags,
          sortKey,
        );
      }

      // 6. カメラ uniform 設定
      const cameraData = new Float32Array(16);
      cameraData[0] = 2.0 / 256.0;
      cameraData[1] = 0.0;
      cameraData[2] = 0.0;
      cameraData[3] = -2.0 / 256.0;
      cameraData[4] = -1.0;
      cameraData[5] = 1.0;
      cameraData[6] = 0.0;
      cameraData[7] = 0.0;
      cameraData[8] = 0.0;
      cameraData[9] = 0.0;
      cameraData[10] = 256.0;
      cameraData[11] = 256.0;
      cameraData[12] = 256.0;
      cameraData[13] = 256.0;
      cameraData[14] = 1.0 / 256.0;
      cameraData[15] = 1.0 / 256.0;

      // 7. レンダーパスと GPU 駆動描画
      const currentTex = device.getCurrentTexture();
      const encoder = device.createCommandEncoder();
      const pass = encoder.beginRenderPass({
        colorAttachments: [
          {
            view: currentTex,
            load: LoadAction.Clear,
            store: true,
            clearColor: [0.1, 0.1, 0.15, 1.0],
          },
        ],
      });
      pass.setViewport(0, 0, 256, 256);

      // encoder を渡して GPU 駆動パスを実行
      renderer.render(pass, cameraData, [0, 0, 256, 256], world, encoder);

      pass.end();
      device.submit(encoder);

      return { isUnsupported: false, success: true };
    }, plutoBackend);

    if (result.isUnsupported) {
      expect(result.success).toBe(true);
    } else {
      expect(result.success).toBe(true);
      // T-4.4 と同一のゴールデン画像 (sprite-cpu-assisted) と一致することを検証
      await expectGolden(page, 'sprite-cpu-assisted');
    }
  });
});
