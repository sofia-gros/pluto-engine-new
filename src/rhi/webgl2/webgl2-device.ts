/**
 * @file WebGL2 版のデバイス (docs/06-rhi.md §2・§4・§7・§8、`docs/02` §12)。
 * `WebGL2RenderingContext` を `RhiDevice` で包む。デバイス生成
 * (コンテキストの取得) は `create-device.ts` の責務なので、ここでは既に
 * 用意されたコンテキストを受ける。T-3.2 の `WebGpuDevice` と対称の形にする。
 */
import { ErrorCode, PlutoError } from '../../core/debug';
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
  AddressMode,
  FilterMode,
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
  validateSamplerDesc,
  validateTextureDesc,
  validateTextureWriteDesc,
} from '../validate';
import { WebGlBuffer } from './webgl2-buffer';
import {
  WebGlBindGroup,
  WebGlBindGroupLayout,
  validateBindGroupResource,
} from './webgl2-bind-group';
import { toAddressMode, toFilterMode, toTextureTarget } from './webgl2-convert';
import { WebGlCommandEncoder } from './webgl2-encoder';
import { buildRenderPipeline } from './webgl2-pipeline';
import {
  WebGlSampler,
  WebGlTexture,
  allocateTextureStorage,
  uploadTextureData,
} from './webgl2-texture';
import { WebGlStateCache } from './webgl2-state-cache';
import { buildCapabilities } from './webgl2-convert';
import type { RenderPassDesc } from '../types';

/** GL 定数。仕様固定値。 */
const GL_FRAMEBUFFER = 0x8d40;
const GL_COLOR_ATTACHMENT0 = 0x8ce0;
const GL_DEPTH_ATTACHMENT = 0x8d00;
const GL_FRAMEBUFFER_COMPLETE = 0x8cd5;
const GL_TEXTURE_MIN_FILTER = 0x2801;
const GL_TEXTURE_MAG_FILTER = 0x2800;
const GL_TEXTURE_WRAP_S = 0x2802;
const GL_TEXTURE_WRAP_T = 0x2803;

/** WebGL2 版のクエリセット。タイムスタンプ専用の入れ物で中身は無い。 */
export class WebGlQuerySet implements RhiQuerySet {
  /** 確保したクエリの個数。 */
  public readonly count: number;

  private destroyed = false;

  /**
   * クエリセットを作る。生成は `WebGlDevice.createQuerySet` からだけ呼ぶ。
   * @param count クエリの個数
   */
  public constructor(count: number) {
    this.count = count;
  }

  /** クエリセットを破棄する。2 回呼んでも安全。GL オブジェクトは持たない。 */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
  }
}

/** `WebGlDevice` の生成に使う情報。 */
export interface WebGlDeviceInit {
  /** 既に取得済みの GL コンテキスト。 */
  readonly gl: WebGL2RenderingContext;
  /** 描画先のキャンバス。 */
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
}

/** 描画先の記録。同じ組み合わせは作り直さない。 */
interface FramebufferEntry {
  /** 1 個目の色。 */
  readonly color0: WebGlTexture;
  /** 2 個目の色。無いときは `null`。 */
  readonly color1: WebGlTexture | null;
  /** 深度。無いときは `null`。 */
  readonly depth: WebGlTexture | null;
  /** GL フレームバッファ。 */
  readonly fb: WebGLFramebuffer | null;
}

/**
/** WebGL2 版のデバイス。 */
export class WebGlDevice implements RhiDevice {
  /** 能力。初期化時に 1 回だけ読む。 */
  public readonly caps: RhiCapabilities;

  /** デバイスの喪失を通知する。 */
  public readonly onDeviceLost = new EventEmitter<{ lost: { reason: string } }>();

  private readonly gl: WebGL2RenderingContext;

  private readonly canvas: HTMLCanvasElement | OffscreenCanvas;

  private readonly cache: WebGlStateCache;

  private readonly encoder: WebGlCommandEncoder;

  private readonly framebuffers: FramebufferEntry[] = [];

  private destroyed = false;

  /**
   * デバイスを包む。生成は `create-device.ts` からだけ呼ぶ。
   * @param init 初期化の情報
   */
  public constructor(init: WebGlDeviceInit) {
    this.gl = init.gl;
    this.canvas = init.canvas;
    this.caps = buildCapabilities(this.gl);
    this.cache = new WebGlStateCache(this.gl);
    this.cache.setUnpackAlignment(1);
    this.encoder = new WebGlCommandEncoder(this.gl, this.cache, (desc) =>
      this.framebufferFor(desc),
    );
    init.canvas.addEventListener('webglcontextlost', (e): void => {
      e.preventDefault();
      this.onDeviceLost.emit('lost', { reason: 'context-lost' });
    });
  }

