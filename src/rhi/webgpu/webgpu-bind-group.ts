/**
 * @file WebGPU 版のバインドグループ (docs/06-rhi.md §4・§4.1・§5.1、`docs/02` §12)。
 * レイアウト・バインドグループのラッパーと、記述子から WebGPU の
 * エントリへの変換を置く。パイプラインレイアウトもここで作る。
 */
import { ErrorCode, PlutoError } from '../../core/debug';
import type { RhiBindGroup, RhiBindGroupLayout } from '../device';
import { BindingType, type BindGroupEntryDesc, type BindGroupLayoutEntryDesc } from '../types';
import { WebGpuBuffer } from './webgpu-buffer';
import { WebGpuSampler, WebGpuTexture } from './webgpu-texture';
import {
  isBufferBinding,
  isTextureBinding,
  toBufferBindingType,
  toShaderStage,
  toTextureSampleType,
} from './webgpu-convert';

/**
 * ストレージテクスチャの書式。`BindGroupLayoutEntryDesc` に書式の項目が無いため固定する。
 * `docs/08` の GPGPU は `RGBA32F` のレンダーターゲットを使うので、エンジン全体で
 * この 1 種類しか出現しない。
 */
const STORAGE_TEXTURE_FORMAT = 'rgba32float';

/** WebGPU 版のバインドグループレイアウト。 */
export class WebGpuBindGroupLayout implements RhiBindGroupLayout {
  /** 生成時のエントリ並び。 */
  public readonly entries: readonly BindGroupLayoutEntryDesc[];

  private readonly handle: GPUBindGroupLayout;

  private destroyed = false;

  /**
   * レイアウトのラッパーを作る。生成は `WebGpuDevice.createBindGroupLayout` からだけ呼ぶ。
   * @param handle WebGPU のレイアウト
   * @param entries 生成時のエントリ並び
   */
  public constructor(handle: GPUBindGroupLayout, entries: readonly BindGroupLayoutEntryDesc[]) {
    this.handle = handle;
    this.entries = entries;
  }

  /**
   * WebGPU のレイアウトを取り出す。`src/rhi/webgpu/` 内部専用。
   * @returns `GPUBindGroupLayout`
   */
  public get gpu(): GPUBindGroupLayout {
    if (this.destroyed) {
      throw new PlutoError(
        ErrorCode.InvalidState,
        '破棄済みのバインドグループレイアウトを使いました',
      );
    }
    return this.handle;
  }

  /**
   * レイアウトを破棄する。2 回呼んでも安全。
   */
  public destroy(): void {
    this.destroyed = true;
  }
}

/** WebGPU 版のバインドグループ。 */
export class WebGpuBindGroup implements RhiBindGroup {
  /** 生成時に使ったレイアウト。 */
  public readonly layout: RhiBindGroupLayout;

  private readonly handle: GPUBindGroup;

  private destroyed = false;

  /**
   * バインドグループのラッパーを作る。生成は `WebGpuDevice.createBindGroup` からだけ呼ぶ。
   * @param handle WebGPU のバインドグループ
   * @param layout 対応するレイアウト
   */
  public constructor(handle: GPUBindGroup, layout: RhiBindGroupLayout) {
    this.handle = handle;
    this.layout = layout;
  }

  /**
   * WebGPU のバインドグループを取り出す。`src/rhi/webgpu/` 内部専用。
   * @returns `GPUBindGroup`
   */
  public get gpu(): GPUBindGroup {
    if (this.destroyed) {
      throw new PlutoError(ErrorCode.InvalidState, '破棄済みのバインドグループを使いました');
    }
    return this.handle;
  }

  /**
   * バインドグループを破棄する。2 回呼んでも安全。
   */
  public destroy(): void {
    this.destroyed = true;
  }
}

/**
 * レイアウトのエントリ 1 個を `GPUBindGroupLayoutEntry` に変換する。
 * バインディング番号は添字順 (0 から) とする。
 * @param type `BindingType` の値
 * @param stage `ShaderStage` のビットフラグ
 * @param binding バインディング番号
 * @returns レイアウトのエントリ
 */
function convertLayoutEntry(type: number, stage: number, binding: number): GPUBindGroupLayoutEntry {
  const visibility = toShaderStage(stage);
  if (isBufferBinding(type)) {
    return { binding, visibility, buffer: { type: toBufferBindingType(type) } };
  }
  if (type === BindingType.StorageTexture) {
    return {
      binding,
      visibility,
      storageTexture: {
        access: 'write-only',
        format: STORAGE_TEXTURE_FORMAT,
        viewDimension: '2d',
      },
    };
  }
  if (isTextureBinding(type)) {
    return {
      binding,
      visibility,
      texture: { sampleType: toTextureSampleType(0) },
    };
  }
  return { binding, visibility, sampler: { type: 'filtering' } };
}

/**
 * レイアウトのエントリ配列を WebGPU の並びに変換する。
 * @param entries RHI のエントリ並び
 * @returns WebGPU のエントリ並び
 */
export function buildLayoutEntries(
  entries: readonly BindGroupLayoutEntryDesc[],
): GPUBindGroupLayoutEntry[] {
  const out: GPUBindGroupLayoutEntry[] = [];
  for (let i = 0; i < entries.length; i++) {
    const e = entries[i];
    out.push(convertLayoutEntry(e.type, e.stage, i));
  }
  return out;
}

/**
 * バインドグループのエントリ 1 個を `GPUBindGroupEntry` に変換する。
 * @param entry RHI のエントリ
 * @param binding バインディング番号
 * @returns WebGPU のエントリ
 */
function convertBindGroupEntry(entry: BindGroupEntryDesc, binding: number): GPUBindGroupEntry {
  if (isBufferBinding(entry.type) && entry.buffer instanceof WebGpuBuffer) {
    const size = entry.sizeBytes;
    const offset = entry.offsetBytes ?? 0;
    if (size === undefined) return { binding, resource: { buffer: entry.buffer.gpu } };
    return { binding, resource: { buffer: entry.buffer.gpu, offset, size } };
  }
  if (isTextureBinding(entry.type) && entry.texture instanceof WebGpuTexture) {
    return { binding, resource: entry.texture.gpuView };
  }
  if (entry.type === BindingType.Sampler && entry.sampler instanceof WebGpuSampler) {
    return { binding, resource: entry.sampler.gpu };
  }
  throw new PlutoError(
    ErrorCode.InvalidArgument,
    `バインドグループのエントリ ${String(binding)} に RHI の型でないリソースを指定しました`,
  );
}

/**
 * バインドグループのエントリ配列を WebGPU の並びに変換する。
 * @param entries RHI のエントリ並び
 * @returns WebGPU のエントリ並び
 */
export function buildBindGroupEntries(entries: readonly BindGroupEntryDesc[]): GPUBindGroupEntry[] {
  const out: GPUBindGroupEntry[] = [];
  for (let i = 0; i < entries.length; i++) out.push(convertBindGroupEntry(entries[i], i));
  return out;
}

/**
 * レイアウトの並びからパイプラインレイアウトを作る。
 * @param device 所有デバイス
 * @param layouts レイアウトの並び (長さ 0〜4)
 * @returns WebGPU のパイプラインレイアウト
 */
export function buildPipelineLayout(
  device: GPUDevice,
  layouts: readonly RhiBindGroupLayout[],
): GPUPipelineLayout {
  return device.createPipelineLayout({
    bindGroupLayouts: layouts.map((l): GPUBindGroupLayout => (l as WebGpuBindGroupLayout).gpu),
  });
}
