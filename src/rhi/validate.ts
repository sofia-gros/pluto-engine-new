/**
 * @file `docs/06` §5.1.1 の検証規則を両バックエンド共通で実装する。
 * `create*` の直前に呼ぶ。違反は `PlutoError` を投げる。バックエンド別の検査は
 * ここでは行わない (上限値は `RhiCapabilities` から渡してもらう)。
 */
import { ErrorCode, PlutoError } from '../core/debug';
import type { RhiCapabilities } from './capabilities';
import type { RhiBindGroupLayout, RhiTexture } from './device';
import {
  BindingType,
  BlendMode,
  BufferUsage,
  LoadAction,
  TextureDimension,
  TextureFormat,
  TextureUsage,
  type BindGroupDesc,
  type BindGroupEntryDesc,
  type BindGroupLayoutDesc,
  type BufferDesc,
  type ComputePipelineDesc,
  type RenderPipelineDesc,
  type RenderPassDesc,
  type SamplerDesc,
  type TextureDesc,
  type TextureWriteDesc,
} from './types';

/** 圧縮フォーマット (docs/06 §5 の 10〜12)。レンダーターゲット・ストレージ不可。 */
const COMPRESSED_FORMATS: readonly number[] = [
  TextureFormat.BC7RGBAUnorm,
  TextureFormat.ETC2RGBA8Unorm,
  TextureFormat.ASTC4x4Unorm,
];

/** 深度として使える書式。 */
const DEPTH_FORMATS: readonly number[] = [TextureFormat.Depth24Plus, TextureFormat.Depth32Float];

/** 浮動小数点のレンダータージ於定。 */
const FLOAT_FORMATS: readonly number[] = [
  TextureFormat.RGBA16Float,
  TextureFormat.RGBA32Float,
  TextureFormat.R32Float,
  TextureFormat.RG32Float,
];

/** バインドグループレイアウトの最大数 (docs/06 §5.1.1)。 */
const MAX_BIND_GROUP_LAYOUTS = 4;

/** カラー描写先の最大数 (docs/06 §5.1.1)。 */
const MAX_COLOR_TARGETS = 2;

/**
 * 引数が不正だったときの例外を送出する。
 * @param message 日本語の理由
 */
function invalid(message: string): never {
  throw new PlutoError(ErrorCode.InvalidArgument, message);
}

/**
 * デバイスが対応していないときの例外を送出する。
 * @param message 日本語の理由と代替案
 */
function unsupported(message: string): never {
  throw new PlutoError(ErrorCode.UnsupportedFeature, message);
}

/**
 * 圧縮フォーマットをこのデバイスが扱えるか。
 * @param format 判定する書式
 * @param caps デバイスの能力
 * @returns 扱えるなら true
 */
function compressedSupported(format: number, caps: RhiCapabilities): boolean {
  if (format === TextureFormat.BC7RGBAUnorm) return caps.textureCompressionBC7;
  if (format === TextureFormat.ETC2RGBA8Unorm) return caps.textureCompressionETC2;
  if (format === TextureFormat.ASTC4x4Unorm) return caps.textureCompressionASTC;
  return true;
}

/**
 * `BufferDesc` を検証する (docs/06 §5.1.1 の 3 行)。
 * @param desc 検証する記述子
 */
export function validateBufferDesc(desc: BufferDesc): void {
  if (!Number.isFinite(desc.sizeBytes) || desc.sizeBytes < 1) {
    invalid(`BufferDesc.sizeBytes は 1 以上ですが ${String(desc.sizeBytes)} でした`);
  }
  if (desc.usage === 0) invalid('BufferDesc.usage は 0 にできません');
  const mapRead = desc.usage & BufferUsage.MapRead;
  if (mapRead !== 0 && (desc.usage & ~BufferUsage.MapRead & ~BufferUsage.CopyDst) !== 0) {
    invalid('BufferUsage.MapRead は CopyDst 以外のビットと併用できません');
  }
}

/**
 * `TextureDesc` を検証する (docs/06 §5.1.1 のテクスチャ関連 7 行)。
 * @param desc 検証する記述子
 * @param caps デバイスの能力
 */
export function validateTextureDesc(desc: TextureDesc, caps: RhiCapabilities): void {
  if (
    !Number.isFinite(desc.width) ||
    desc.width < 1 ||
    !Number.isFinite(desc.height) ||
    desc.height < 1
  ) {
    invalid(
      `TextureDesc の幅と高さは 1 以上ですが ${String(desc.width)}x${String(desc.height)} でした`,
    );
  }
  if (desc.usage === 0) invalid('TextureDesc.usage は 0 にできません');
  const dimension = desc.dimension ?? TextureDimension.D2;
  if (dimension === TextureDimension.D2 && desc.layers !== 1) {
    invalid(`TextureDimension.D2 では layers は 1 ですが ${String(desc.layers)} でした`);
  }
  if (!Number.isFinite(desc.layers) || desc.layers < 1) {
    invalid(`TextureDesc.layers は 1 以上ですが ${String(desc.layers)} でした`);
  }
  if (desc.width > caps.maxTextureSize || desc.height > caps.maxTextureSize) {
    invalid(
      `このデバイスのテクスチャ上限は ${String(caps.maxTextureSize)} px ですが ${String(desc.width)}x${String(desc.height)} を要求しました`,
    );
  }
  if (desc.layers > caps.maxTextureArrayLayers) {
    invalid(
      `このデバイスのテクスチャ配列上限は ${String(caps.maxTextureArrayLayers)} 層ですが ${String(desc.layers)} 層を要求しました`,
    );
  }
  validateTextureFormat(desc.format, desc.usage, caps);
}

