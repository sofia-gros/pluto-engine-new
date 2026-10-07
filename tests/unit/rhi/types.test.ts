import { describe, expect, it } from 'vitest';
import {
  AddressMode,
  BlendMode,
  BindingType,
  BufferUsage,
  ColorWrite,
  CompareFunc,
  CullMode,
  FilterMode,
  LoadAction,
  ShaderStage,
  TextureDimension,
  TextureFormat,
  TextureUsage,
} from '../../../src/rhi/types';

describe('rhi 定数', () => {
  it('BufferUsage は docs/06 §5 のビットフラグ値を持つ', () => {
    expect(BufferUsage).toEqual({
      Uniform: 1,
      Storage: 2,
      Indirect: 4,
      CopySrc: 8,
      CopyDst: 16,
      MapRead: 32,
    });
  });

  it('TextureUsage は docs/06 §5 の 5 ビットを持つ (D-21)', () => {
    expect(TextureUsage).toEqual({
      CopySrc: 1,
      CopyDst: 2,
      TextureBinding: 4,
      RenderAttachment: 8,
      StorageBinding: 16,
    });
  });

  it('TextureFormat は 0 から 12 まで連番で、圧縮形式が末尾 3 個 (docs/06 §5)', () => {
    expect(TextureFormat.RGBA8Unorm).toBe(0);
    expect(TextureFormat.BGRA8Unorm).toBe(1);
    expect(TextureFormat.RGBA16Float).toBe(2);
    expect(TextureFormat.RGBA32Float).toBe(3);
    expect(TextureFormat.R32Float).toBe(4);
    expect(TextureFormat.R32Uint).toBe(5);
    expect(TextureFormat.RG32Float).toBe(6);
    expect(TextureFormat.RGBA32Uint).toBe(7);
    expect(TextureFormat.Depth24Plus).toBe(8);
    expect(TextureFormat.Depth32Float).toBe(9);
    expect(TextureFormat.BC7RGBAUnorm).toBe(10);
    expect(TextureFormat.ETC2RGBA8Unorm).toBe(11);
    expect(TextureFormat.ASTC4x4Unorm).toBe(12);
  });

  it('TextureDimension はミップマップを持たないため D2 と D2Array のみ', () => {
    expect(TextureDimension).toEqual({ D2: 0, D2Array: 1 });
    expect(Object.keys(TextureDimension)).toHaveLength(2);
  });

  it('BlendMode は 6 種 (Opaque から Screen まで)', () => {
    expect(Object.keys(BlendMode)).toEqual([
      'Opaque',
      'Alpha',
      'PremultipliedAlpha',
      'Additive',
      'Multiply',
      'Screen',
    ]);
    expect(BlendMode.Opaque).toBe(0);
    expect(BlendMode.Screen).toBe(5);
  });

  it('CompareFunc は 0 から 7 まで連番 (docs/06 §5)', () => {
    expect(CompareFunc.Never).toBe(0);
    expect(CompareFunc.LessEqual).toBe(2);
    expect(CompareFunc.GreaterEqual).toBe(4);
    expect(CompareFunc.Always).toBe(7);
    expect(Object.keys(CompareFunc)).toHaveLength(8);
  });

  it('FilterMode と AddressMode は docs/06 §5 の並び順', () => {
    expect(FilterMode).toEqual({ Nearest: 0, Linear: 1 });
    expect(AddressMode).toEqual({ ClampToEdge: 0, Repeat: 1, MirrorRepeat: 2 });
  });

  it('ShaderStage は 3 ビット (docs/06 §5)', () => {
    expect(ShaderStage).toEqual({ Vertex: 1, Fragment: 2, Compute: 4 });
  });

  it('BindingType は 0 から 5 まで連番 (docs/06 §5)', () => {
    expect(BindingType.UniformBuffer).toBe(0);
    expect(BindingType.StorageBufferRead).toBe(1);
    expect(BindingType.StorageBufferReadWrite).toBe(2);
    expect(BindingType.Texture).toBe(3);
    expect(BindingType.Sampler).toBe(4);
    expect(BindingType.StorageTexture).toBe(5);
  });

  it('CullMode と LoadAction は docs/06 §5 の並び順', () => {
    expect(CullMode).toEqual({ None: 0, Front: 1, Back: 2 });
    expect(LoadAction).toEqual({ Clear: 0, Load: 1 });
  });

  it('ColorWrite は 4 ビット (D-21)', () => {
    expect(ColorWrite).toEqual({ Red: 1, Green: 2, Blue: 4, Alpha: 8 });
  });

  it('ビットフラグ定数は 1 ビットずつで、同じ表の中でビットを共有しない', () => {
    const namespaces: readonly (readonly [string, number[]])[] = [
      ['BufferUsage', Object.values(BufferUsage)],
      ['TextureUsage', Object.values(TextureUsage)],
      ['ColorWrite', Object.values(ColorWrite)],
      ['ShaderStage', Object.values(ShaderStage)],
    ];
    for (const [name, values] of namespaces) {
      for (const value of values) expect(value & (value - 1), name).toBe(0);
      const union = values.reduce((acc, v) => acc | v, 0);
      let bits = 0;
      for (let rest = union; rest !== 0; rest &= rest - 1) bits += 1;
      expect(bits, name).toBe(values.length);
    }
  });
});
