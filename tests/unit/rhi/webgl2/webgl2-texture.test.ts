import { describe, expect, it } from 'vitest';
import { TextureFormat } from '../../../../src/rhi/types';
import { transferBlockBytes } from '../../../../src/rhi/webgl2/webgl2-texture';
import { toTextureFormatInfo } from '../../../../src/rhi/webgl2/webgl2-convert';

describe('webgl2 テクスチャ転送', () => {
  it('非圧縮の転送量は幅そのままになる', () => {
    expect(transferBlockBytes(TextureFormat.RGBA8Unorm, 0, 64)).toBe(256);
    expect(transferBlockBytes(TextureFormat.RGBA8Unorm, 3, 5)).toBe(20);
  });

  it('圧縮はブロックに切り上がる', () => {
    expect(transferBlockBytes(TextureFormat.BC7RGBAUnorm, 0, 4)).toBe(16);
    expect(transferBlockBytes(TextureFormat.BC7RGBAUnorm, 1, 4)).toBe(32);
    expect(transferBlockBytes(TextureFormat.ETC2RGBA8Unorm, 0, 8)).toBe(16);
  });

  it('転送の 3 値が取れる', () => {
    expect(toTextureFormatInfo(TextureFormat.RGBA8Unorm)).toEqual({
      internalFormat: 0x8058,
      format: 0x1908,
      type: 0x1401,
    });
  });
});
