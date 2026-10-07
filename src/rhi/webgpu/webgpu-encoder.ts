// @pluto-hot
/**
 * @file WebGPU 版のコマンドエンコーダとパス (docs/06-rhi.md §4・§4.1、`docs/02` §12)。
 * `docs/06` §4 の注記「エンコーダ・パスオブジェクトはフレーム毎に新規生成しない
 * 実装にする」に従い、コンストラクタで器の確保を済ませる。毎フレームの記録経路では
 * `new` もオブジェクトリテラルも使わない (.agents/rules/02-performance.md)。
 */
import { ErrorCode, PlutoError } from '../../core/debug';
import type {
  RhiBindGroup,
  RhiBuffer,
  RhiCommandEncoder,
  RhiComputePass,
  RhiComputePipeline,
  RhiRenderPass,
  RhiRenderPipeline,
} from '../device';
import type { RenderPassDesc } from '../types';
import { toLoadOp } from './webgpu-convert';
import type { WebGpuBuffer } from './webgpu-buffer';
import type { WebGpuBindGroup } from './webgpu-bind-group';
import type { WebGpuComputePipeline, WebGpuRenderPipeline } from './webgpu-pipeline';
import type { WebGpuTexture } from './webgpu-texture';

/** 同時に使えるエンコーダの個数。毎フレームは 1 個だけ使うので 2 個用意する。 */
const ENCODER_COUNT = 2;

/** カラーアタッチメントの最大数 (docs/06 §5.1.1)。 */
const MAX_COLOR_ATTACHMENTS = 2;

/** 消去色。`begin` のフレーム内でリテラルを作らないようにするため。 */
const ZERO_COLOR: GPUColor = [0, 0, 0, 0];

/** 深度の初期値。 */
const DEFAULT_DEPTH = 1;

/** エンコーダを使い切ったときのメッセージ。フレーム内では文字列を作らない。 */
const ENCODER_BUSY = 'コマンドエンコーダが 2 個とも使用中です。submit を忘れた可能性があります';

/** 未開始の記録に対するメッセージ。 */
const NOT_STARTED = 'begin を呼ぶ前にコマンドを記録しました';

/** 頂点バッファが無いので弾くときのメッセージ。 */
const NO_FIRST_VERTEX = '頂点バッファを持たないので firstVertex は 0 でなければなりません';

/** WebGPU 版のレンダーパス。器の確保はコンストラクタで済ませる。 */
export class WebGpuRenderPass implements RhiRenderPass {
  private readonly encoder: GPUCommandEncoder;

  /** 実際に書き込むアタッチメント。`colorSlots` と同じオブジェクトを指す。 */
  private readonly slots: GPURenderPassColorAttachment[];

  /** パスに渡す並び。使わないスロットは `null` にする。 */
  private readonly colorSlots: (GPURenderPassColorAttachment | null)[];

  /** 深度を使わない場合の記述子。`depthStencilAttachment` を付けないために分ける。 */
  private readonly plainDesc: GPURenderPassDescriptor;

  /** 深度を使う場合の記述子。 */
  private readonly depthDesc: GPURenderPassDescriptor;

  private readonly depthAttachment: GPURenderPassDepthStencilAttachment;

  private handle: GPURenderPassEncoder | null = null;

  /**
   * 器の初期化だけを行う。実際のパスは `begin` で開く。
   * @param encoder 記録先のエンコーダ
   * @param voidView 初期値の代わりに使う 1x1 のダミービュー
   */
  public constructor(encoder: GPUCommandEncoder, voidView: GPUTextureView) {
    this.encoder = encoder;
    const slot = (): GPURenderPassColorAttachment => ({
      view: voidView,
      loadOp: 'clear',
      storeOp: 'store',
      clearValue: ZERO_COLOR,
    });
    this.slots = [slot(), slot()];
    this.colorSlots = [this.slots[0], this.slots[1]];
    this.plainDesc = { colorAttachments: this.colorSlots };
    this.depthAttachment = {
      view: voidView,
      depthLoadOp: 'clear',
      depthStoreOp: 'store',
      depthClearValue: DEFAULT_DEPTH,
    };
    this.depthDesc = {
      colorAttachments: this.colorSlots,
      depthStencilAttachment: this.depthAttachment,
    };
  }

