import { describe, expect, it } from 'vitest';
import {
  AddressMode,
  BlendMode,
  ColorWrite,
  CompareFunc,
  CullMode,
  FilterMode,
  LoadAction,
  TextureDimension,
  TextureFormat,
} from '../../../../src/rhi/types';
import {
  blockBytes,
  blockSide,
  isCompressedFormat,
  isIntegerFormat,
  toAddressMode,
  toBlendFactors,
  toBufferHint,
  toBufferTarget,
  toClearMask,
  toColorMask,
  toCompareFunc,
  toCullFace,
  toFilterMode,
  toTextureFormatInfo,
  toTextureTarget,
} from '../../../../src/rhi/webgl2/webgl2-convert';

describe('webgl2 定数変換: バッファ', () => {
  it('Uniform は UBO の対象になる', () => {
    expect(toBufferTarget(1)).toBe(0x8a11);
  });

  it('Uniform 以外はコピー書き込みの対象になる', () => {
    expect(toBufferTarget(8)).toBe(0x8f37);
    expect(toBufferTarget(2)).toBe(0x8f37);
  });

  it('読み戻しは STREAM_READ、それ以外は DYNAMIC_DRAW になる', () => {
    expect(toBufferHint(32)).toBe(0x88e1);
    expect(toBufferHint(2)).toBe(0x88e8);
    expect(toBufferHint(1)).toBe(0x88e8);
  });
});

describe('webgl2 定数変換: テクスチャ', () => {
  it('RGBA8 は RGBA8 / RGBA / UNSIGNED_BYTE になる', () => {
    expect(toTextureFormatInfo(TextureFormat.RGBA8Unorm)).toEqual({
      internalFormat: 0x8058,
      format: 0x1908,
      type: 0x1401,
    });
  });

  it('BGRA8 は RGBA8 として扱う', () => {
    expect(toTextureFormatInfo(TextureFormat.BGRA8Unorm)).toEqual({
      internalFormat: 0x8058,
      format: 0x1908,
      type: 0x1401,
    });
  });

  it('浮動小数点は sized internal format になる', () => {
    expect(toTextureFormatInfo(TextureFormat.RGBA16Float)).toEqual({
      internalFormat: 0x881a,
      format: 0x1908,
      type: 0x140b,
    });
    expect(toTextureFormatInfo(TextureFormat.RGBA32Float)).toEqual({
      internalFormat: 0x8814,
      format: 0x1908,
      type: 0x1406,
    });
    expect(toTextureFormatInfo(TextureFormat.R32Float)).toEqual({
      internalFormat: 0x822e,
      format: 0x1903,
      type: 0x1406,
    });
  });

  it('整数は INTEGER の format になる', () => {
    expect(toTextureFormatInfo(TextureFormat.R32Uint)).toEqual({
      internalFormat: 0x8236,
      format: 0x8d95,
      type: 0x1405,
    });
    expect(toTextureFormatInfo(TextureFormat.RGBA32Uint)).toEqual({
      internalFormat: 0x8d70,
      format: 0x8d8e,
      type: 0x1405,
    });
  });

  it('深度は DEPTH_COMPONENT になる', () => {
    expect(toTextureFormatInfo(TextureFormat.Depth24Plus)).toEqual({
      internalFormat: 0x81a6,
      format: 0x1902,
      type: 0x1405,
    });
    expect(toTextureFormatInfo(TextureFormat.Depth32Float)).toEqual({
      internalFormat: 0x8cac,
      format: 0x1902,
      type: 0x1406,
    });
  });

  it('圧縮 3 形式は拡張の internal format になる', () => {
    expect(toTextureFormatInfo(TextureFormat.BC7RGBAUnorm).internalFormat).toBe(0x8e8c);
    expect(toTextureFormatInfo(TextureFormat.ETC2RGBA8Unorm).internalFormat).toBe(0x9278);
    expect(toTextureFormatInfo(TextureFormat.ASTC4x4Unorm).internalFormat).toBe(0x93b0);
  });

  it('次元は TEXTURE_2D と TEXTURE_2D_ARRAY になる', () => {
    expect(toTextureTarget(TextureDimension.D2)).toBe(0x0de1);
    expect(toTextureTarget(TextureDimension.D2Array)).toBe(0x8c1a);
  });

  it('整数書式は R32Uint と RGBA32Uint だけ', () => {
    expect(isIntegerFormat(TextureFormat.R32Uint)).toBe(true);
    expect(isIntegerFormat(TextureFormat.RGBA32Uint)).toBe(true);
    expect(isIntegerFormat(TextureFormat.RGBA8Unorm)).toBe(false);
    expect(isIntegerFormat(TextureFormat.RGBA32Float)).toBe(false);
    expect(isIntegerFormat(TextureFormat.BC7RGBAUnorm)).toBe(false);
  });

  it('10 以上が圧縮で、ブロックは 4x4 になる', () => {
    expect(isCompressedFormat(TextureFormat.RGBA32Uint)).toBe(false);
    expect(isCompressedFormat(TextureFormat.BC7RGBAUnorm)).toBe(true);
    expect(blockSide(TextureFormat.RGBA8Unorm)).toBe(1);
    expect(blockSide(TextureFormat.BC7RGBAUnorm)).toBe(4);
    expect(blockBytes(TextureFormat.BC7RGBAUnorm)).toBe(16);
    expect(blockBytes(TextureFormat.ETC2RGBA8Unorm)).toBe(8);
    expect(blockBytes(TextureFormat.ASTC4x4Unorm)).toBe(16);
  });
});

