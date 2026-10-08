/**
 * @file CPU 補助スプライト描画パスのブラウザテスト (docs/07-renderer.md §9, docs/12-roadmap.md T-4.4)
 *
 * layer, sortKey, flip, tint, opaque, additive を含む 64 スプライトの描画結果を
 * WebGPU / WebGL2 の両バックエンドでゴールデン画像比較する。
 */
import { test } from '../helpers/harness-test';
import { expectGolden } from '../helpers/golden';

test.describe('CPU 補助スプライト描画パス (T-4.4)', () => {
  test('64 スプライトシーンの描画 (ゴールデン画像)', async ({ page, plutoBackend }) => {
    await page.goto(`/tests/browser/fixtures/harness.html?backend=${plutoBackend}&build=src`);

    await page.evaluate(async (backend) => {
      const { createDevice, LoadAction, TextureFormat, TextureUsage, TextureDimension } =
        await import('../../../src/rhi');
      const { World } = await import('../../../src/core/ecs');
      const { WorldTransform } = await import('../../../src/transform');
      const {
        SpriteRenderer,
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
      const device = await createDevice({ canvas, backend });

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
          // 外枠 + 左上L字マーク
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

      // 3. スプライトバッファ & レンダラ
      const maxSprites = 64;
      const spriteBuffer = new SpriteBuffer(maxSprites);
      const renderer = new SpriteRenderer(device, spriteBuffer, frameTable, {
        colorTexture,
        compressedTexture,
      });

      // 4. ECS World と 64 個のスプライト作成
      const world = new World();

      // 8x8 グリッド配置 (各 32x32 間隔)
      for (let i = 0; i < 64; i++) {
        const col = i % 8;
        const row = Math.floor(i / 8);
        const posX = 16 + col * 32;
        const posY = 16 + row * 32;

        let flags = FLAG_VISIBLE;
        let layer = 0;
        let sortKey = 0.0;
        let tint: number;

        // 様々な要素を割り振る
        if (row === 0) {
          // Opaque
          flags |= FLAG_OPAQUE;
          tint = 0xff4444ff; // 赤
        } else if (row === 1) {
          // Additive
          flags |= FLAG_ADDITIVE;
          tint = 0x44ff44ff; // 緑
        } else if (row === 2) {
          // Flip X
          flags |= FLAG_FLIP_X;
          tint = 0x4444ffff; // 青
        } else if (row === 3) {
          // Flip Y
          flags |= FLAG_FLIP_Y;
          tint = 0xffff44ff; // 黄
        } else if (row === 4) {
          // Flip X + Y
          flags |= FLAG_FLIP_X | FLAG_FLIP_Y;
          tint = 0xff44ffff; // マゼンタ
        } else if (row === 5) {
          // 複数レイヤー
          layer = col % 3;
          sortKey = (col * 0.1) % 1.0;
          tint = 0x44ffffff; // シアン
        } else {
          // 通常 Alpha + 各種ティント
          tint = 0x808080ff;
        }

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

      // 5. カメラ uniform 設定 (256x256 正射影)
      const cameraData = new Float32Array(16);
      // viewProjAffine: (2/256, 0, 0, -2/256)
      cameraData[0] = 2.0 / 256.0;
      cameraData[1] = 0.0;
      cameraData[2] = 0.0;
      cameraData[3] = -2.0 / 256.0;
      // viewProjTranslation: (-1, 1, 0, 0)
      cameraData[4] = -1.0;
      cameraData[5] = 1.0;
      cameraData[6] = 0.0;
      cameraData[7] = 0.0;
      // cullRect: (0, 0, 256, 256)
      cameraData[8] = 0.0;
      cameraData[9] = 0.0;
      cameraData[10] = 256.0;
      cameraData[11] = 256.0;
      // screenResolution: (256, 256, 1/256, 1/256)
      cameraData[12] = 256.0;
      cameraData[13] = 256.0;
      cameraData[14] = 1.0 / 256.0;
      cameraData[15] = 1.0 / 256.0;

      // 6. レンダーパスを作成して描画
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

      renderer.render(pass, cameraData, [0, 0, 256, 256], world);

      pass.end();
      device.submit(encoder);
    }, plutoBackend);

    await expectGolden(page, 'sprite-cpu-assisted');
  });
});
