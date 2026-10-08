/**
 * @file 高レベル API 描画パスのブラウザテスト (docs/12-roadmap.md T-5.1)。
 *
 * T-4.4 と同じ 64 スプライトシーンを `add.image` とハンドル API だけで構築し、
 * T-4.4 のゴールデン画像と一致することを検証する (両バックエンド)。
 */
import { expect, test } from '../helpers/harness-test';
import { expectGolden } from '../helpers/golden';

test.describe('高レベル API 描画パス (T-5.1)', () => {
  test('64 スプライトシーンが高レベル API で T-4.4 と一致する', async ({ page, plutoBackend }) => {
    const errors: string[] = [];
    page.on('console', (msg) => {
      if (msg.type() === 'error') {
        errors.push(msg.text());
      }
    });
    page.on('pageerror', (error) => {
      errors.push(String(error));
    });

    await page.goto(`/tests/browser/fixtures/harness.html?backend=${plutoBackend}&build=src`);

    await page.evaluate(async (backend) => {
      const { Game } = await import('../../../src/scene/game');
      const { Scene } = await import('../../../src/scene/scene');

      class Main extends Scene {
        public override create(): void {
          return;
        }
      }

      const canvas = document.getElementById('pluto-canvas') as HTMLCanvasElement;
      const game = await Game.create({
        canvas,
        width: 256,
        height: 256,
        backgroundColor: 0x1a1a26,
        backend,
        scenes: [Main],
      });
      const scene = game.scenes.getScene('Main');
      if (scene === undefined) {
        throw new Error('シーンが開始していません');
      }

      // T-4.4 と同じ 16x16 テクスチャ (外枠 + 左上L字マーク)
      const texWidth = 16;
      const texHeight = 16;
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
      const page = game.textureArrayManager.allocateRgbaPage();
      game.textureArrayManager.uploadRgba(page, 0, 0, texWidth, texHeight, texPixels);
      const frameId = game.frameTable.addFrame({
        uvMinX: 0.0,
        uvMinY: 0.0,
        uvMaxX: 1.0,
        uvMaxY: 1.0,
        width: 24,
        height: 24,
        anchorX: 0.5,
        anchorY: 0.5,
        page,
      });
      scene.add.registerTextureFrame('test', frameId);

      // T-4.4 と同じ 8x8 配置・属性
      for (let i = 0; i < 64; i++) {
        const col = i % 8;
        const row = Math.floor(i / 8);
        const handle = scene.add.image(16 + col * 32, 16 + row * 32, 'test');
        if (row === 0) {
          handle.setBlend('opaque').setTint(0xff4444);
        } else if (row === 1) {
          handle.setBlend('additive').setTint(0x44ff44);
        } else if (row === 2) {
          handle.setFlip(true, false).setTint(0x4444ff);
        } else if (row === 3) {
          handle.setFlip(false, true).setTint(0xffff44);
        } else if (row === 4) {
          handle.setFlip(true, true).setTint(0xff44ff);
        } else if (row === 5) {
          handle
            .setLayer(col % 3)
            .setDepth((col * 0.1) % 1.0)
            .setTint(0x44ffff);
        } else {
          handle.setTint(0x808080);
        }
      }

      scene.cameras.main.centerOn(128, 128);

      await new Promise((resolve) => setTimeout(resolve, 500));
    }, plutoBackend);

    await expectGolden(page, 'sprite-cpu-assisted');

    // コンソールエラー・ページ例外がないこと
    expect(errors).toEqual([]);
  });
});
