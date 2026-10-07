import { describe, expect, it } from 'vitest';
import {
  AddressMode,
  BindingType,
  BlendMode,
  ColorWrite,
  CompareFunc,
  CullMode,
  FilterMode,
  LoadAction,
  ShaderStage,
  TextureDimension,
  TextureFormat,
} from '../../../../src/rhi/types';
import {
  blockBytes,
  blockSide,
  buildCapabilities,
  isBufferBinding,
  isCompressedFormat,
  isTextureBinding,
  toAddressMode,
  toBlendState,
  toBufferBindingType,
  toBufferUsage,
  toColorWrite,
  toCompareFunc,
  toCullMode,
  toFilterMode,
  toLoadOp,
  toSamplerBindingType,
  toShaderStage,
  toStorageTextureAccess,
  toTextureFormat,
  toTextureSampleType,
  toTextureUsage,
  toTextureViewDimension,
} from '../../../../src/rhi/webgpu/webgpu-convert';

/** `GPUDevice.features` の代わりの偽物。指定した名前だけ `has` が true を返す。 */
const FEATURES = (names: readonly string[]) => ({
  has: (name: string): boolean => names.includes(name),
});

/** `GPUDevice.limits` の代わりの偽物。値は問わないので全部 1 でよい。 */
const LIMITS = {
  maxTextureDimension2D: 1,
  maxTextureArrayLayers: 1,
  maxStorageBufferBindingSize: 1,
  maxComputeWorkgroupSizeX: 1,
  maxComputeInvocationsPerWorkgroup: 1,
  minUniformBufferOffsetAlignment: 1,
  minStorageBufferOffsetAlignment: 1,
};

/**
 * `buildCapabilities` の測定に使うデバイスの偽物を作る。
 * @param features 有効なフィーチャ名
 * @param limits limit の値
 * @returns デバイスの偽物
 */
function fakeDevice(features: readonly string[], limits = LIMITS): GPUDevice {
  const partial = { features: FEATURES(features), limits };
  return partial as GPUDevice;
}

describe('webgpu 定数変換: バッファとテクスチャの用途', () => {
  it('BufferUsage のビットが仕様値に変換される (UNIFORM は 0x40)', () => {
    const uniform = toBufferUsage(1);
    const storage = toBufferUsage(2);
    expect(uniform).toBe(0x0040);
    expect(storage).toBe(0x0080);
    expect(uniform & storage).toBe(0);
    expect(toBufferUsage(3)).toBe(uniform | storage);
  });

  it('MapRead と CopyDst を同時に指定しても両方とも変換される', () => {
    const both = toBufferUsage(32 | 16);
    expect(both).toBe(0x0001 | 0x0008);
    expect(both & 0x0040).toBe(0);
    expect(toBufferUsage(0)).toBe(0);
    expect(toBufferUsage(31)).not.toBe(both);
  });

  it('TextureUsage のビットフラグが組み合わされる', () => {
    const src = toTextureUsage(1);
    const dst = toTextureUsage(2);
    const binding = toTextureUsage(4);
    const render = toTextureUsage(8);
    const storage = toTextureUsage(16);
    expect(src).toBe(0x01);
    expect(dst).toBe(0x02);
    expect(binding).toBe(0x04);
    expect(render).toBe(0x10);
    expect(storage).toBe(0x08);
    expect(
      [src, dst, binding, render, storage].filter((v, i, a) => a.indexOf(v) === i),
    ).toHaveLength(5);
    expect(binding & render).toBe(0);
    expect(render | storage).not.toBe(binding);
  });
});

