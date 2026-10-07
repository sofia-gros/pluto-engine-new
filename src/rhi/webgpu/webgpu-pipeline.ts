/**
 * @file WebGPU 版のパイプライン (docs/06-rhi.md §4・§4.1・§6・§9、`docs/02` §12)。
 * シェーダモジュールの生成と render / compute パイプラインのラッパーを置く。
 * 頂点バッファは持たない (docs/06 §4 の頂点バッファの注記どおり vertex pulling)。
 */
import { ErrorCode, PlutoError } from '../../core/debug';
import type { RhiComputePipeline, RhiRenderPipeline } from '../device';
import type { ShaderSource } from '../shader-source';
import {
  BlendMode,
  ColorWrite,
  CullMode,
  type ComputePipelineDesc,
  type RenderPipelineDesc,
} from '../types';
import {
  toBlendState,
  toColorWrite,
  toCompareFunc,
  toCullMode,
  toTextureFormat,
} from './webgpu-convert';

/** 頂点シェーダのエントリポイント名 (docs/06 §6 で固定)。 */
const VERTEX_ENTRY = 'vs_main';

/** フラグメントシェーダのエントリポイント名 (docs/06 §6 で固定)。 */
const FRAGMENT_ENTRY = 'fs_main';

/** コンピュートシェーダのエントリポイント名 (docs/06 §6 で固定)。 */
const COMPUTE_ENTRY = 'cs_main';

/** WebGPU 版のレンダーパイプライン。 */
export class WebGpuRenderPipeline implements RhiRenderPipeline {
  /** 生成時のラベル。省略時は空文字列。 */
  public readonly label: string;

  private readonly handle: GPURenderPipeline;

  private destroyed = false;

  /**
   * パイプラインのラッパーを作る。生成は `WebGpuDevice.createRenderPipeline` からだけ呼ぶ。
   * @param handle WebGPU のパイプライン
   * @param label 生成時のラベル
   */
  public constructor(handle: GPURenderPipeline, label: string) {
    this.handle = handle;
    this.label = label;
  }

  /**
   * WebGPU のパイプラインを取り出す。`src/rhi/webgpu/` 内部専用。
   * @returns `GPURenderPipeline`
   */
  public get gpu(): GPURenderPipeline {
    if (this.destroyed) {
      throw new PlutoError(
        ErrorCode.InvalidState,
        `破棄済みのパイプライン ${this.label} を使いました`,
      );
    }
    return this.handle;
  }

  /**
   * パイプラインを破棄する。2 回呼んでも安全。WebGPU のパイプラインに破棄操作は無い。
   */
  public destroy(): void {
    this.destroyed = true;
  }
}

/** WebGPU 版のコンピュートパイプライン。 */
export class WebGpuComputePipeline implements RhiComputePipeline {
  /** 生成時のラベル。省略時は空文字列。 */
  public readonly label: string;

  /** 生成時のワークグループ size。 */
  public readonly workgroupSize: readonly [number, number, number];

  private readonly handle: GPUComputePipeline;

  private destroyed = false;

  /**
   * パイプラインのラッパーを作る。生成は `WebGpuDevice.createComputePipeline` からだけ呼ぶ。
   * @param handle WebGPU のパイプライン
   * @param label 生成時のラベル
   * @param workgroupSize 生成時のワークグループ size
   */
  public constructor(
    handle: GPUComputePipeline,
    label: string,
    workgroupSize: readonly [number, number, number],
  ) {
    this.handle = handle;
    this.label = label;
    this.workgroupSize = workgroupSize;
  }

  /**
   * WebGPU のパイプラインを取り出す。`src/rhi/webgpu/` 内部専用。
   * @returns `GPUComputePipeline`
   */
  public get gpu(): GPUComputePipeline {
    if (this.destroyed) {
      throw new PlutoError(
        ErrorCode.InvalidState,
        `破棄済みのパイプライン ${this.label} を使いました`,
      );
    }
    return this.handle;
  }

