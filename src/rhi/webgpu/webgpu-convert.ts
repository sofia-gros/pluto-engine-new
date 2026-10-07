/**
 * @file RHI 定数から WebGPU 定数への変換表 (docs/06-rhi.md §5、`docs/02` §12)。
 * 値の並びは `src/rhi/types.ts` を前提にする。表はモジュール読み込み時に 1 回だけ
 * 作られ、毎フレームの呼び出しは無い。
 */
import type { RhiCapabilities } from '../capabilities';
import {
  AddressMode,
  BindingType,
  ColorWrite,
  CullMode,
  FilterMode,
  LoadAction,
  ShaderStage,
  TextureDimension,
  TextureFormat,
} from '../types';

/**
 * `GPUBufferUsage` の値 (WebGPU 仕様で固定)。ブラウザのグローバルを使わず数値を持つ。
 * Node での単体検証でも読み込めるようにする。
 */
const GPU_BUFFER_USAGE = {
  UNIFORM: 0x0040,
  STORAGE: 0x0080,
  INDIRECT: 0x0100,
  COPY_SRC: 0x0004,
  COPY_DST: 0x0008,
  MAP_READ: 0x0001,
} as const;

/**
 * `GPUTextureUsage` の値 (WebGPU 仕様で固定)。
 */
const GPU_TEXTURE_USAGE = {
  COPY_SRC: 0x01,
  COPY_DST: 0x02,
  TEXTURE_BINDING: 0x04,
  RENDER_ATTACHMENT: 0x10,
  STORAGE_BINDING: 0x08,
} as const;

/**
 * `GPUColorWrite` の値 (WebGPU 仕様で固定)。
 */
const GPU_COLOR_WRITE = { RED: 0x1, GREEN: 0x2, BLUE: 0x4, ALPHA: 0x8 } as const;

/**
 * `GPUShaderStage` の値 (WebGPU 仕様で固定)。
 */
const GPU_SHADER_STAGE = { VERTEX: 0x1, FRAGMENT: 0x2, COMPUTE: 0x4 } as const;

/** `BufferUsage` の各ビットを `GPUBufferUsage` へ変換する表。 */
const BUFFER_USAGE: readonly GPUBufferUsageFlags[] = [
  GPU_BUFFER_USAGE.UNIFORM,
  GPU_BUFFER_USAGE.STORAGE,
  GPU_BUFFER_USAGE.INDIRECT,
  GPU_BUFFER_USAGE.COPY_SRC,
  GPU_BUFFER_USAGE.COPY_DST,
  GPU_BUFFER_USAGE.MAP_READ,
];

/** `TextureUsage` の各ビットを `GPUTextureUsage` へ変換する表。 */
const TEXTURE_USAGE: readonly GPUTextureUsageFlags[] = [
  GPU_TEXTURE_USAGE.COPY_SRC,
  GPU_TEXTURE_USAGE.COPY_DST,
  GPU_TEXTURE_USAGE.TEXTURE_BINDING,
  GPU_TEXTURE_USAGE.RENDER_ATTACHMENT,
  GPU_TEXTURE_USAGE.STORAGE_BINDING,
];

/** `TextureFormat` を `GPUTextureFormat` へ変換する表。 */
const TEXTURE_FORMAT: readonly GPUTextureFormat[] = [
  'rgba8unorm',
  'bgra8unorm',
  'rgba16float',
  'rgba32float',
  'r32float',
  'r32uint',
  'rg32float',
  'rgba32uint',
  'depth24plus',
  'depth32float',
  'bc7-rgba-unorm',
  'etc2-rgba8unorm',
  'astc-4x4-unorm',
];

/** `CompareFunc` を `GPUCompareFunction` へ変換する表。 */
const COMPARE_FUNC: readonly GPUCompareFunction[] = [
  'never',
  'less',
  'less-equal',
  'greater',
  'greater-equal',
  'equal',
  'not-equal',
  'always',
];

/**
 * `BlendMode` ごとのブレンド係数。WebGL2 の固定機能と同じ合成結果になる組み合わせを
 * WebGPU の `GPUBlendFactor` で表したもの。`Multiply` は `dst * src`、`Screen` は
 * `src * (1 - dst) + dst`。
 */
