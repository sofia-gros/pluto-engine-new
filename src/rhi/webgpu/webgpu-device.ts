/**
 * @file WebGPU 版のデバイス (docs/06-rhi.md §2・§4・§8・§9、`docs/02` §12)。
 * `GPUDevice` を `RhiDevice` で包む。デバイス生成 (adapter と device の取得) は
 * `create-device.ts` の責務なので、ここでは既に用意された `GPUDevice` を受ける。
 */
import { ErrorCode, PlutoError, logger } from '../../core/debug';
import { EventEmitter } from '../../core/events';
import type { RhiCapabilities } from '../capabilities';
import type {
  RhiBindGroup,
  RhiBindGroupLayout,
  RhiBuffer,
  RhiCommandEncoder,
  RhiComputePipeline,
  RhiDevice,
  RhiQuerySet,
  RhiRenderPipeline,
  RhiSampler,
  RhiTexture,
} from '../device';
import {
  SWAPCHAIN_FORMAT,
  TextureDimension,
  TextureUsage,
  type BindGroupDesc,
  type BindGroupLayoutDesc,
  type BufferDesc,
  type ComputePipelineDesc,
  type RenderPipelineDesc,
  type SamplerDesc,
  type TextureDesc,
  type TextureWriteDesc,
} from '../types';
import {
  validateBindGroupDesc,
  validateBindGroupLayoutDesc,
  validateBufferDesc,
  validateComputePipelineDesc,
  validateRenderPipelineDesc,
  validateSamplerDesc,
  validateTextureDesc,
  validateTextureWriteDesc,
} from '../validate';
import { WebGpuBuffer } from './webgpu-buffer';
import {
  WebGpuBindGroup,
  WebGpuBindGroupLayout,
  buildBindGroupEntries,
  buildLayoutEntries,
  buildPipelineLayout,
} from './webgpu-bind-group';
import {
  toAddressMode,
  toBufferUsage,
  toFilterMode,
  toTextureFormat,
  toTextureUsage,
} from './webgpu-convert';
import { buildCapabilities } from './webgpu-convert';
import { WebGpuCommandEncoder } from './webgpu-encoder';
import {
  WebGpuComputePipeline,
  WebGpuRenderPipeline,
  buildComputeDescriptor,
  buildRenderDescriptor,
} from './webgpu-pipeline';
import { WebGpuSampler, WebGpuTexture, buildImageDataLayout } from './webgpu-texture';

/** スワップチェーンの用途。読み戻しもしたいので `CopySrc` を立てる。 */
const SWAPCHAIN_USAGE = TextureUsage.RenderAttachment | TextureUsage.CopySrc;

/** WebGPU 版のクエリセット。タイムスタンプ専用。 */
export class WebGpuQuerySet implements RhiQuerySet {
  /** 確保したクエリの個数。 */
  public readonly count: number;

  /** WebGPU のクエリセット。`caps.timestampQuery` が false のときは `null`。 */
  public readonly gpu: GPUQuerySet | null;

  /** 破棄済みなら true。 */
  private destroyed = false;

  /**
   * クエリセットのラッパーを作る。生成は `WebGpuDevice.createQuerySet` からだけ呼ぶ。
   * @param handle WebGPU のクエリセット (非対応なら `null`)
   * @param count クエリの個数
   */
  public constructor(handle: GPUQuerySet | null, count: number) {
    this.gpu = handle;
    this.count = count;
  }

  /** クエリセットを破棄する。2 回呼んでも安全。 */
  public destroy(): void {
    if (this.destroyed || this.gpu === null) return;
    this.destroyed = true;
    this.gpu.destroy();
  }
}

/** `WebGpuDevice` の生成に使う情報。 */
export interface WebGpuDeviceInit {
  /** 既に生成済みの WebGPU デバイス。 */
  readonly device: GPUDevice;
  /** キャンバスのコンテキスト。`configure` はここに行う。 */
  readonly context: GPUCanvasContext;
  /** スワップチェーンのサイズ変更の反映先。 */
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  /** 生成したリソースのラベル。省略時は `webgpu`。 */
  readonly label?: string;
}

/**
 * `ArrayBufferView` を WebGPU の転送 API が受け付ける型に絞る。
 * WebGPU は `SharedArrayBuffer` を受け付けるが、`@webgpu/types` の `BufferSource` は
 * `ArrayBufferView<ArrayBuffer>` と宣言されているので、まとめて扱う。
 * @param data RHI の記述子が受けたビュー
 * @returns WebGPU の転送 API が受け付ける値
 */
export function toTransferSource(data: ArrayBufferView): GPUAllowSharedBufferSource {
  if (data.buffer instanceof ArrayBuffer) {
    return new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
  }
  if (data.byteOffset === 0 && data.byteLength === data.buffer.byteLength) return data.buffer;
  throw new PlutoError(
    ErrorCode.InvalidArgument,
    'SharedArrayBuffer の途中からは転送できません。全体か ArrayBuffer を渡してください',
  );
}

