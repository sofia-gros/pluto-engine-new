// @pluto-hot
/**
 * @file WebGL2 版のコマンドエンコーダとパス (docs/06-rhi.md §4・§4.1、`docs/02` §12)。
 * GL にコマンドバッファは無いので、パスごとに即時実行する。器の確保は
 * コンストラクタで済ませ、毎フレームの経路では `new` を使わない。
 */
import { ErrorCode, PlutoError } from '../../core/debug';
import type {
  RhiBindGroup,
  RhiBuffer,
  RhiCommandEncoder,
  RhiComputePass,
  RhiRenderPass,
  RhiRenderPipeline,
} from '../device';
import { LoadAction, type RenderPassDesc } from '../types';
import { validateRenderPassDesc } from '../validate';
import type { WebGlBuffer } from './webgl2-buffer';
import { applyBindGroups } from './webgl2-bind-group';
import type { WebGlBindGroup } from './webgl2-bind-group';
import type { WebGlRenderPipeline } from './webgl2-pipeline';
import type { WebGlStateCache } from './webgl2-state-cache';

/** 三角形。仕様固定値。 */
const GL_TRIANGLES = 0x0004;

/** コピー元の結び付け先。仕様固定値。 */
const GL_COPY_READ_BUFFER = 0x8f36;

/** コピー先の結び付け先。仕様固定値。 */
const GL_COPY_WRITE_BUFFER = 0x8f37;

/** 消去用の 0 埋めブロック。初期化時に 1 回だけ確保する。 */
const ZEROS = new Uint8Array(4096);

/** 消去色の既定値。フレーム内でリテラルを作らないように置く。 */
const ZERO_COLOR: readonly [number, number, number, number] = [0, 0, 0, 0];

/** バインドグループの最大数 (docs/06 §4)。 */
const MAX_BIND_GROUPS = 4;

/** 描画先の解決。スワップチェーンなら `null` (既定のフレームバッファ)。 */
export type FramebufferResolver = (desc: RenderPassDesc) => WebGLFramebuffer | null;

/** WebGL2 版のレンダーパス。 */
export class WebGlRenderPass implements RhiRenderPass {
  private readonly gl: WebGL2RenderingContext;

  private readonly cache: WebGlStateCache;

  private readonly resolve: FramebufferResolver;

  private readonly groups: (WebGlBindGroup | null)[] = [null, null, null, null];

  private pipeline: WebGlRenderPipeline | null = null;

  private open = false;

  /**
   * 器の初期化だけを行う。実際のパスは `begin` で開く。
   * @param gl GL コンテキスト
   * @param cache 状態キャッシュ
   * @param resolve 描画先の解決
   */
  public constructor(
    gl: WebGL2RenderingContext,
    cache: WebGlStateCache,
    resolve: FramebufferResolver,
  ) {
    this.gl = gl;
    this.cache = cache;
    this.resolve = resolve;
  }

  /**
   * レンダーパスを開く。`RhiCommandEncoder.beginRenderPass` からだけ呼ぶ。
   * @hot
   * @param desc RHI の記述子
   */
  public begin(desc: RenderPassDesc): void {
    validateRenderPassDesc(desc);
    this.cache.bindFramebuffer(this.resolve(desc));
    let shouldClearColor = false;
    const attachments = desc.colorAttachments;
    let i = 0;
    const n = attachments.length;
    while (i < n) {
      const a = attachments[i];
      if (a.load === LoadAction.Clear) {
        shouldClearColor = true;
        const c = a.clearColor ?? ZERO_COLOR;
        this.cache.setClearColor(c[0], c[1], c[2], c[3]);
      }
      i++;
    }
    const depth = desc.depthStencil;
    const shouldClearDepth = depth?.load === LoadAction.Clear;
    if (shouldClearDepth) this.cache.setClearDepth(depth.clearDepth ?? 1);
    this.cache.clear(shouldClearColor, shouldClearDepth);
    for (let i = 0; i < MAX_BIND_GROUPS; i++) this.groups[i] = null;
    this.pipeline = null;
    this.open = true;
  }

  /** パイプラインを設定する。 @hot */
  public setPipeline(pipeline: RhiRenderPipeline): void {
    this.checkOpen();
    this.pipeline = pipeline as WebGlRenderPipeline;
  }

