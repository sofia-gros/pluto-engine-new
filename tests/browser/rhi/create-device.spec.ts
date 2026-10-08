/**
 * @file createDevice のブラウザテスト (docs/06-rhi.md §2、docs/12-roadmap.md T-3.4)。
 * バックエンド選択、caps、writeBuffer の部分転送を検証する。
 */
import { expect, test } from '../helpers/harness-test';

test.describe('createDevice とバッファ転送 (T-3.4)', () => {
  test('backend: webgl2 強制時に caps.compute === false になる', async ({ page, plutoBackend }) => {
    await page.goto(`/tests/browser/fixtures/harness.html?backend=${plutoBackend}&build=src`);

    const result = await page.evaluate(async () => {
      const { createDevice } = await import('../../../src/rhi');
      const canvas = document.getElementById('pluto-canvas') as HTMLCanvasElement;
      const device = await createDevice({ canvas, backend: 'webgl2' });
      const hasCompute = device.caps.compute;
      const backend = device.caps.backend;
      device.destroy();
      return { hasCompute, backend };
    });

    expect(result.backend).toBe('webgl2');
    expect(result.hasCompute).toBe(false);
  });

  test('指定したプロジェクトのバックエンドで正しく初期化される', async ({ page, plutoBackend }) => {
    await page.goto(`/tests/browser/fixtures/harness.html?backend=${plutoBackend}&build=src`);

    const result = await page.evaluate(async (expectedBackend) => {
      const { createDevice } = await import('../../../src/rhi');
      const canvas = document.getElementById('pluto-canvas') as HTMLCanvasElement;
      const device = await createDevice({ canvas, backend: expectedBackend });
      const res = {
        backend: device.caps.backend,
        hasStorage: device.caps.storageBuffers,
        maxTex: device.caps.maxTextureSize,
      };
      device.destroy();
      return res;
    }, plutoBackend);

    expect(result.backend).toBe(plutoBackend);
    // WebGPU はストレージバッファ対応、WebGL2 はデータテクスチャ読取のみ (docs/06 §3)
    expect(result.hasStorage).toBe(plutoBackend === 'webgpu');
    expect(result.maxTex).toBeGreaterThan(0);
  });

  test('writeBuffer の部分転送が反映される', async ({ page, plutoBackend }) => {
    await page.goto(`/tests/browser/fixtures/harness.html?backend=${plutoBackend}&build=src`);

    const result = await page.evaluate(async (backend) => {
      const { createDevice, BufferUsage } = await import('../../../src/rhi');
      const canvas = document.getElementById('pluto-canvas') as HTMLCanvasElement;
      const device = await createDevice({ canvas, backend });

      if (backend === 'webgpu') {
        // WebGPU: Storage/CopyDst バッファへ部分書き込みし、ステージング経由で readBufferAsync
        const sizeBytes = 16;
        const mainBuf = device.createBuffer({
          sizeBytes,
          usage: BufferUsage.Storage | BufferUsage.CopySrc | BufferUsage.CopyDst,
        });
        const stagingBuf = device.createBuffer({
          sizeBytes,
          usage: BufferUsage.MapRead | BufferUsage.CopyDst,
        });

        // 初期化: [10, 20, 30, 40]
        const initial = new Uint32Array([10, 20, 30, 40]);
        device.writeBuffer(mainBuf, 0, initial);

        // 部分転送: offset 4 bytes (index 1) に 2 要素 [99, 88] を書き込み
        const partial = new Uint32Array([99, 88]);
        device.writeBuffer(mainBuf, 4, partial);

        // コピーして読み戻し
        const encoder = device.createCommandEncoder();
        encoder.copyBufferToBuffer(mainBuf, 0, stagingBuf, 0, sizeBytes);
        device.submit(encoder);

        const readData = await device.readBufferAsync(stagingBuf, 0, sizeBytes);
        const resultArr = Array.from(new Uint32Array(readData));

        mainBuf.destroy();
        stagingBuf.destroy();
        device.destroy();

        return resultArr;
      } else {
        // WebGL2: Uniform バッファへ部分転送し、readBufferAsync で読み出し
        const sizeBytes = 16;
        const ubo = device.createBuffer({
          sizeBytes,
          usage: BufferUsage.Uniform | BufferUsage.CopyDst,
        });

        // 初期値 [10, 20, 30, 40]
        device.writeBuffer(ubo, 0, new Uint32Array([10, 20, 30, 40]));
        // 部分転送: offset 4 bytes に [99, 88]
        device.writeBuffer(ubo, 4, new Uint32Array([99, 88]));

        const readData = await device.readBufferAsync(ubo, 0, sizeBytes);
        const resultArr = Array.from(new Uint32Array(readData));

        ubo.destroy();
        device.destroy();

        return resultArr;
      }
    }, plutoBackend);

    expect(result).toEqual([10, 99, 88, 40]);
  });
});
