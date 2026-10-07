import { afterEach, describe, expect, it, vi } from 'vitest';
import { Loader } from '../../../src/assets/loader';
import { AssetType, type AtlasAsset } from '../../../src/assets/asset-types';

describe('Loader', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('空のキューの load は即座に complete イベントを発火する', async () => {
    const loader = new Loader();
    let isCompleted = false;
    loader.on('complete', () => {
      isCompleted = true;
    });

    const cache = await loader.load();
    expect(isCompleted).toBe(true);
    expect(cache.size).toBe(0);
  });

  it('アトラス JSON の読み込みと進捗イベントが正しく機能する', async () => {
    const mockJson = {
      frames: {
        'tile.png': {
          frame: { x: 0, y: 0, w: 16, h: 16 },
        },
      },
      meta: {
        image: 'tiles.png',
        size: { w: 64, h: 64 },
      },
    };

    // fetch のモック
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      text: () => Promise.resolve(JSON.stringify(mockJson)),
    });
    vi.stubGlobal('fetch', fetchMock);

    const loader = new Loader();
    loader.add({
      key: 'tiles_atlas',
      type: AssetType.Atlas,
      url: 'http://example.com/tiles.json',
    });

    const progressLogs: number[] = [];
    loader.on('progress', (e) => {
      progressLogs.push(e.progress);
      expect(e.key).toBe('tiles_atlas');
    });

    const cache = await loader.load();
    expect(progressLogs).toEqual([1.0]);
    expect(cache.has('tiles_atlas')).toBe(true);

    const asset = cache.get('tiles_atlas');
    if (asset?.type === AssetType.Atlas) {
      const atlas = asset as AtlasAsset;
      expect(atlas.frames.has('tile.png')).toBe(true);
    } else {
      expect.fail('asset is not AtlasAsset');
    }
  });
});
