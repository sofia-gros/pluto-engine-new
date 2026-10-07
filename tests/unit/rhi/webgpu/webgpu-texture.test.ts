import { describe, expect, it } from 'vitest';
import { TextureFormat } from '../../../../src/rhi/types';
import { buildImageDataLayout } from '../../../../src/rhi/webgpu/webgpu-texture';

describe('webgpu 転送レイアウト', () => {
  it('非圧縮の 64x64 は 1 行 256 バイトになる', () => {
    expect(buildImageDataLayout(TextureFormat.RGBA8Unorm, 64, 64)).toEqual({
      bytesPerRow: 256,
      rowsPerImage: 64,
    });
  });

  it('1x1 でも 1 行は 256 バイトの倍数になる', () => {
    expect(buildImageDataLayout(TextureFormat.RGBA8Unorm, 1, 1)).toEqual({
      bytesPerRow: 256,
      rowsPerImage: 1,
    });
  });

  it('BC7 の 64x64 は 16x16 ブロックで 1 行 256 バイトになる', () => {
    expect(buildImageDataLayout(TextureFormat.BC7RGBAUnorm, 64, 64)).toEqual({
      bytesPerRow: 256,
      rowsPerImage: 16,
    });
  });

  it('ETC2 の 4x4 は 1 ブロックで 1 行 256 バイトになる', () => {
    expect(buildImageDataLayout(TextureFormat.ETC2RGBA8Unorm, 4, 4)).toEqual({
      bytesPerRow: 256,
      rowsPerImage: 1,
    });
  });

  it('幅が 256 バイトを超えると切り上がる', () => {
    expect(buildImageDataLayout(TextureFormat.RGBA8Unorm, 100, 1)).toEqual({
      bytesPerRow: 512,
      rowsPerImage: 1,
    });
  });
});