describe('webgl2 定数変換: サンプラと比較', () => {
  it('FilterMode と AddressMode は表のとおりに写像する', () => {
    expect(toFilterMode(FilterMode.Nearest)).toBe(0x2600);
    expect(toFilterMode(FilterMode.Linear)).toBe(0x2601);
    expect(toAddressMode(AddressMode.ClampToEdge)).toBe(0x812f);
    expect(toAddressMode(AddressMode.Repeat)).toBe(0x2901);
    expect(toAddressMode(AddressMode.MirrorRepeat)).toBe(0x8370);
  });

  it('CompareFunc は NEVER から ALWAYS まで順番に対応する', () => {
    expect(toCompareFunc(CompareFunc.Never)).toBe(0x0200);
    expect(toCompareFunc(CompareFunc.LessEqual)).toBe(0x0203);
    expect(toCompareFunc(CompareFunc.Always)).toBe(0x0207);
  });

  it('CullMode は有効無効と面に分かれる', () => {
    expect(toCullFace(CullMode.None)).toEqual({ enable: false, face: 0x0405 });
    expect(toCullFace(CullMode.Front)).toEqual({ enable: true, face: 0x0404 });
    expect(toCullFace(CullMode.Back)).toEqual({ enable: true, face: 0x0405 });
  });

  it('ColorWrite は 4 つの真偽値になる', () => {
    expect(toColorMask(15)).toEqual([true, true, true, true]);
    expect(toColorMask(ColorWrite.Red)).toEqual([true, false, false, false]);
    expect(toColorMask(0)).toEqual([false, false, false, false]);
  });

  it('LoadAction は使わない (boolean で直接渡す)', () => {
    expect(toClearMask(true, false)).toBe(0x4000);
    expect(toClearMask(false, true)).toBe(0x0100);
    expect(toClearMask(true, true)).toBe(0x4100);
    expect(toClearMask(false, false)).toBe(0);
    expect(LoadAction.Clear).toBe(0);
  });
});

describe('webgl2 定数変換: ブレンド', () => {
  it('Opaque は ONE と ZERO の組み合わせになる', () => {
    expect(toBlendFactors(BlendMode.Opaque)).toEqual({
      srcRGB: 1,
      dstRGB: 0,
      srcAlpha: 1,
      dstAlpha: 0,
    });
  });

  it('Alpha は SRC_ALPHA 合成になる', () => {
    expect(toBlendFactors(BlendMode.Alpha)).toEqual({
      srcRGB: 0x0302,
      dstRGB: 0x0303,
      srcAlpha: 1,
      dstAlpha: 0x0303,
    });
  });

  it('PremultipliedAlpha は係数だけが違う', () => {
    expect(toBlendFactors(BlendMode.PremultipliedAlpha)).toEqual({
      srcRGB: 1,
      dstRGB: 0x0303,
      srcAlpha: 1,
      dstAlpha: 0x0303,
    });
  });

  it('Additive は加算になる', () => {
    const f = toBlendFactors(BlendMode.Additive);
    expect(f.srcRGB).toBe(0x0302);
    expect(f.dstRGB).toBe(1);
  });

  it('Multiply は DST_COLOR と ZERO の組み合わせになる', () => {
    expect(toBlendFactors(BlendMode.Multiply)).toEqual({
      srcRGB: 0x0306,
      dstRGB: 0,
      srcAlpha: 1,
      dstAlpha: 0x0303,
    });
  });

  it('Screen は ONE_MINUS_DST_COLOR と ONE の組み合わせになる', () => {
    expect(toBlendFactors(BlendMode.Screen)).toEqual({
      srcRGB: 0x0307,
      dstRGB: 1,
      srcAlpha: 1,
      dstAlpha: 0x0303,
    });
  });

  it('6 種すべて異なる組み合わせが定められている', () => {
    const seen: string[] = [];
    for (let i = 0; i <= BlendMode.Screen; i++) {
      const f = toBlendFactors(i);
      const key = String(f.srcRGB) + '/' + String(f.dstRGB);
      expect(seen).not.toContain(key);
      seen.push(key);
    }
    expect(seen).toHaveLength(6);
  });
});