  /** バッファを生成する。 */
  public createBuffer(desc: BufferDesc): RhiBuffer {
    validateBufferDesc(desc);
    return new WebGlBuffer(this.gl, desc.label ?? '', desc.sizeBytes, desc.usage);
  }

  /** テクスチャを生成する。 */
  public createTexture(desc: TextureDesc): RhiTexture {
    validateTextureDesc(desc, this.caps);
    const handle = this.gl.createTexture();
    allocateTextureStorage(this.gl, handle, desc);
    return new WebGlTexture(this.gl, handle, { ...desc, label: desc.label ?? '' });
  }

  /** サンプラを生成する。 */
  public createSampler(desc: SamplerDesc): RhiSampler {
    validateSamplerDesc(desc);
    const handle = this.gl.createSampler();
    this.gl.samplerParameteri(
      handle,
      GL_TEXTURE_MIN_FILTER,
      toFilterMode(desc.filter ?? FilterMode.Nearest),
    );
    this.gl.samplerParameteri(
      handle,
      GL_TEXTURE_MAG_FILTER,
      toFilterMode(desc.filter ?? FilterMode.Nearest),
    );
    this.gl.samplerParameteri(
      handle,
      GL_TEXTURE_WRAP_S,
      toAddressMode(desc.addressModeU ?? AddressMode.ClampToEdge),
    );
    this.gl.samplerParameteri(
      handle,
      GL_TEXTURE_WRAP_T,
      toAddressMode(desc.addressModeV ?? AddressMode.ClampToEdge),
    );
    return new WebGlSampler(this.gl, handle);
  }

  /** バインドグループレイアウトを生成する。 */
  public createBindGroupLayout(desc: BindGroupLayoutDesc): RhiBindGroupLayout {
    validateBindGroupLayoutDesc(desc);
    return new WebGlBindGroupLayout(desc);
  }

  /** バインドグループを生成する。 */
  public createBindGroup(desc: BindGroupDesc): RhiBindGroup {
    const layout = desc.layout as WebGlBindGroupLayout;
    validateBindGroupDesc(desc, layout, this.caps);
    for (let i = 0; i < desc.entries.length; i++) validateBindGroupResource(desc.entries[i], i);
    return new WebGlBindGroup(desc.layout, desc.entries);
  }

  /** レンダーパイプラインを生成する。 */
  public createRenderPipeline(desc: RenderPipelineDesc): RhiRenderPipeline {
    return buildRenderPipeline(this.gl, desc, this.caps);
  }

  /** コンピュートパイプラインを生成する。compute が無いので必ず例外になる。 */
  public createComputePipeline(desc: ComputePipelineDesc): RhiComputePipeline {
    validateComputePipelineDesc(desc, this.caps);
    throw new PlutoError(
      ErrorCode.UnsupportedFeature,
      'このデバイスは compute に対応していません。CPU 側の実装を使ってください',
    );
  }

  /** タイムスタンプクエリセットを生成する。非対応なら `null` を返す。 */
  public createQuerySet(count: number): RhiQuerySet | null {
    if (!this.caps.timestampQuery) return null;
    return new WebGlQuerySet(count);
  }

  /** バッファへデータを書き込む。 */
  public writeBuffer(
    buf: RhiBuffer,
    dstOffsetBytes: number,
    data: ArrayBufferView,
    srcOffsetElements?: number,
    sizeElements?: number,
  ): void {
    (buf as WebGlBuffer).write(dstOffsetBytes, data, srcOffsetElements, sizeElements);
  }

  /** テクスチャへ画像データを書き込む。 */
  public writeTexture(
    tex: RhiTexture,
    desc: TextureWriteDesc,
    data: ArrayBufferView | ImageBitmap,
  ): void {
    const target = tex as WebGlTexture;
    validateTextureWriteDesc(desc, target);
    const glTarget = toTextureTarget(target.dimension);
    this.gl.bindTexture(glTarget, target.gpu);
    uploadTextureData(this.gl, glTarget, target.format, target.dimension, desc, data);
  }

  /** バッファを読み出す。コールドパスとテスト専用。 */
  public readBufferAsync(
    buf: RhiBuffer,
    offsetBytes: number,
    sizeBytes: number,
  ): Promise<ArrayBuffer> {
    return Promise.resolve((buf as WebGlBuffer).readAsync(offsetBytes, sizeBytes));
  }

  /** コマンドエンコーダを取る。使い回しの 1 個を返す。 */
  public createCommandEncoder(): RhiCommandEncoder {
    return this.encoder;
  }