/** WebGPU 版のデバイス。 */
export class WebGpuDevice implements RhiDevice {
  /** 能力。初期化時に 1 回だけ読む。 */
  public readonly caps: RhiCapabilities;

  /** デバイスの喪失を通知する。 */
  public readonly onDeviceLost = new EventEmitter<{ lost: { reason: string } }>();

  private readonly device: GPUDevice;

  private readonly context: GPUCanvasContext;

  private readonly canvas: HTMLCanvasElement | OffscreenCanvas;

  private readonly label: string;

  private readonly encoder: WebGpuCommandEncoder;

  private destroyed = false;

  /**
   * デバイスを包む。生成は `create-device.ts` からだけ呼ぶ。
   * @param init 初期化の情報
   */
  public constructor(init: WebGpuDeviceInit) {
    this.device = init.device;
    this.context = init.context;
    this.canvas = init.canvas;
    this.label = init.label ?? 'webgpu';
    this.caps = buildCapabilities(this.device);
    const dummy = this.device.createTexture({
      label: 'void',
      size: [1, 1, 1],
      format: 'rgba8unorm',
      usage: toTextureUsage(TextureUsage.TextureBinding | TextureUsage.RenderAttachment),
    });
    this.encoder = new WebGpuCommandEncoder(this.device, dummy.createView());
    this.configure();
    void this.device.lost.then((info): void => {
      this.onDeviceLost.emit('lost', { reason: info.reason });
    });
  }

  /** バッファを生成する。 */
  public createBuffer(desc: BufferDesc): RhiBuffer {
    validateBufferDesc(desc);
    const label = desc.label ?? '';
    const handle = this.device.createBuffer({
      label,
      size: desc.sizeBytes,
      usage: toBufferUsage(desc.usage),
    });
    return new WebGpuBuffer(handle, label, desc.sizeBytes, desc.usage);
  }

  /** テクスチャを生成する。 */
  public createTexture(desc: TextureDesc): RhiTexture {
    validateTextureDesc(desc, this.caps);
    const handle = this.device.createTexture({
      label: desc.label ?? '',
      size: [desc.width, desc.height, desc.layers],
      format: toTextureFormat(desc.format),
      usage: toTextureUsage(desc.usage),
      dimension: '2d',
    });
    return new WebGpuTexture(handle, { ...desc, label: desc.label ?? '' });
  }

  /** サンプラを生成する。 */
  public createSampler(desc: SamplerDesc): RhiSampler {
    validateSamplerDesc(desc);
    const filter = toFilterMode(desc.filter ?? 0);
    const handle = this.device.createSampler({
      magFilter: filter,
      minFilter: filter,
      mipmapFilter: 'nearest',
      addressModeU: toAddressMode(desc.addressModeU ?? 0),
      addressModeV: toAddressMode(desc.addressModeV ?? 0),
    });
    return new WebGpuSampler(handle);
  }

  /** バインドグループレイアウトを生成する。 */
  public createBindGroupLayout(desc: BindGroupLayoutDesc): RhiBindGroupLayout {
    validateBindGroupLayoutDesc(desc);
    const handle = this.device.createBindGroupLayout({
      label: this.label,
      entries: buildLayoutEntries(desc.entries),
    });
    return new WebGpuBindGroupLayout(handle, desc.entries);
  }

  /** バインドグループを生成する。 */
  public createBindGroup(desc: BindGroupDesc): RhiBindGroup {
    const layout = desc.layout as WebGpuBindGroupLayout;
    validateBindGroupDesc(desc, layout, this.caps);
    const handle = this.device.createBindGroup({
      label: this.label,
      layout: layout.gpu,
      entries: buildBindGroupEntries(desc.entries),
    });
    return new WebGpuBindGroup(handle, desc.layout);
  }

  /** レンダーパイプラインを生成する。 */
  public createRenderPipeline(desc: RenderPipelineDesc): RhiRenderPipeline {
    validateRenderPipelineDesc(desc, this.caps);
    const layout = buildPipelineLayout(this.device, desc.layouts);
    const handle = this.guardValidation(desc.vertexShader.name, (): GPURenderPipeline =>
      this.device.createRenderPipeline(buildRenderDescriptor(desc, layout, this.device)),
    );
    return new WebGpuRenderPipeline(handle, desc.vertexShader.name);
  }

  /** コンピュートパイプラインを生成する。 */
  public createComputePipeline(desc: ComputePipelineDesc): RhiComputePipeline {
    validateComputePipelineDesc(desc, this.caps);
    const layout = buildPipelineLayout(this.device, desc.layouts);
    const handle = this.guardValidation(desc.computeShader.name, (): GPUComputePipeline =>
      this.device.createComputePipeline(buildComputeDescriptor(desc, layout, this.device)),
    );
    return new WebGpuComputePipeline(handle, desc.computeShader.name, desc.workgroupSize);
  }