  /**
   * レンダーパスを開く。`RhiCommandEncoder.beginRenderPass` からだけ呼ぶ。
   * @hot
   * @param desc RHI の記述子
   */
  public begin(desc: RenderPassDesc): void {
    const n = desc.colorAttachments.length;
    for (let i = 0; i < n; i++) {
      const src = desc.colorAttachments[i];
      const dst = this.slots[i];
      dst.view = (src.view as WebGpuTexture).gpuView;
      dst.loadOp = toLoadOp(src.load);
      dst.storeOp = src.store ? 'store' : 'discard';
      dst.clearValue = src.clearColor ?? ZERO_COLOR;
    }
    for (let i = n; i < MAX_COLOR_ATTACHMENTS; i++) this.colorSlots[i] = null;
    const depth = desc.depthStencil;
    if (depth === undefined) {
      this.handle = this.encoder.beginRenderPass(this.plainDesc);
      return;
    }
    this.depthAttachment.view = (depth.view as WebGpuTexture).gpuView;
    this.depthAttachment.depthLoadOp = toLoadOp(depth.load);
    this.depthAttachment.depthStoreOp = depth.store ? 'store' : 'discard';
    this.depthAttachment.depthClearValue = depth.clearDepth ?? DEFAULT_DEPTH;
    this.handle = this.encoder.beginRenderPass(this.depthDesc);
  }

  /** パイプラインを設定する。 @hot */
  public setPipeline(pipeline: RhiRenderPipeline): void {
    this.pass().setPipeline((pipeline as WebGpuRenderPipeline).gpu);
  }

  /** バインドグループを設定する。index は 0〜3。 @hot */
  public setBindGroup(index: 0 | 1 | 2 | 3, group: RhiBindGroup): void {
    this.pass().setBindGroup(index, (group as WebGpuBindGroup).gpu);
  }

  /** ビューポートを設定する。 @hot */
  public setViewport(x: number, y: number, w: number, h: number): void {
    this.pass().setViewport(x, y, w, h, 0, 1);
  }

  /** はさみ倍の矩形を設定する。WebGPU では `setScissorRect` という名前。 @hot */
  public setScissor(x: number, y: number, w: number, h: number): void {
    this.pass().setScissorRect(x, y, w, h);
  }

  /** 描画する。頂点バッファが無いので firstVertex は 0 しか受け付けない。 @hot */
  public draw(
    vertexCount: number,
    instanceCount: number,
    firstVertex?: number,
    firstInstance?: number,
  ): void {
    if ((firstVertex ?? 0) !== 0) {
      throw new PlutoError(ErrorCode.InvalidArgument, NO_FIRST_VERTEX);
    }
    this.pass().draw(vertexCount, instanceCount, 0, firstInstance ?? 0);
  }

  /** 間接描画する。 @hot */
  public drawIndirect(args: RhiBuffer, offsetBytes: number): void {
    this.pass().drawIndirect((args as WebGpuBuffer).gpu, offsetBytes);
  }

  /** パスを閉じる。 @hot */
  public end(): void {
    const pass = this.handle;
    if (pass === null) {
      throw new PlutoError(ErrorCode.InvalidState, '開いていないレンダーパスを閉じました');
    }
    pass.end();
    this.handle = null;
  }

  /** 開いているパスを返す。閉じていたら例外を投げる。 */
  private pass(): GPURenderPassEncoder {
    const pass = this.handle;
    if (pass === null) {
      throw new PlutoError(ErrorCode.InvalidState, 'レンダーパスが開いていません');
    }
    return pass;
  }
}

/** WebGPU 版のコンピュートパス。器の確保はコンストラクタで済ませる。 */
export class WebGpuComputePass implements RhiComputePass {
  private readonly encoder: GPUCommandEncoder;

  private handle: GPUComputePassEncoder | null = null;

  /** 器の初期化だけを行う。実際のパスは `begin` で開く。 */
  public constructor(encoder: GPUCommandEncoder) {
    this.encoder = encoder;
  }

  /** コンピュートパスを開く。`RhiCommandEncoder.beginComputePass` からだけ呼ぶ。 @hot */
  public begin(): void {
    this.handle = this.encoder.beginComputePass();
  }

  /** パイプラインを設定する。 @hot */
  public setPipeline(pipeline: RhiComputePipeline): void {
    this.pass().setPipeline((pipeline as WebGpuComputePipeline).gpu);
  }

  /** バインドグループを設定する。index は 0〜3。 @hot */
  public setBindGroup(index: 0 | 1 | 2 | 3, group: RhiBindGroup): void {
    this.pass().setBindGroup(index, (group as WebGpuBindGroup).gpu);
  }

