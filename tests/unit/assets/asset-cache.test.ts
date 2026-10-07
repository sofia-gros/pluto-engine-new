import { describe, expect, it } from 'vitest';
import { AssetCache } from '../../../src/assets/asset-cache';
import { AssetType, type BaseAsset } from '../../../src/assets/asset-types';
import { ErrorCode, PlutoError } from '../../../src/core/debug';

describe('AssetCache', () => {
  it('アセットの登録・取得・存在確認ができる', () => {
    const cache = new AssetCache();
    const dummyAsset: BaseAsset = { key: 'test', type: AssetType.Image };

    expect(cache.size).toBe(0);
    expect(cache.has('test')).toBe(false);
    expect(cache.get('test')).toBeUndefined();

    cache.set('test', dummyAsset);

    expect(cache.size).toBe(1);
    expect(cache.has('test')).toBe(true);
    expect(cache.get('test')).toBe(dummyAsset);
  });

  it('参照カウントの retain / release が正しく動作する', () => {
    const cache = new AssetCache();
    const dummyAsset: BaseAsset = { key: 'test', type: AssetType.Image };

    cache.set('test', dummyAsset);
    expect(cache.getRefCount('test')).toBe(1);

    expect(cache.retain('test')).toBe(2);
    expect(cache.getRefCount('test')).toBe(2);

    expect(cache.release('test')).toBe(1);
    expect(cache.getRefCount('test')).toBe(1);
    expect(cache.has('test')).toBe(true);

    // カウントが 0 になるとキャッシュから自動削除される
    expect(cache.release('test')).toBe(0);
    expect(cache.getRefCount('test')).toBe(0);
    expect(cache.has('test')).toBe(false);
    expect(cache.size).toBe(0);
  });

  it('存在しないキーに対する retain / release は PlutoError を投げる', () => {
    const cache = new AssetCache();

    expect(() => cache.retain('missing')).toThrow(PlutoError);
    try {
      cache.retain('missing');
    } catch (e: unknown) {
      expect((e as PlutoError).code).toBe(ErrorCode.AssetNotFound);
    }

    expect(() => cache.release('missing')).toThrow(PlutoError);
    try {
      cache.release('missing');
    } catch (e: unknown) {
      expect((e as PlutoError).code).toBe(ErrorCode.AssetNotFound);
    }
  });

  it('明示的な delete と clear が正しく動作する', () => {
    const cache = new AssetCache();
    cache.set('a', { key: 'a', type: AssetType.Image });
    cache.set('b', { key: 'b', type: AssetType.Image });

    expect(cache.size).toBe(2);
    expect(cache.delete('a')).toBe(true);
    expect(cache.size).toBe(1);
    expect(cache.has('a')).toBe(false);

    cache.clear();
    expect(cache.size).toBe(0);
    expect(cache.has('b')).toBe(false);
  });
});
