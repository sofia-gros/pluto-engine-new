/**
 * @file RHI のデバイスと GPU リソースのインターフェース (docs/06-rhi.md §4・§4.1、`docs/02` §12)。
 * 上位層はこのインターフェースだけを使う。`GPUDevice` や `WebGL2RenderingContext` を
 * 直接触れてはならない (docs/06 §1)。頂点バッファ API は持たない (vertex pulling)。
 */
import type { EventEmitter } from '../core/events';
import type { RhiCapabilities } from './capabilities';
import type { BindGroupLayoutEntryDesc } from './types';
import type {
  BindGroupDesc,
  BindGroupLayoutDesc,
  BufferDesc,
  ComputePipelineDesc,
  RenderPassDesc,
  RenderPipelineDesc,
  SamplerDesc,
  TextureDesc,
  TextureWriteDesc,
} from './types';

/** RHI devices。バックエンド生成 (`createDevice`) と実生成は別ファイル。 */
export interface RhiDevice {
  /** 能力。初期化時に 1 回だけ読む。 */
  readonly caps: RhiCapabilities;
  /** バッファを生成する。 */
  createBuffer(desc: BufferDesc): RhiBuffer;
  /** テクスチャを生成する。ミップマップは作らない。 */
  createTexture(desc: TextureDesc): RhiTexture;
  /** サンプラを生成する。 */
  createSampler(desc: SamplerDesc): RhiSampler;
  /** バインドグループレイアウトを生成する。 */
  createBindGroupLayout(desc: BindGroupLayoutDesc): RhiBindGroupLayout;
  /** バインドグループを生成する。 */
  createBindGroup(desc: BindGroupDesc): RhiBindGroup;
  /** レンダーパイプラインを生成する。 */
  createRenderPipeline(desc: RenderPipelineDesc): RhiRenderPipeline;
  /** コンピュートパイプラインを生成する。`caps.compute` が false なら `PlutoError(UnsupportedFeature)`。 */
  createComputePipeline(desc: ComputePipelineDesc): RhiComputePipeline;
  /** タイムスタンプクエリセットを生成する。`caps.timestampQuery` が false なら `null`。 */
  createQuerySet(count: number): RhiQuerySet | null;
  /**
   * バッファへデータを書き込む。
   * @param buf 書き込み先のバッファ
   * @param dstOffsetBytes 書き込み先の開始バイト
   * @param data 書き込むデータ
   * @param srcOffsetElements `data` 側の開始要素番号 (省略は 0)
   * @param sizeElements 書き込む要素数 (省略は全部)
   */
  writeBuffer(
    buf: RhiBuffer,
    dstOffsetBytes: number,
    data: ArrayBufferView,
    srcOffsetElements?: number,
    sizeElements?: number,
  ): void;
  /** テクスチャへ画像データを書き込む。圧縮フォーマットは 4×4 ブロック単位。 */
  writeTexture(tex: RhiTexture, desc: TextureWriteDesc, data: ArrayBufferView | ImageBitmap): void;
  /** バッファを読み出す。コールドパスとテスト専用。 */
  readBufferAsync(buf: RhiBuffer, offsetBytes: number, sizeBytes: number): Promise<ArrayBuffer>;
  /** コマンドエンコーダを生成する。フレーム毎に新規生成しない実装 (docs/06 §4)。 */
  createCommandEncoder(): RhiCommandEncoder;
  /** 記録済みのコマンドを GPU に送る。 */
  submit(encoder: RhiCommandEncoder): void;
  /** スワップチェーンの現在のテクスチャを返す。 */
  getCurrentTexture(): RhiTexture;
  /** スワップチェーンのサイズを変更する。 */
  resize(width: number, height: number): void;
  /** デバイスの喪失を通知する。v1 では自動復旧しない (docs/06 §8)。 */
  readonly onDeviceLost: EventEmitter<{ lost: { reason: string } }>;
  /** デバイスを破棄する。2 回呼んでも安全。 */
  destroy(): void;
}

/** コマンドの記録器。 */
export interface RhiCommandEncoder {
  /** レンダーパスを開始する。 */
  beginRenderPass(desc: RenderPassDesc): RhiRenderPass;
  /** コンピュートパスを開始する。 */
  beginComputePass(): RhiComputePass;
  /** バッファ同士をコピーする。 */
  copyBufferToBuffer(
    src: RhiBuffer,
    srcOffset: number,
    dst: RhiBuffer,
    dstOffset: number,
    size: number,
  ): void;
  /** バッファの範囲を 0 で埋める。 */
  clearBuffer(buf: RhiBuffer, offset?: number, size?: number): void;
  /** タイムスタンプを書く。`writeTimestamp` を持たないデバイスでは何もしない。 */
  writeTimestamp?(querySet: RhiQuerySet, index: number): void;
}