/**
 * テクスチャの書式と用途の組み合わせを検証する。
 * @param format 書式
 * @param usage 用途のビットフラグ
 * @param caps デバイスの能力
 */
export function validateTextureFormat(format: number, usage: number, caps: RhiCapabilities): void {
  if (COMPRESSED_FORMATS.includes(format)) {
    if (usage & (TextureUsage.RenderAttachment | TextureUsage.StorageBinding)) {
      invalid('圧縮テクスチャはレンダーターゲットにもストレージにも使えません (docs/06 §5)');
    }
    if (!compressedSupported(format, caps)) {
      unsupported(
        'このデバイスは要求された圧縮テクスチャ書式に対応していません。RGBA8Unorm を使ってください',
      );
    }
  }
  if (format === TextureFormat.RGBA16Float && !caps.floatRenderTarget) {
    unsupported(
      'このデバイスは RGBA16Float のレンダーターゲットに対応していません。RGBA8Unorm を使ってください',
    );
  }
}

/**
 * `SamplerDesc` を検証する。ミップマップが無いので検査は無いが、入口として用意する。
 * @param desc 検証する記述子
 */
export function validateSamplerDesc(desc: SamplerDesc): void {
  if (desc.filter !== undefined && (desc.filter < 0 || desc.filter > 1)) {
    invalid(`SamplerDesc.filter は 0 または 1 ですが ${String(desc.filter)} でした`);
  }
}

/**
 * `BindGroupLayoutDesc` を検証する。
 * @param desc 検証する記述子
 */
export function validateBindGroupLayoutDesc(desc: BindGroupLayoutDesc): void {
  for (const [i, e] of desc.entries.entries()) {
    if (e.stage === 0) invalid(`BindGroupLayoutDesc.entries[${String(i)}].stage は 0 にできません`);
  }
}

/**
 * `BindGroupDesc` を検証する (docs/06 §5.1.1 のバインドグループ関連 4 行)。
 * @param desc 検証する記述子
 * @param layout 対応するレイアウト
 * @param caps デバイスの能力
 */
export function validateBindGroupDesc(
  desc: BindGroupDesc,
  layout: RhiBindGroupLayout,
  caps: RhiCapabilities,
): void {
  if (desc.entries.length !== layout.entries.length) {
    invalid(
      `BindGroupDesc.entries は ${String(layout.entries.length)} 個ですが ${String(desc.entries.length)} 個でした`,
    );
  }
  for (const [i, entry] of desc.entries.entries()) {
    const expect = layout.entries[i];
    if (expect.type !== entry.type) {
      invalid(`BindGroupDesc.entries[${String(i)}].type がレイアウトと一致しません`);
    }
    validateBindGroupEntry(entry, i, caps);
  }
}

/**
 * バインドグループ 1 エントリを検証する。
 * @param entry 検証するエントリ
 * @param index エラーの文字引に使う順引
 * @param caps デバイスの能力
 */
function validateBindGroupEntry(
  entry: BindGroupEntryDesc,
  index: number,
  caps: RhiCapabilities,
): void {
  const at = `BindGroupDesc.entries[${String(index)}]`;
  const isBuffer =
    entry.type === BindingType.UniformBuffer ||
    entry.type === BindingType.StorageBufferRead ||
    entry.type === BindingType.StorageBufferReadWrite;
  const isTexture = entry.type === BindingType.Texture || entry.type === BindingType.StorageTexture;
  if (isBuffer && entry.buffer === undefined) invalid(`${at}.buffer がありません`);
  if (isTexture && entry.texture === undefined) invalid(`${at}.texture がありません`);
  if (entry.type === BindingType.Sampler && entry.sampler === undefined)
    invalid(`${at}.sampler がありません`);
  const offset = entry.offsetBytes ?? 0;
  if (offset !== 0) {
    const align =
      entry.type === BindingType.UniformBuffer
        ? caps.minUniformBufferOffsetAlignment
        : caps.minStorageBufferOffsetAlignment;
    if (offset % align !== 0)
      invalid(`${at}.offsetBytes は ${String(align)} の倍数である必要があります`);
  }
}

/**
 * `RenderPipelineDesc` を検証する。
 * @param desc 検証する記述子
 * @param caps デバイスの能力
 */
