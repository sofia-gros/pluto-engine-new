import { afterEach, describe, expect, it, vi } from 'vitest';
import { loadImage } from '../../../../src/assets/loaders/image-loader';
import { AssetType } from '../../../../src/assets/asset-types';
import { ErrorCode, PlutoError } from '../../../../src/core/debug';

describe('image-loader', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('画像 API が存在しない環境では UnsupportedFeature を投げる', async () => {
    // Node.js 環境では通常 createImageBitmap も Image も存在しない
    await expect(loadImage('test', 'http://example.com/test.png')).rejects.toThrow(PlutoError);

    try {
      await loadImage('test', 'http://example.com/test.png');
    } catch (e: unknown) {
      expect((e as PlutoError).code).toBe(ErrorCode.UnsupportedFeature);
    }
  });

  it('createImageBitmap が存在する場合に正常に ImageAsset を生成する', async () => {
    const mockBitmap = {
      width: 100,
      height: 100,
      close: vi.fn(),
    };

    const mockBlob = new Blob([]);
    vi.stubGlobal('createImageBitmap', vi.fn().mockResolvedValue(mockBitmap));
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        blob: () => Promise.resolve(mockBlob),
      }),
    );

    const asset = await loadImage('hero', 'http://example.com/hero.png');
    expect(asset.key).toBe('hero');
    expect(asset.type).toBe(AssetType.Image);
    expect(asset.width).toBe(100);
    expect(asset.height).toBe(100);
  });
});
