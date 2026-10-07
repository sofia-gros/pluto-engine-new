import { describe, expect, it } from 'vitest';
import * as assets from '../../../src/assets';

describe('assets index', () => {
  it('公開シンボルが正しくエクスポートされている', () => {
    expect(assets.AssetType).toBeDefined();
    expect(assets.AssetCache).toBeDefined();
    expect(assets.Loader).toBeDefined();
    expect(assets.loadImage).toBeDefined();
    expect(assets.parseAtlasJson).toBeDefined();
    expect(assets.loadAtlasJson).toBeDefined();
  });
});