export function validateRenderPipelineDesc(desc: RenderPipelineDesc, caps: RhiCapabilities): void {
  if (desc.layouts.length > MAX_BIND_GROUP_LAYOUTS) {
    invalid(
      `layouts は ${String(MAX_BIND_GROUP_LAYOUTS)} 個までですが ${String(desc.layouts.length)} 個でした`,
    );
  }
  if (desc.colorTargets.length < 1 || desc.colorTargets.length > MAX_COLOR_TARGETS) {
    invalid(
      `colorTargets は 1 から ${String(MAX_COLOR_TARGETS)} 個までですが ${String(desc.colorTargets.length)} 個でした`,
    );
  }
  for (const [i, target] of desc.colorTargets.entries()) {
    if (FLOAT_FORMATS.includes(target.format)) {
      if (!caps.floatRenderTarget) {
        unsupported(
          `colorTargets[${String(i)}] が浮動小数点ですが、このデバイスは対応していません`,
        );
      }
      if ((target.blend ?? BlendMode.Opaque) !== BlendMode.Opaque && !caps.floatBlend) {
        unsupported(
          `colorTargets[${String(i)}] をブレンドしますが、このデバイスは対応していません`,
        );
      }
    }
  }
  const depth = desc.depthStencil;
  if (depth !== undefined && !DEPTH_FORMATS.includes(depth.format)) {
    invalid(
      `depthStencil.format は Depth24Plus か Depth32Float ですが ${String(depth.format)} でした`,
    );
  }
}

/**
 * `ComputePipelineDesc` を検証する。
 * @param desc 検証する記述子
 * @param caps デバイスの能力
 */
export function validateComputePipelineDesc(
  desc: ComputePipelineDesc,
  caps: RhiCapabilities,
): void {
  if (!caps.compute) {
    unsupported('このデバイスは compute に対応していません。CPU 側の実装を使ってください');
  }
  if (desc.layouts.length > MAX_BIND_GROUP_LAYOUTS) {
    invalid(
      `layouts は ${String(MAX_BIND_GROUP_LAYOUTS)} 個までですが ${String(desc.layouts.length)} 個でした`,
    );
  }
  const [x, y, z] = desc.workgroupSize;
  if (x < 1 || y < 1 || z < 1) {
    invalid(`workgroupSize は各要素 1 以上ですが ${desc.workgroupSize.join('x')} でした`);
  }
  if (x * y * z > caps.maxComputeInvocationsPerWorkgroup) {
    invalid(
      `workgroupSize の積 ${String(x * y * z)} は上限 ${String(caps.maxComputeInvocationsPerWorkgroup)} を超えています`,
    );
  }
  if (
    x > caps.maxComputeWorkgroupSize ||
    y > caps.maxComputeWorkgroupSize ||
    z > caps.maxComputeWorkgroupSize
  ) {
    invalid(
      `workgroupSize の各要素は上限 ${String(caps.maxComputeWorkgroupSize)} 以下である必要があります`,
    );
  }
}

/**
 * `TextureWriteDesc` を検証する。
 * @param desc 検証する記述子
 * @param tex 書き込み先のテクスチャ
 */
export function validateTextureWriteDesc(desc: TextureWriteDesc, tex: RhiTexture): void {
  if (desc.width < 1 || desc.height < 1) {
    invalid(
      `TextureWriteDesc の幅と高さは 1 以上ですが ${String(desc.width)}x${String(desc.height)} でした`,
    );
  }
  if (desc.offsetX < 0 || desc.offsetY < 0 || desc.layer < 0) {
    invalid('TextureWriteDesc のオフセットと layer は 0 以上でなければなりません');
  }
  if (desc.offsetX + desc.width > tex.width || desc.offsetY + desc.height > tex.height) {
    invalid(
      `書き込み範囲 ${String(desc.offsetX + desc.width)}x${String(desc.offsetY + desc.height)} がテクスチャ ${String(tex.width)}x${String(tex.height)} を超えています`,
    );
  }
  if (desc.layer >= tex.layers) {
    invalid(
      `TextureWriteDesc.layer は ${String(tex.layers)} 未満ですが ${String(desc.layer)} でした`,
    );
  }
}

/**
 * `RenderPassDesc` を検証する。
 * @param desc 検証する記述子
 */
export function validateRenderPassDesc(desc: RenderPassDesc): void {
  if (desc.colorAttachments.length < 1 || desc.colorAttachments.length > MAX_COLOR_TARGETS) {
    invalid(
      `colorAttachments は 1 から ${String(MAX_COLOR_TARGETS)} 個までですが ${String(desc.colorAttachments.length)} 個でした`,
    );
  }
  for (const [i, a] of desc.colorAttachments.entries()) {
    if ((a.view.usage & TextureUsage.RenderAttachment) === 0) {
      invalid(`colorAttachments[${String(i)}].view に TextureUsage.RenderAttachment がありません`);
    }
    if (a.load === LoadAction.Clear && a.clearColor === undefined) {
      invalid(`colorAttachments[${String(i)}] は Clear なのに clearColor がありません`);
    }
  }
  const depth = desc.depthStencil;
  if (depth !== undefined) {
    if ((depth.view.usage & TextureUsage.RenderAttachment) === 0) {
      invalid('depthStencil.view に TextureUsage.RenderAttachment がありません');
    }
    if (depth.load === LoadAction.Clear && depth.clearDepth === undefined) {
      invalid('depthStencil は Clear なのに clearDepth がありません');
    }
  }
}