const BLEND: readonly GPUBlendState[] = [
  {
    color: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'zero', operation: 'add' },
  },
  {
    color: { srcFactor: 'src-alpha', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  },
  {
    color: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  },
  {
    color: { srcFactor: 'src-alpha', dstFactor: 'one', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
  },
  {
    color: { srcFactor: 'dst', dstFactor: 'zero', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  },
  {
    color: { srcFactor: 'one-minus-dst', dstFactor: 'one', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one-minus-src-alpha', operation: 'add' },
  },
];

/**
 * `BufferUsage` のビットフラグを `GPUBufferUsageFlags` に変換する。
 * @param usage RHI の用途ビット
 * @returns WebGPU の用途ビット
 */
export function toBufferUsage(usage: number): GPUBufferUsageFlags {
  let out = 0;
  for (let i = 0; i < BUFFER_USAGE.length; i++) {
    if ((usage & (1 << i)) !== 0) out |= BUFFER_USAGE[i];
  }
  return out;
}

/**
 * `TextureUsage` のビットフラグを `GPUTextureUsageFlags` に変換する。
 * @param usage RHI の用途ビット
 * @returns WebGPU の用途ビット
 */
export function toTextureUsage(usage: number): GPUTextureUsageFlags {
  let out = 0;
  for (let i = 0; i < TEXTURE_USAGE.length; i++) {
    if ((usage & (1 << i)) !== 0) out |= TEXTURE_USAGE[i];
  }
  return out;
}

/**
 * `TextureFormat` を `GPUTextureFormat` に変換する。
 * @param format RHI の書式
 * @returns WebGPU の書式
 */
export function toTextureFormat(format: number): GPUTextureFormat {
  return TEXTURE_FORMAT[format];
}

/**
 * `TextureDimension` を `GPUTextureViewDimension` に変換する。
 * テクスチャ自体は常に 2d なので、次元はビュー側で区別する。
 * @param dimension RHI の次元
 * @returns WebGPU のビュー次元
 */
export function toTextureViewDimension(dimension: number): GPUTextureViewDimension {
  return dimension === TextureDimension.D2Array ? '2d-array' : '2d';
}

/**
 * `ShaderStage` のビットフラグを `GPUShaderStageFlags` に変換する。
 * @param stage RHI のステージビット
 * @returns WebGPU のステージビット
 */
export function toShaderStage(stage: number): GPUShaderStageFlags {
  let out = 0;
  if ((stage & ShaderStage.Vertex) !== 0) out |= GPU_SHADER_STAGE.VERTEX;
  if ((stage & ShaderStage.Fragment) !== 0) out |= GPU_SHADER_STAGE.FRAGMENT;
  if ((stage & ShaderStage.Compute) !== 0) out |= GPU_SHADER_STAGE.COMPUTE;
  return out;
}

/**
 * `FilterMode` を `GPUFilterMode` に変換する。
 * @param filter RHI の補間
 * @returns WebGPU の補間
 */
export function toFilterMode(filter: number): GPUFilterMode {
  return filter === FilterMode.Linear ? 'linear' : 'nearest';
}

/**
 * `AddressMode` を `GPUAddressMode` に変換する。
 * @param mode RHI の addressing
 * @returns WebGPU の addressing
 */
export function toAddressMode(mode: number): GPUAddressMode {
  if (mode === AddressMode.Repeat) return 'repeat';
  if (mode === AddressMode.MirrorRepeat) return 'mirror-repeat';
  return 'clamp-to-edge';
}

/**
 * `CompareFunc` を `GPUCompareFunction` に変換する。
 * @param func RHI の比較関数
 * @returns WebGPU の比較関数
 */
export function toCompareFunc(func: number): GPUCompareFunction {
  return COMPARE_FUNC[func];
}

/**
 * `CullMode` を `GPUCullMode` に変換する。
 * @param mode RHI のカリング
 * @returns WebGPU のカリング
 */
export function toCullMode(mode: number): GPUCullMode {
  if (mode === CullMode.Front) return 'front';
  if (mode === CullMode.Back) return 'back';
  return 'none';
}

/**
 * `LoadAction` を `GPULoadOp` に変換する。
 * @param load RHI の読み込み動作
 * @returns WebGPU の読み込み動作
 */
export function toLoadOp(load: number): GPULoadOp {
  return load === LoadAction.Load ? 'load' : 'clear';
}

/**
 * `ColorWrite` のビットフラグを `GPUColorWriteFlags` に変換する。
 * @param mask RHI の書き込みチャンネルビット
 * @returns WebGPU の書き込みチャンネルビット
 */
export function toColorWrite(mask: number): GPUColorWriteFlags {
  let out = 0;
  if ((mask & ColorWrite.Red) !== 0) out |= GPU_COLOR_WRITE.RED;
  if ((mask & ColorWrite.Green) !== 0) out |= GPU_COLOR_WRITE.GREEN;
  if ((mask & ColorWrite.Blue) !== 0) out |= GPU_COLOR_WRITE.BLUE;
  if ((mask & ColorWrite.Alpha) !== 0) out |= GPU_COLOR_WRITE.ALPHA;
  return out;
}

/**
 * `BlendMode` を `GPUBlendState` に変換する。
 * @param mode RHI のブレンド
 * @returns WebGPU のブレンド状態
 */
export function toBlendState(mode: number): GPUBlendState {
  return BLEND[mode];
}

/**
 * `BindingType` がバッファを要求する種類かどうか。
 * @param type RHI のバインディング種類
 * @returns バッファなら true
 */
export function isBufferBinding(type: number): boolean {
  return (
    type === BindingType.UniformBuffer ||
    type === BindingType.StorageBufferRead ||
    type === BindingType.StorageBufferReadWrite
  );
}

/**
 * `BindingType` がテクスチャを要求する種類かどうか。
 * @param type RHI のバインディング種類
 * @returns テクスチャなら true
 */
export function isTextureBinding(type: number): boolean {
  return type === BindingType.Texture || type === BindingType.StorageTexture;
}

/**
 * `BindingType` を `GPUBufferBindingType` に変換する。
 * @param type RHI のバインディング種類
 * @returns WebGPU のバッファバインドタイプ
 */
export function toBufferBindingType(type: number): GPUBufferBindingType {
  if (type === BindingType.UniformBuffer) return 'uniform';
  if (type === BindingType.StorageBufferReadWrite) return 'storage';
  return 'read-only-storage';
}

/**
 * `TextureFormat` を `GPUTextureSampleType` に変換する。
 * 32 ビットの浮動小数点は線形補間できないので `unfilterable-float` にする。
 * @param format RHI の書式
 * @returns WebGPU のサンプル型
 */
export function toTextureSampleType(format: number): GPUTextureSampleType {
  if (format === TextureFormat.RGBA32Float || format === TextureFormat.R32Float) {
    return 'unfilterable-float';
  }
  if (format === TextureFormat.R32Uint || format === TextureFormat.RGBA32Uint) return 'uint';
  if (format === TextureFormat.Depth24Plus || format === TextureFormat.Depth32Float) return 'depth';
  return 'float';
}

/**
 * `BindingType` を `GPUStorageTextureAccess` に変換する。
 * @param type RHI のバインディング種類
 * @returns WebGPU のストレージテクスチャアクセス
 */
export function toStorageTextureAccess(type: number): GPUStorageTextureAccess {
  if (type === BindingType.StorageTexture) return 'write-only';
  return 'read-only';
}

/**
 * サンプラの `FilterMode` を `GPUSamplerBindingType` に変換する。
 * 比較サンプラは使わないので `comparison` は出さない。
 * @param filter RHI の補間
 * @returns WebGPU のサンプラバインドタイプ
 */
export function toSamplerBindingType(filter: number): GPUSamplerBindingType {
  return filter === FilterMode.Linear ? 'filtering' : 'non-filtering';
}

/**
 * `TextureFormat` が 4x4 ブロックの圧縮書式かどうか。
 * @param format RHI の書式
 * @returns 圧縮書式なら true
 */
export function isCompressedFormat(format: number): boolean {
  return format >= TextureFormat.BC7RGBAUnorm;
}

/**
 * 圧縮書式の 1 ブロックが辺に占める texel 数。
 * @param format RHI の書式
 * @returns 圧縮書式は 4、それ以外は 1
 */
export function blockSide(format: number): number {
  return isCompressedFormat(format) ? 4 : 1;
}

/**
 * 1 ブロックが占めるバイト数。
 * @param format RHI の書式
 * @returns バイト数
 */
export function blockBytes(format: number): number {
  if (format === TextureFormat.BC7RGBAUnorm) return 16;
  if (format === TextureFormat.ETC2RGBA8Unorm) return 8;
  if (format === TextureFormat.ASTC4x4Unorm) return 16;
  return 4;
}

/**
 * デバイスから `RhiCapabilities` を作り出す。
 * rgba16float は仕様で保証されるが rgba32float のレンダーターゲットと
 * 32 ビット浮動小数点のブレンドには `float32-blendable` が必要。
 * @param device WebGPU のデバイス
 * @returns RHI の能力
 */
export function buildCapabilities(device: GPUDevice): RhiCapabilities {
  const f = device.features;
  const l = device.limits;
  const hasFloat32 = f.has('float32-blendable');
  return {
    backend: 'webgpu',
    compute: true,
    indirectDraw: f.has('indirect-first-instance'),
    storageBuffers: true,
    timestampQuery: f.has('timestamp-query'),
    floatRenderTarget: hasFloat32,
    floatBlend: hasFloat32,
    maxTextureSize: l.maxTextureDimension2D,
    maxTextureArrayLayers: l.maxTextureArrayLayers,
    maxStorageBufferBytes: l.maxStorageBufferBindingSize,
    maxComputeWorkgroupSize: l.maxComputeWorkgroupSizeX,
    maxComputeInvocationsPerWorkgroup: l.maxComputeInvocationsPerWorkgroup,
    minUniformBufferOffsetAlignment: l.minUniformBufferOffsetAlignment,
    minStorageBufferOffsetAlignment: l.minStorageBufferOffsetAlignment,
    textureCompressionBC7: f.has('texture-compression-bc'),
    textureCompressionETC2: f.has('texture-compression-etc2'),
    textureCompressionASTC: f.has('texture-compression-astc'),
  };
}