  /** 記録済みのコマンドを送る。GL は即時実行なので `flush` だけする。 */
  public submit(encoder: RhiCommandEncoder): void {
    (encoder as WebGlCommandEncoder).finish();
    this.gl.flush();
  }

  /** スワップチェーンの現在のテクスチャを返す。描画先の目印で中身は無い。 */
  public getCurrentTexture(): RhiTexture {
    const canvas = this.canvas;
    return new WebGlTexture(this.gl, null, {
      label: 'swapchain',
      format: SWAPCHAIN_FORMAT,
      width: canvas.width === 0 ? 1 : canvas.width,
      height: canvas.height === 0 ? 1 : canvas.height,
      dimension: TextureDimension.D2,
      layers: 1,
      usage: TextureUsage.RenderAttachment | TextureUsage.CopySrc,
      swapchain: true,
    });
  }

  /** スワップチェーンのサイズを変更する。 */
  public resize(width: number, height: number): void {
    this.canvas.width = width;
    this.canvas.height = height;
  }

  /** デバイスを破棄する。2 回呼んでも安全。 */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    for (const e of this.framebuffers) this.gl.deleteFramebuffer(e.fb);
    this.framebuffers.length = 0;
  }

  /**
   * 描画先のフレームバッファを解決する。スワップチェーンだけなら `null`。
   * 同じ組み合わせは作り直さない。
   * @param desc RHI の記述子
   * @returns GL フレームバッファ
   */
  private framebufferFor(desc: RenderPassDesc): WebGLFramebuffer | null {
    const colors = desc.colorAttachments.map((a) => a.view as WebGlTexture);
    const depth = (desc.depthStencil?.view ?? null) as WebGlTexture | null;
    const isSwapchainOnly = colors.every((c) => c.swapchain) && (depth === null || depth.swapchain);
    if (isSwapchainOnly) return null;
    for (const c of [...colors, depth]) this.checkAttachmentTarget(c);
    const color0 = colors[0];
    const color1 = colors.length > 1 ? colors[1] : null;
    const found = this.findFramebuffer(color0, color1, depth);
    if (found !== null) return found;
    return this.createFramebuffer(color0, color1, depth);
  }

  /**
   * 描画先として使える対象か確かめる。
   * @param tex 確かめるテクスチャ
   */
  private checkAttachmentTarget(tex: WebGlTexture | null): void {
    if (tex === null) return;
    if (tex.swapchain) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        'スワップチェーンとテクスチャを同じパスには混ぜられません',
      );
    }
    if (tex.dimension !== TextureDimension.D2) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        '描画先のテクスチャ配列には対応していません。2D を使ってください',
      );
    }
  }

  /**
   * 記録済みのフレームバッファを探す。
   * @param color0 1 個目の色
   * @param color1 2 個目の色
   * @param depth 深度
   * @returns 見つかれば GL フレームバッファ
   */
  private findFramebuffer(
    color0: WebGlTexture,
    color1: WebGlTexture | null,
    depth: WebGlTexture | null,
  ): WebGLFramebuffer | null {
    for (const e of this.framebuffers) {
      if (e.color0 === color0 && e.color1 === color1 && e.depth === depth) return e.fb;
    }
    return null;
  }

  /**
   * フレームバッファを作って記録する。
   * @param color0 1 個目の色
   * @param color1 2 個目の色
   * @param depth 深度
   * @returns 作った GL フレームバッファ
   */
  private createFramebuffer(
    color0: WebGlTexture,
    color1: WebGlTexture | null,
    depth: WebGlTexture | null,
  ): WebGLFramebuffer | null {
    const fb = this.gl.createFramebuffer();
    this.gl.bindFramebuffer(GL_FRAMEBUFFER, fb);
    this.gl.framebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0, 0x0de1, color0.gpu, 0);
    const drawBuffers = [GL_COLOR_ATTACHMENT0];
    if (color1 !== null) {
      this.gl.framebufferTexture2D(GL_FRAMEBUFFER, GL_COLOR_ATTACHMENT0 + 1, 0x0de1, color1.gpu, 0);
      drawBuffers.push(GL_COLOR_ATTACHMENT0 + 1);
    }
    this.gl.drawBuffers(drawBuffers);
    if (depth !== null) {
      this.gl.framebufferTexture2D(GL_FRAMEBUFFER, GL_DEPTH_ATTACHMENT, 0x0de1, depth.gpu, 0);
    }
    const status = this.gl.checkFramebufferStatus(GL_FRAMEBUFFER);
    if (status !== GL_FRAMEBUFFER_COMPLETE) {
      throw new PlutoError(
        ErrorCode.InvalidState,
        `フレームバッファが未完成です (0x${status.toString(16)})`,
      );
    }
    this.framebuffers.push({ color0, color1, depth, fb });
    return fb;
  }
}
