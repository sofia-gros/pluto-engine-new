import { afterEach, describe, expect, it, vi } from 'vitest';
import { PlutoError } from '../../../../src/core/debug';
import { AssetType } from '../../../../src/assets/asset-types';
import { loadJson } from '../../../../src/assets/loaders/json-loader';

describe('json-loader', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('URL から JSON を読み込み JsonAsset を返す', async () => {
    const payload = { hello: 'world', count: 3 };
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.resolve(payload),
      }),
    );

    const asset = await loadJson('config', 'http://example.com/config.json');
    expect(asset.key).toBe('config');
    expect(asset.type).toBe(AssetType.Json);
    expect(asset.data).toEqual(payload);
  });

  it('HTTP エラー時は AssetLoadFailed を投げる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({}),
      }),
    );

    await expect(loadJson('missing', 'http://example.com/missing.json')).rejects.toThrow(
      PlutoError,
    );
  });

  it('JSON 解析失敗時は AssetLoadFailed を投げる', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: () => Promise.reject(new Error('bad json')),
      }),
    );

    await expect(loadJson('broken', 'http://example.com/broken.json')).rejects.toThrow(PlutoError);
  });

  it('fetch 自体の失敗時は AssetLoadFailed を投げる', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('network down')));

    await expect(loadJson('offline', 'http://example.com/offline.json')).rejects.toThrow(
      PlutoError,
    );
  });
});