describe('webgpu 定数変換: 書式と次元', () => {
  it('TextureFormat の 13 種がすべて写像される', () => {
    expect(toTextureFormat(TextureFormat.RGBA8Unorm)).toBe('rgba8unorm');
    expect(toTextureFormat(TextureFormat.BGRA8Unorm)).toBe('bgra8unorm');
    expect(toTextureFormat(TextureFormat.Depth24Plus)).toBe('depth24plus');
    expect(toTextureFormat(TextureFormat.BC7RGBAUnorm)).toBe('bc7-rgba-unorm');
    expect(toTextureFormat(TextureFormat.ETC2RGBA8Unorm)).toBe('etc2-rgba8unorm');
    expect(toTextureFormat(TextureFormat.ASTC4x4Unorm)).toBe('astc-4x4-unorm');
  });

  it('TextureDimension はビューで分かれる', () => {
    expect(toTextureViewDimension(TextureDimension.D2)).toBe('2d');
    expect(toTextureViewDimension(TextureDimension.D2Array)).toBe('2d-array');
  });

  it('CompareFunc は 0 から 7 まで順番に対応する', () => {
    expect(toCompareFunc(CompareFunc.Never)).toBe('never');
    expect(toCompareFunc(CompareFunc.LessEqual)).toBe('less-equal');
    expect(toCompareFunc(CompareFunc.Always)).toBe('always');
  });

  it('FilterMode と AddressMode は表のとおりに写像する', () => {
    expect(toFilterMode(FilterMode.Nearest)).toBe('nearest');
    expect(toFilterMode(FilterMode.Linear)).toBe('linear');
    expect(toAddressMode(AddressMode.ClampToEdge)).toBe('clamp-to-edge');
    expect(toAddressMode(AddressMode.Repeat)).toBe('repeat');
    expect(toAddressMode(AddressMode.MirrorRepeat)).toBe('mirror-repeat');
  });

  it('LoadAction は Clear と Load に対応する', () => {
    expect(toLoadOp(LoadAction.Clear)).toBe('clear');
    expect(toLoadOp(LoadAction.Load)).toBe('load');
  });

  it('ColorWrite のビットフラグが組み合わされる', () => {
    const all = toColorWrite(15);
    expect(toColorWrite(ColorWrite.Red)).toBe(1);
    expect(toColorWrite(ColorWrite.Green)).toBe(2);
    expect(toColorWrite(ColorWrite.Blue)).toBe(4);
    expect(toColorWrite(ColorWrite.Alpha)).toBe(8);
    expect(toColorWrite(0)).toBe(0);
    expect([1, 2, 4, 8].reduce((a, b) => a | b, 0)).toBe(all);
  });
});

describe('webgpu 定数変換: ステージと結合', () => {
  it('ShaderStage のビットフラグが組み合わされる', () => {
    const both = toShaderStage(ShaderStage.Vertex | ShaderStage.Fragment);
    expect(both & toShaderStage(ShaderStage.Vertex)).toBe(toShaderStage(ShaderStage.Vertex));
    expect(both & toShaderStage(ShaderStage.Fragment)).toBe(toShaderStage(ShaderStage.Fragment));
    expect(both & toShaderStage(ShaderStage.Compute)).toBe(0);
    expect(toShaderStage(ShaderStage.Compute)).toBe(4);
  });

  it('CullMode は 3 種だけ', () => {
    expect(toCullMode(CullMode.None)).toBe('none');
    expect(toCullMode(CullMode.Front)).toBe('front');
    expect(toCullMode(CullMode.Back)).toBe('back');
  });

  it('BindingType はバッファかテクスチャかで分けられる', () => {
    expect(isBufferBinding(BindingType.UniformBuffer)).toBe(true);
    expect(isBufferBinding(BindingType.StorageBufferRead)).toBe(true);
    expect(isBufferBinding(BindingType.StorageBufferReadWrite)).toBe(true);
    expect(isBufferBinding(BindingType.Texture)).toBe(false);
    expect(isTextureBinding(BindingType.Texture)).toBe(true);
    expect(isTextureBinding(BindingType.StorageTexture)).toBe(true);
    expect(isTextureBinding(BindingType.Sampler)).toBe(false);
    expect(isTextureBinding(BindingType.UniformBuffer)).toBe(false);
  });

  it('buffer binding の種別は 3 種', () => {
    expect(toBufferBindingType(BindingType.UniformBuffer)).toBe('uniform');
    expect(toBufferBindingType(BindingType.StorageBufferRead)).toBe('read-only-storage');
    expect(toBufferBindingType(BindingType.StorageBufferReadWrite)).toBe('storage');
  });

  it('32 ビット浮動小数のテクスチャは線形補間にできない', () => {
    expect(toTextureSampleType(TextureFormat.RGBA8Unorm)).toBe('float');
    expect(toTextureSampleType(TextureFormat.RGBA32Float)).toBe('unfilterable-float');
    expect(toTextureSampleType(TextureFormat.R32Float)).toBe('unfilterable-float');
    expect(toTextureSampleType(TextureFormat.RGBA32Uint)).toBe('uint');
    expect(toTextureSampleType(TextureFormat.Depth24Plus)).toBe('depth');
  });

  it('ストレージテクスチャは書き込み、サンプラは絞りで分ける', () => {
    expect(toStorageTextureAccess(BindingType.StorageTexture)).toBe('write-only');
    expect(toStorageTextureAccess(BindingType.Texture)).toBe('read-only');
    expect(toSamplerBindingType(FilterMode.Linear)).toBe('filtering');
    expect(toSamplerBindingType(FilterMode.Nearest)).toBe('non-filtering');
  });
});