/** レンダーパス。四角形は `draw(6, instanceCount)` で `vertex_index` から生成する。 */
export interface RhiRenderPass {
  /** パイプラインを設定する。 */
  setPipeline(p: RhiRenderPipeline): void;
  /** バインドグループを設定する。index は `RenderPipelineDesc.layouts` の添字に対応する。 */
  setBindGroup(index: 0 | 1 | 2 | 3, g: RhiBindGroup): void;
  /** ビューポートを設定する。 */
  setViewport(x: number, y: number, w: number, h: number): void;
  /** はさみ倍の矩形を設定する。 */
  setScissor(x: number, y: number, w: number, h: number): void;
  /** 描画する。頂点バッファは持たないので `firstVertex` は実質 0。 */
  draw(
    vertexCount: number,
    instanceCount: number,
    firstVertex?: number,
    firstInstance?: number,
  ): void;
  /** 間接描画する。`caps.indirectDraw` が false のときは `PlutoError(InvalidState)`。 */
  drawIndirect(args: RhiBuffer, offsetBytes: number): void;
  /** パスを終了する。 */
  end(): void;
}

/** コンピュートパス。 */
export interface RhiComputePass {
  /** パイプラインを設定する。 */
  setPipeline(p: RhiComputePipeline): void;
  /** バインドグループを設定する。 */
  setBindGroup(index: 0 | 1 | 2 | 3, g: RhiBindGroup): void;
  /** ワークグループ単位で起動する。省略した y と z は 1。 */
  dispatch(x: number, y?: number, z?: number): void;
  /** バッファの内容で起動数を決定する。 */
  dispatchIndirect(args: RhiBuffer, offsetBytes: number): void;
  /** パスを終了する。 */
  end(): void;
}

/** GPU バッファ。 */
export interface RhiBuffer {
  /** 生成時のラベル。省略時は空文字列。 */
  readonly label: string;
  /** バイト数。 */
  readonly sizeBytes: number;
  /** `BufferUsage` のビットフラグ。 */
  readonly usage: number;
  /** 破棄する。2 回呼んでも安全。 */
  destroy(): void;
}

/** GPU テクスチャ。ミップマップは持たない。 */
export interface RhiTexture {
  /** 生成時のラベル。省略時は空文字列。 */
  readonly label: string;
  /** `TextureFormat` の値。 */
  readonly format: number;
  /** 幅 (px)。 */
  readonly width: number;
  /** 高さ (px)。 */
  readonly height: number;
  /** `TextureDimension` の値。 */
  readonly dimension: number;
  /** レイヤー数。 */
  readonly layers: number;
  /** `TextureUsage` のビットフラグ。 */
  readonly usage: number;
  /** 破棄する。2 回呼んでも安全。 */
  destroy(): void;
}

/** GPU サンプラ。ミップマップフィルタは無い。 */
export interface RhiSampler {
  /** 破棄する。2 回呼んでも安全。 */
  destroy(): void;
}

/** バインドグループレイアウト。 */
export interface RhiBindGroupLayout {
  /** 生成時のエントリ並び。 */
  readonly entries: readonly BindGroupLayoutEntryDesc[];
  /** 破棄する。2 回呼んでも安全。 */
  destroy(): void;
}

/** バインドグループ。 */
export interface RhiBindGroup {
  /** 生成時に使ったレイアウト。 */
  readonly layout: RhiBindGroupLayout;
  /** 破棄する。2 回呼んでも安全。 */
  destroy(): void;
}

/** レンダーパイプライン。 */
export interface RhiRenderPipeline {
  /** 生成時のラベル。省略時は空文字列。 */
  readonly label: string;
  /** 破棄する。2 回呼んでも安全。 */
  destroy(): void;
}

/** コンピュートパイプライン。 */
export interface RhiComputePipeline {
  /** 生成時のラベル。省略時は空文字列。 */
  readonly label: string;
  /** 生成時のワークグループ size `[x, y, z]`。 */
  readonly workgroupSize: readonly [number, number, number];
  /** 破棄する。2 回呼んでも安全。 */
  destroy(): void;
}

/** タイムスタンプクエリセット。devtools 専用。 */
export interface RhiQuerySet {
  /** 確保したクエリの個数。 */
  readonly count: number;
  /** 破棄する。2 回呼んでも安全。 */
  destroy(): void;
}
