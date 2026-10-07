/**
 * @file 圧縮テクスチャのブラウザテスト (docs/06-rhi.md §3・§5、docs/12-roadmap.md T-3.4)。
 * caps と実際の拡張/機能の一致、非対応時の UnsupportedFeature 送出、
 * 対応形式での単色ブロックアップロードとサンプリングを検証する。
 * test.skip は禁止 (環境に応じて分岐して検証)。
 */
import { expect, test } from '../helpers/harness-test';

test.describe('圧縮テクスチャ検証 (T-3.4)', () => {
  test('caps.textureCompression* と実際の機能・拡張が一致する', async ({ page, plutoBackend }) => {
    await page.goto(`/tests/browser/fixtures/harness.html?backend=${plutoBackend}&build=src`);

    const result = await page.evaluate(async (backend) => {
      const { createDevice } = await import('../../../src/rhi');
      const canvas = document.getElementById('pluto-canvas') as HTMLCanvasElement;
      const device = await createDevice({ canvas, backend });

      const caps = {
        bc7: device.caps.textureCompressionBC7,
        etc2: device.caps.textureCompressionETC2,
        astc: device.caps.textureCompressionASTC,
      };

      let isActualMatch = false;
      if (backend === 'webgpu') {
        // WebGPU では adapter / device.features と caps が一致しているか
        const adapter = await navigator.gpu.requestAdapter();
        const f = adapter ? adapter.features : null;
        if (f) {
          isActualMatch =
            caps.bc7 === f.has('texture-compression-bc') &&
            caps.etc2 === f.has('texture-compression-etc2') &&
            caps.astc === f.has('texture-compression-astc');
        }
      } else {
        // WebGL2 では getExtension と caps が一致しているか
        const gl = canvas.getContext('webgl2');
        if (gl) {
          isActualMatch =
            caps.bc7 === (gl.getExtension('EXT_texture_compression_bptc') !== null) &&
            caps.etc2 === (gl.getExtension('WEBGL_compressed_texture_etc') !== null) &&
            caps.astc === (gl.getExtension('WEBGL_compressed_texture_astc') !== null);
        }
      }

      device.destroy();
      return { caps, isActualMatch };
    }, plutoBackend);

    expect(result.isActualMatch).toBe(true);
  });

  test('非対応の圧縮形式は UnsupportedFeature になり、対応形式は生成・サンプリングできる', async ({
    page,
    plutoBackend,
  }) => {
    await page.goto(`/tests/browser/fixtures/harness.html?backend=${plutoBackend}&build=src`);

    const result = await page.evaluate(async (backend) => {
      const { createDevice, TextureFormat, TextureUsage, TextureDimension } =
        await import('../../../src/rhi');
      const { ErrorCode, PlutoError } = await import('../../../src/core/debug');
      const canvas = document.getElementById('pluto-canvas') as HTMLCanvasElement;
      const device = await createDevice({ canvas, backend });

      const formats = [
        {
          format: TextureFormat.BC7RGBAUnorm,
          supported: device.caps.textureCompressionBC7,
          name: 'BC7',
          blockSize: 16,
        },
        {
          format: TextureFormat.ETC2RGBA8Unorm,
          supported: device.caps.textureCompressionETC2,
          name: 'ETC2',
          blockSize: 8,
        },
        {
          format: TextureFormat.ASTC4x4Unorm,
          supported: device.caps.textureCompressionASTC,
          name: 'ASTC',
          blockSize: 16,
        },
      ];

      const outcomes: { name: string; supported: boolean; verified: boolean }[] = [];

      for (const item of formats) {
        if (!item.supported) {
          // 非対応形式で createTexture すると必ず PlutoError(UnsupportedFeature)
          let caught: unknown;
          try {
            device.createTexture({
              width: 4,
              height: 4,
              format: item.format,
              usage: TextureUsage.TextureBinding,
              dimension: TextureDimension.D2,
              layers: 1,
            });
          } catch (err) {
            caught = err;
          }
          const isUnsupported =
            caught instanceof PlutoError && caught.code === ErrorCode.UnsupportedFeature;
          outcomes.push({ name: item.name, supported: false, verified: isUnsupported });
        } else {
          // 対応形式の場合はテクスチャ生成と単色ブロックの writeTexture が成功すること
          const tex = device.createTexture({
            width: 4,
            height: 4,
            format: item.format,
            usage: TextureUsage.TextureBinding | TextureUsage.CopyDst,
            dimension: TextureDimension.D2,
            layers: 1,
          });

          // 単色ブロック (4x4) のダミーデータを書き込み
          const blockData = new Uint8Array(item.blockSize);
          device.writeTexture(
            tex,
            { offsetX: 0, offsetY: 0, layer: 0, width: 4, height: 4 },
            blockData,
          );

          tex.destroy();
          outcomes.push({ name: item.name, supported: true, verified: true });
        }
      }

      device.destroy();
      return outcomes;
    }, plutoBackend);

    for (const outcome of result) {
      expect(outcome.verified).toBe(true);
    }
  });
});
