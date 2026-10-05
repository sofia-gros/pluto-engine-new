import { test, expect } from '@playwright/test';
import { compareImages } from '../helpers/golden';
import { PNG } from 'pngjs';

test.describe('Harness Smoke Test', () => {
  test('ハーネスが読み込まれ、crossOriginIsolatedが正しく設定される', async ({ page }) => {
    // 開発サーバー上のHTMLにアクセス
    await page.goto('/tests/browser/fixtures/harness.html?backend=webgl2');

    // window.__pluto の状態を評価
    const pluto = await page.evaluate(
      () =>
        (window as unknown as { __pluto: { backend: string; crossOriginIsolated: boolean } })
          .__pluto,
    );

    expect(pluto).toBeDefined();
    expect(pluto.backend).toBe('webgl2');
    // vite dev server に COOP/COEP を設定しているので true になるはず
    expect(pluto.crossOriginIsolated).toBe(true);
  });
});

test.describe('Golden helper unit test', () => {
  test('同一画像は差分0、1pxの違いを検出できる', () => {
    // 2x2の黒い画像
    const img1 = new PNG({ width: 2, height: 2 });
    for (let i = 0; i < img1.data.length; i++) {
      img1.data[i] = i % 4 === 3 ? 255 : 0; // RGBA: (0, 0, 0, 255)
    }

    // img1と全く同じ画像
    const img2 = new PNG({ width: 2, height: 2 });
    img1.data.copy(img2.data);

    // 1pxだけ赤い画像
    const img3 = new PNG({ width: 2, height: 2 });
    img1.data.copy(img3.data);
    img3.data[0] = 255; // R = 255

    const buf1 = PNG.sync.write(img1);
    const buf2 = PNG.sync.write(img2);
    const buf3 = PNG.sync.write(img3);

    // 同一なら差分0
    expect(compareImages(buf1, buf2)).toBe(0);
    // 1px違うなら差分1
    expect(compareImages(buf1, buf3)).toBe(1);
  });
});
