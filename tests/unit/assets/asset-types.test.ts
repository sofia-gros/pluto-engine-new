import { describe, expect, it } from 'vitest';
import { AssetType } from '../../../src/assets/asset-types';

describe('asset-types', () => {
  it('AssetType 定数が定義されている', () => {
    expect(AssetType.Image).toBe('image');
    expect(AssetType.Atlas).toBe('atlas');
    expect(AssetType.Audio).toBe('audio');
    expect(AssetType.Binary).toBe('binary');
    expect(AssetType.Json).toBe('json');
  });
});