  /** バインドグループを設定する。 @hot */
  public setBindGroup(index: 0 | 1 | 2 | 3, group: RhiBindGroup): void {
    this.checkOpen();
    this.groups[index] = group as WebGlBindGroup;
  }

  /** ビューポートを設定する。 @hot */
  public setViewport(x: number, y: number, w: number, h: number): void {
    this.checkOpen();
    this.cache.setViewport(x, y, w, h);
  }

  /** はさみ倍の矩形を設定する。 @hot */
  public setScissor(x: number, y: number, w: number, h: number): void {
    this.checkOpen();
    this.cache.setScissor(x, y, w, h);
  }

  /** 描画する。頂点バッファが無いので先頭は 0 しか受け付けない。 @hot */
  public draw(
    vertexCount: number,
    instanceCount: number,
    firstVertex?: number,
    firstInstance?: number,
  ): void {
    this.checkOpen();
    if ((firstVertex ?? 0) !== 0) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        '頂点バッファを持たないので firstVertex は 0 でなければなりません',
      );
    }
    if ((firstInstance ?? 0) !== 0) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        'firstInstance には対応していません。0 を渡してください',
      );
    }
    const pipeline = this.pipeline;
    if (pipeline === null) {
      throw new PlutoError(ErrorCode.InvalidState, 'パイプラインを設定せずに描画しました');
    }
    this.applyPipeline(pipeline);
    applyBindGroups(this.gl, this.cache, pipeline, this.groups);
    this.gl.drawArraysInstanced(GL_TRIANGLES, 0, vertexCount, instanceCount);
  }

  /** 間接描画する。WebGL2 に対応が無いので必ず例外になる。引数は無視する。 @hot */
  public drawIndirect(): void {
    this.checkOpen();
    throw new PlutoError(
      ErrorCode.InvalidState,
      '間接描画は WebGL2 に対応していません。CPU 側で個数を決めてください',
    );
  }

  /** パスを閉じる。 @hot */
  public end(): void {
    this.checkOpen();
    this.open = false;
  }

  /** パスが開いているか判定する。 */
  public isOpen(): boolean {
    return this.open;
  }

  /** パイプラインの固定機能を適用する。 */
  private applyPipeline(pipeline: WebGlRenderPipeline): void {
    this.cache.useProgram(pipeline.gpu);
    this.cache.setBlend(
      pipeline.blendEnabled,
      pipeline.blendSrcRGB,
      pipeline.blendDstRGB,
      pipeline.blendSrcAlpha,
      pipeline.blendDstAlpha,
    );
    this.cache.setCull(pipeline.cullEnabled, pipeline.cullFace);
    this.cache.setDepth(pipeline.depthEnabled, pipeline.depthFunc, pipeline.depthWrite);
    const mask = pipeline.writeMask;
    this.cache.setColorMask(mask[0], mask[1], mask[2], mask[3]);
  }

  /** 開いているか確かめる。 */
  private checkOpen(): void {
    if (!this.open) {
      throw new PlutoError(ErrorCode.InvalidState, 'レンダーパスが開いていません');
    }
  }
}

/** WebGL2 版のコンピュートパス。compute が無いので開けない。 */
export class WebGlComputePass implements RhiComputePass {
  /** パイプラインを設定する。開けないので必ず例外になる。引数は無視する。 @hot */
  public setPipeline(): void {
    throw new PlutoError(
      ErrorCode.InvalidState,
      'compute は WebGL2 に対応していません。CPU 側の実装を使ってください',
    );
  }

  /** バインドグループを設定する。開けないので必ず例外になる。引数は無視する。 @hot */
  public setBindGroup(): void {
    throw new PlutoError(
      ErrorCode.InvalidState,
      'compute は WebGL2 に対応していません。CPU 側の実装を使ってください',
    );
  }

  /** 起動する。開けないので必ず例外になる。引数は無視する。 @hot */
  public dispatch(): void {
    throw new PlutoError(
      ErrorCode.InvalidState,
      'compute は WebGL2 に対応していません。CPU 側の実装を使ってください',
    );
  }