  /**
   * パイプラインを破棄する。2 回呼んでも安全。WebGPU のパイプラインに破棄操作は無い。
   */
  public destroy(): void {
    this.destroyed = true;
  }
}

/**
 * `ShaderSource` から WGSL を取り出す。WGSL が無ければ例外を投げる。
 * @param source シェーダソース
 * @param role 役割の説明 (エラーメッセージ用)
 * @returns WGSL の文字列
 */
export function requireWgsl(source: ShaderSource, role: string): string {
  const wgsl = source.wgsl;
  if (wgsl === undefined || wgsl === '') {
    throw new PlutoError(
      ErrorCode.UnsupportedFeature,
      `シェーダ ${source.name} に WGSL がありません (${role} 用)。この実装は WGSL しか受け付けません`,
    );
  }
  return wgsl;
}

/**
 * カラー描画先 1 個を `GPUColorTargetState` に変換する。
 * @param target RHI の描画先
 * @returns WebGPU の描画先
 */
function convertColorTarget(
  target: RenderPipelineDesc['colorTargets'][number],
): GPUColorTargetState {
  const blend = target.blend ?? BlendMode.Opaque;
  const writeMask = target.writeMask;
  if (blend === BlendMode.Opaque && writeMask === undefined) {
    return { format: toTextureFormat(target.format) };
  }
  return {
    format: toTextureFormat(target.format),
    blend: toBlendState(blend),
    writeMask:
      writeMask === undefined
        ? toColorWrite(ColorWrite.Red | ColorWrite.Green | ColorWrite.Blue | ColorWrite.Alpha)
        : toColorWrite(writeMask),
  };
}

/**
 * レンダーパイプラインの記述子を組み立てる。
 * @param desc RHI の記述子
 * @param layout WebGPU のパイプラインレイアウト
 * @param device シェーダモジュールを作るデバイス
 * @returns WebGPU の記述子
 */
export function buildRenderDescriptor(
  desc: RenderPipelineDesc,
  layout: GPUPipelineLayout,
  device: GPUDevice,
): GPURenderPipelineDescriptor {
  const vertexModule = device.createShaderModule({
    label: `${desc.vertexShader.name}:vs`,
    code: requireWgsl(desc.vertexShader, '頂点'),
  });
  const fragmentModule = device.createShaderModule({
    label: `${desc.fragmentShader.name}:fs`,
    code: requireWgsl(desc.fragmentShader, 'フラグメント'),
  });
  const depth = desc.depthStencil;
  const descriptor: GPURenderPipelineDescriptor = {
    label: desc.vertexShader.name,
    layout,
    vertex: { module: vertexModule, entryPoint: VERTEX_ENTRY },
    primitive: {
      topology: 'triangle-list',
      cullMode: toCullMode(desc.cullMode ?? CullMode.None),
      frontFace: 'ccw',
    },
    fragment: {
      module: fragmentModule,
      entryPoint: FRAGMENT_ENTRY,
      targets: desc.colorTargets.map(convertColorTarget),
    },
  };
  if (depth !== undefined) {
    descriptor.depthStencil = {
      format: toTextureFormat(depth.format),
      depthWriteEnabled: depth.writeEnabled,
      depthCompare: toCompareFunc(depth.compare),
    };
  }
  return descriptor;
}

/**
 * コンピュートパイプラインの記述子を組み立てる。
 * @param desc RHI の記述子
 * @param layout WebGPU のパイプラインレイアウト
 * @param device シェーダモジュールを作るデバイス
 * @returns WebGPU の記述子
 */
export function buildComputeDescriptor(
  desc: ComputePipelineDesc,
  layout: GPUPipelineLayout,
  device: GPUDevice,
): GPUComputePipelineDescriptor {
  const module = device.createShaderModule({
    label: desc.computeShader.name,
    code: requireWgsl(desc.computeShader, 'コンピュート'),
  });
  return { label: desc.computeShader.name, layout, compute: { module, entryPoint: COMPUTE_ENTRY } };
}