  /** タイムスタンプクエリセットを生成する。非対応なら `null` を返す。 */
  public createQuerySet(count: number): RhiQuerySet | null {
    if (!this.caps.timestampQuery) return null;
    return new WebGpuQuerySet(this.device.createQuerySet({ type: 'timestamp', count }), count);
  }

  /**
   * バッファへデータを書き込む。`srcOffsetElements` と `sizeElements` は
   * `data` が TypedArray なら要素数、そうでなければバイト数 (docs/06 §4)。
   */
  public writeBuffer(
    buf: RhiBuffer,
    dstOffsetBytes: number,
    data: ArrayBufferView,
    srcOffsetElements?: number,
    sizeElements?: number,
  ): void {
    const handle = (buf as WebGpuBuffer).gpu;
    const source = toTransferSource(data);
    if (srcOffsetElements === undefined && sizeElements === undefined) {
      this.device.queue.writeBuffer(handle, dstOffsetBytes, source);
      return;
    }
    const from = srcOffsetElements ?? 0;
    this.device.queue.writeBuffer(handle, dstOffsetBytes, source, from, sizeElements ?? -1);
  }

  /**
   * テクスチャへ画像データを書き込む。`ImageBitmap` は
   * `copyExternalImageToTexture` を使うのでカラー空間変換が進む。
   */
  public writeTexture(
    tex: RhiTexture,
    desc: TextureWriteDesc,
    data: ArrayBufferView | ImageBitmap,
  ): void {
    const target = tex as WebGpuTexture;
    validateTextureWriteDesc(desc, target);
    const origin: GPUExtent3DStrict = [desc.offsetX, desc.offsetY, desc.layer];
    const size: GPUExtent3DStrict = [desc.width, desc.height, 1];
    if (isImageBitmap(data)) {
      const dest = { texture: target.gpu, mipLevel: 0, origin };
      this.device.queue.copyExternalImageToTexture({ source: data }, dest, size);
      return;
    }
    const destination: GPUTexelCopyTextureInfo = { texture: target.gpu, mipLevel: 0, origin };
    const layout = buildImageDataLayout(target.format, desc.width, desc.height);
    this.device.queue.writeTexture(destination, toTransferSource(data), layout, size);
  }

  /** バッファを読み出す。コールドパスとテスト専用。 */
  public readBufferAsync(
    buf: RhiBuffer,
    offsetBytes: number,
    sizeBytes: number,
  ): Promise<ArrayBuffer> {
    return (buf as WebGpuBuffer).readAsync(offsetBytes, sizeBytes);
  }

  /** コマンドエンコーダを取る。2 個をプールから選ぶ (docs/06 §4)。 */
  public createCommandEncoder(): RhiCommandEncoder {
    this.encoder.begin();
    return this.encoder;
  }

  /** 記録済みのコマンドを GPU に送る。 */
  public submit(encoder: RhiCommandEncoder): void {
    (encoder as WebGpuCommandEncoder).submitTo(this.device.queue);
  }

  /** スワップチェーンの現在のテクスチャを返す。 */
  public getCurrentTexture(): RhiTexture {
    const raw = this.context.getCurrentTexture();
    return new WebGpuTexture(raw, {
      label: 'swapchain',
      format: SWAPCHAIN_FORMAT,
      width: raw.width,
      height: raw.height,
      dimension: TextureDimension.D2,
      layers: 1,
      usage: SWAPCHAIN_USAGE,
    });
  }

  /** スワップチェーンのサイズを変更する。 */
  public resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
    this.configure();
  }

  /** デバイスを破棄する。2 回呼んでも安全。 */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.device.destroy();
  }

  /** キャンバスコンテキストを設定する。生成時とリサイズ時に呼ぶ。 */
  private configure(): void {
    this.context.configure({
      device: this.device,
      format: toTextureFormat(SWAPCHAIN_FORMAT),
      usage: toTextureUsage(SWAPCHAIN_USAGE),
    });
  }

  /**
   * パイプライン生成の検証エラーを捕捉する (`docs/06` §9)。
   * `RhiDevice` の生成は同期 API なので、捕捉した誤差は非同期にログへ出す。
   */
  private guardValidation<T extends GPURenderPipeline | GPUComputePipeline>(
    name: string,
    create: () => T,
  ): T {
    if (!__DEBUG__) return create();
    this.device.pushErrorScope('validation');
    const handle = create();
    void this.device.popErrorScope().then((error): void => {
      if (error === null) return;
      logger.error(`シェーダ ${name} のパイプライン生成が検証に失敗しました: ${error.message}`);
    });
    return handle;
  }
}

/**
 * 値が `ImageBitmap` かどうか。型を絞るだけの判定。
 * @param data 判定する値
 * @returns `ImageBitmap` なら true
 */
function isImageBitmap(data: ArrayBufferView | ImageBitmap): data is ImageBitmap {
  return typeof ImageBitmap !== 'undefined' && data instanceof ImageBitmap;
}