  /** 間接起動する。開けないので必ず例外になる。引数は無視する。 @hot */
  public dispatchIndirect(): void {
    throw new PlutoError(
      ErrorCode.InvalidState,
      'compute は WebGL2 に対応していません。CPU 側の実装を使ってください',
    );
  }

  /** パスを閉じる。開けないので必ず例外になる。 @hot */
  public end(): void {
    throw new PlutoError(
      ErrorCode.InvalidState,
      'compute は WebGL2 に対応していません。CPU 側の実装を使ってください',
    );
  }
}

/** WebGL2 版のコマンドエンコーダ。 */
export class WebGlCommandEncoder implements RhiCommandEncoder {
  private readonly gl: WebGL2RenderingContext;

  private readonly renderPass: WebGlRenderPass;

  /**
   * エンコーダを作る。パスは使い回す。
   * @param gl GL コンテキスト
   * @param cache 状態キャッシュ
   * @param resolve 描画先の解決
   */
  public constructor(
    gl: WebGL2RenderingContext,
    cache: WebGlStateCache,
    resolve: FramebufferResolver,
  ) {
    this.gl = gl;
    this.renderPass = new WebGlRenderPass(gl, cache, resolve);
  }

  /** レンダーパスを開く。二重に開くと例外になる。 @hot */
  public beginRenderPass(desc: RenderPassDesc): RhiRenderPass {
    if (this.renderPass.isOpen()) {
      throw new PlutoError(ErrorCode.InvalidState, 'パスを開いている途中で別のパスは開けません');
    }
    this.renderPass.begin(desc);
    return this.renderPass;
  }

  /** コンピュートパスを開く。compute が無いので必ず例外になる。 @hot */
  public beginComputePass(): RhiComputePass {
    throw new PlutoError(
      ErrorCode.InvalidState,
      'compute は WebGL2 に対応していません。CPU 側の実装を使ってください',
    );
  }

  /** バッファ同士をコピーする。UBO 同士だけできる。 @hot */
  public copyBufferToBuffer(
    src: RhiBuffer,
    srcOffset: number,
    dst: RhiBuffer,
    dstOffset: number,
    size: number,
  ): void {
    const s = src as WebGlBuffer;
    const d = dst as WebGlBuffer;
    if (s.isStorage || d.isStorage) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        'データテクスチャのコピーには対応していません。UBO 同士で使ってください',
      );
    }
    this.gl.bindBuffer(GL_COPY_READ_BUFFER, s.gpuBuffer);
    this.gl.bindBuffer(GL_COPY_WRITE_BUFFER, d.gpuBuffer);
    this.gl.copyBufferSubData(
      GL_COPY_READ_BUFFER,
      GL_COPY_WRITE_BUFFER,
      srcOffset,
      dstOffset,
      size,
    );
  }

  /** バッファの範囲を 0 で埋める。UBO だけできる。 @hot */
  public clearBuffer(buf: RhiBuffer, offset?: number, size?: number): void {
    const target = buf as WebGlBuffer;
    if (target.isStorage) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        'データテクスチャの消去には対応していません。UBO で使ってください',
      );
    }
    const handle = target.gpuBuffer;
    if (handle === null) {
      throw new PlutoError(ErrorCode.InvalidState, '破棄済みのバッファを消去しました');
    }
    this.gl.bindBuffer(GL_COPY_WRITE_BUFFER, handle);
    let start = offset ?? 0;
    let rest = size ?? target.sizeBytes - start;
    while (rest > 0) {
      const chunk = Math.min(rest, ZEROS.length);
      this.gl.bufferSubData(GL_COPY_WRITE_BUFFER, start, ZEROS, 0, chunk);
      start += chunk;
      rest -= chunk;
    }
  }

  /**
   * 記録を終える。GL は即時実行なので器を解放するだけ。
   * `RhiDevice.submit` からだけ呼ぶ。
   * @hot
   */
  public finish(): void {
    // GL は即時実行のため状態リセット等なし
  }

  /**
   * GL コンテキストを取り出す。`RhiDevice.submit` からだけ呼ぶ。
   * @returns GL コンテキスト
   */
  public get context(): WebGL2RenderingContext {
    return this.gl;
  }
}