  /** ワークグループ単位で起動する。y と z は省略すると 1。 @hot */
  public dispatch(x: number, y?: number, z?: number): void {
    this.pass().dispatchWorkgroups(x, y ?? 1, z ?? 1);
  }

  /** バッファの内容で起動数を決定する。 @hot */
  public dispatchIndirect(args: RhiBuffer, offsetBytes: number): void {
    this.pass().dispatchWorkgroupsIndirect((args as WebGpuBuffer).gpu, offsetBytes);
  }

  /** パスを閉じる。 @hot */
  public end(): void {
    const pass = this.handle;
    if (pass === null) {
      throw new PlutoError(ErrorCode.InvalidState, '開いていないコンピュートパスを閉じました');
    }
    pass.end();
    this.handle = null;
  }

  /** 開いているパスを返す。閉じていたら例外を投げる。 */
  private pass(): GPUComputePassEncoder {
    const pass = this.handle;
    if (pass === null) {
      throw new PlutoError(ErrorCode.InvalidState, 'コンピュートパスが開いていません');
    }
    return pass;
  }
}

/** WebGPU 版のコマンドエンコーダ。 */
export class WebGpuCommandEncoder implements RhiCommandEncoder {
  private readonly handles: GPUCommandEncoder[] = [];

  private readonly renderPasses: WebGpuRenderPass[] = [];

  private readonly computePasses: WebGpuComputePass[] = [];

  private readonly submitLists: GPUCommandBuffer[][] = [];

  private readonly busy: boolean[] = [];

  private current = -1;

  /**
   * エンコーダの器を初期化する。フレーム毎の生成を避けるためここで作り切る。
   * @param device 所有デバイス
   * @param voidView 初期値の代わりに使う 1x1 のダミービュー
   */
  public constructor(device: GPUDevice, voidView: GPUTextureView) {
    for (let i = 0; i < ENCODER_COUNT; i++) {
      const handle = device.createCommandEncoder({ label: `enc${String(i)}` });
      this.handles.push(handle);
      this.renderPasses.push(new WebGpuRenderPass(handle, voidView));
      this.computePasses.push(new WebGpuComputePass(handle));
      this.submitLists.push([]);
      this.busy.push(false);
    }
  }

  /** 使っていないエンコーダを 1 つ取る。すべて使用中なら例外を投げる。 @hot */
  public begin(): void {
    for (let i = 0; i < this.busy.length; i++) {
      if (!this.busy[i]) {
        this.busy[i] = true;
        this.current = i;
        return;
      }
    }
    throw new PlutoError(ErrorCode.InvalidState, ENCODER_BUSY);
  }

  /** 選んだエンコーダの添字を返す。まだ選ばれていなければ例外を投げる。 */
  private slot(): number {
    const i = this.current;
    if (i < 0) throw new PlutoError(ErrorCode.InvalidState, NOT_STARTED);
    return i;
  }

  /** レンダーパスを開く。 @hot */
  public beginRenderPass(desc: RenderPassDesc): RhiRenderPass {
    const pass = this.renderPasses[this.slot()];
    pass.begin(desc);
    return pass;
  }

  /** コンピュートパスを開く。 @hot */
  public beginComputePass(): RhiComputePass {
    const pass = this.computePasses[this.slot()];
    pass.begin();
    return pass;
  }

  /** バッファ同士をコピーする。オフセットとサイズはいずれもバイト。 @hot */
  public copyBufferToBuffer(
    src: RhiBuffer,
    srcOffset: number,
    dst: RhiBuffer,
    dstOffset: number,
    size: number,
  ): void {
    this.handles[this.slot()].copyBufferToBuffer(
      (src as WebGpuBuffer).gpu,
      srcOffset,
      (dst as WebGpuBuffer).gpu,
      dstOffset,
      size,
    );
  }

  /** バッファの範囲を 0 で埋める。offset と size は省略できる。 @hot */
  public clearBuffer(buf: RhiBuffer, offset?: number, size?: number): void {
    this.handles[this.slot()].clearBuffer((buf as WebGpuBuffer).gpu, offset ?? 0, size);
  }

  /**
   * 記録を終えてキューに送り、エンコーダを解放する。`RhiDevice.submit` からだけ呼ぶ。
   * @hot
   * @param queue WebGPU のキュー
   */
  public submitTo(queue: GPUQueue): void {
    const i = this.slot();
    const list = this.submitLists[i];
    list[0] = this.handles[i].finish();
    queue.submit(list);
    this.busy[i] = false;
    this.current = -1;
  }
}