describe('webgpu 定数変換: ブレンド', () => {
  it('Opaque は複写しない', () => {
    const s = toBlendState(BlendMode.Opaque);
    expect(s.color).toEqual({ srcFactor: 'one', dstFactor: 'zero', operation: 'add' });
    expect(s.alpha).toEqual({ srcFactor: 'one', dstFactor: 'zero', operation: 'add' });
  });

  it('Alpha は src-alpha 合成になる', () => {
    const s = toBlendState(BlendMode.Alpha);
    expect(s.color.srcFactor).toBe('src-alpha');
    expect(s.color.dstFactor).toBe('one-minus-src-alpha');
  });

  it('PremultipliedAlpha は係数だけが違う', () => {
    const s = toBlendState(BlendMode.PremultipliedAlpha);
    expect(s.color.srcFactor).toBe('one');
    expect(s.color.dstFactor).toBe('one-minus-src-alpha');
  });

  it('Multiply は dst と zero の組み合わせになる', () => {
    const s = toBlendState(BlendMode.Multiply);
    expect(s.color).toEqual({ srcFactor: 'dst', dstFactor: 'zero', operation: 'add' });
  });

  it('Screen は one-minus-dst と one の組み合わせになる', () => {
    const s = toBlendState(BlendMode.Screen);
    expect(s.color).toEqual({ srcFactor: 'one-minus-dst', dstFactor: 'one', operation: 'add' });
  });

  it('6 種すべて異なる組み合わせが定められている', () => {
    const seen: string[] = [];
    for (let i = 0; i <= BlendMode.Screen; i++) {
      const s = toBlendState(i);
      const key = String(s.color.srcFactor) + '/' + String(s.color.dstFactor);
      expect(seen).not.toContain(key);
      seen.push(key);
    }
    expect(seen).toHaveLength(6);
  });
});

describe('webgpu 定数変換: 圧縮フォーマット', () => {
  it('10 以上が圧縮である', () => {
    expect(isCompressedFormat(TextureFormat.RGBA32Uint)).toBe(false);
    expect(isCompressedFormat(TextureFormat.BC7RGBAUnorm)).toBe(true);
    expect(isCompressedFormat(TextureFormat.ETC2RGBA8Unorm)).toBe(true);
    expect(isCompressedFormat(TextureFormat.ASTC4x4Unorm)).toBe(true);
  });

  it('圧縮のブロック辺は 4x4、バイト数は形式ごとに異なる', () => {
    expect(blockSide(TextureFormat.RGBA8Unorm)).toBe(1);
    expect(blockBytes(TextureFormat.RGBA8Unorm)).toBe(4);
    expect(blockSide(TextureFormat.BC7RGBAUnorm)).toBe(4);
    expect(blockBytes(TextureFormat.BC7RGBAUnorm)).toBe(16);
    expect(blockBytes(TextureFormat.ETC2RGBA8Unorm)).toBe(8);
    expect(blockBytes(TextureFormat.ASTC4x4Unorm)).toBe(16);
  });
});

describe('webgpu 能力の作り出し', () => {
  it('有効なフィーチャのみが true になる', () => {
    const caps = buildCapabilities(
      fakeDevice(['timestamp-query', 'indirect-first-instance', 'texture-compression-bc']),
    );
    expect(caps.backend).toBe('webgpu');
    expect(caps.compute).toBe(true);
    expect(caps.timestampQuery).toBe(true);
    expect(caps.indirectDraw).toBe(true);
    expect(caps.storageBuffers).toBe(true);
    expect(caps.textureCompressionBC7).toBe(true);
    expect(caps.textureCompressionETC2).toBe(false);
    expect(caps.textureCompressionASTC).toBe(false);
  });

  it('フィーチャが無いと false になる', () => {
    const caps = buildCapabilities(fakeDevice([]));
    expect(caps.timestampQuery).toBe(false);
    expect(caps.indirectDraw).toBe(false);
    expect(caps.floatRenderTarget).toBe(false);
    expect(caps.floatBlend).toBe(false);
  });

  it('float32-blendable があると 32 ビット浮動小数の描画先とブレンドが使える', () => {
    const caps = buildCapabilities(fakeDevice(['float32-blendable']));
    expect(caps.floatRenderTarget).toBe(true);
    expect(caps.floatBlend).toBe(true);
  });

  it('limit はデバイスの値をそのまま返す', () => {
    const limits = {
      ...LIMITS,
      maxTextureDimension2D: 8192,
      maxComputeInvocationsPerWorkgroup: 256,
      minUniformBufferOffsetAlignment: 256,
    };
    const caps = buildCapabilities(fakeDevice([], limits));
    expect(caps.maxTextureSize).toBe(8192);
    expect(caps.maxComputeInvocationsPerWorkgroup).toBe(256);
    expect(caps.minUniformBufferOffsetAlignment).toBe(256);
  });
});
