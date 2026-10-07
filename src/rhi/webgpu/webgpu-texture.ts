/**
 * @file WebGPU 版のテクスチャとサンプラ (docs/06-rhi.md §4・§4.1・§5、`docs/02` §12)。
 * `RhiTexture` と `RhiSampler` を `GPUTexture`・`GPUSampler` で満たす。
 */
import { ErrorCode, PlutoError } from '../../core/debug';
import type { RhiSampler, RhiTexture } from '../device';
import { TextureDimension, type TextureDesc } from '../types';
import { blockBytes, blockSide, toTextureViewDimension } from './webgpu-convert';

/**
 * `writeTexture` が要求する 1 行のバイト数の最小の倍数。
 * 非紮縮書式でも 256 の倍数にする。
 */
const ROW_ALIGN_BYTES = 256;

/** WebGPU 版テクスチャの構造に必要な記述子型。ラベルは空文字列にすることを前提とする。 */
export type WebGpuTextureDesc = TextureDesc & { readonly label: string };

/** WebGPU 版のテクスチャ。 */
export class WebGpuTexture implements RhiTexture {
  /** 生成時のラベル。省略時は空文字列。 */
  public readonly label: string;

  /** `TextureFormat` の値。 */
  public readonly format: number;

  /** 幅 (px)。 */
  public readonly width: number;

  /** 高さ (px)。 */
  public readonly height: number;

  /** `TextureDimension` の値。 */
  public readonly dimension: number;

  /** レイヤー数。 */
  public readonly layers: number;

  /** `TextureUsage` のビットフラグ。 */
  public readonly usage: number;

  private readonly handle: GPUTexture;

  private readonly view: GPUTextureView;

  private destroyed = false;

  /**
   * テクスチャのラッパーを作る。生成は `WebGpuDevice.createTexture` からだけ呼ぶ。
   * @param handle WebGPU のテクスチャ
   * @param desc 生成時の記述子 (ラベルは空文字列にすることを前提とする)
   */
  public constructor(handle: GPUTexture, desc: WebGpuTextureDesc) {
    this.handle = handle;
    this.dimension = desc.dimension ?? TextureDimension.D2;
    this.view = handle.createView({ dimension: toTextureViewDimension(this.dimension) });
    this.label = desc.label;
    this.format = desc.format;
    this.width = desc.width;
    this.height = desc.height;
    this.layers = desc.layers;
    this.usage = desc.usage;
  }

  /**
   * WebGPU のテクスチャを取り出す。`src/rhi/webgpu/` 内部専用。
   * @returns `GPUTexture`
   */
  public get gpu(): GPUTexture {
    this.assertAlive();
    return this.handle;
  }

  /**
   * WebGPU のテクスチャビューを取り出す。`src/rhi/webgpu/` 内部専用。
   * ビューはコンストラクタで 1 度だけ作る (毎フレーム作らない)。
   * @returns `GPUTextureView`
   */
  public get gpuView(): GPUTextureView {
    this.assertAlive();
    return this.view;
  }

  /**
   * テクスチャを破棄する。2 回呼んでも安全。
   */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.handle.destroy();
  }

  /**
   * 破棄済みなら例外を投げる。
   */
  private assertAlive(): void {
    if (this.destroyed) {
      throw new PlutoError(
        ErrorCode.InvalidState,
        `破棄済みのテクスチャ ${this.label} を使いました`,
      );
    }
  }
}

/** WebGPU 版のサンプラ。 */
export class WebGpuSampler implements RhiSampler {
  private readonly handle: GPUSampler;

  private destroyed = false;

  /**
   * サンプラのラッパーを作る。生成は `WebGpuDevice.createSampler` からだけ呼ぶ。
   * @param handle WebGPU のサンプラ
   */
  public constructor(handle: GPUSampler) {
    this.handle = handle;
  }

  /**
   * WebGPU のサンプラを取り出す。`src/rhi/webgpu/` 内部専用。
   * @returns `GPUSampler`
   */
  public get gpu(): GPUSampler {
    if (this.destroyed) {
      throw new PlutoError(ErrorCode.InvalidState, '破棄済みのサンプラを使いました');
    }
    return this.handle;
  }

  /**
   * サンプラを破棄する。2 回呼んでも安全。WebGPU のサンプラに破棄操作は無い。
   */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
  }
}

/**
 * `writeTexture` に渡す転送レイアウトを作る。
 * 圧縮書式は 4x4 ブロック単位なので、幅と高さをブロックの倍数に切り上げる。
 * @param format `TextureFormat` の値
 * @param width 書き込む幅 (texel)
 * @param height 書き込む高さ (texel)
 * @returns 転送レイアウト
 */
export function buildImageDataLayout(
  format: number,
  width: number,
  height: number,
): GPUTexelCopyBufferLayout {
  const side = blockSide(format);
  const rows = Math.max(1, Math.ceil(height / side));
  const cols = Math.max(1, Math.ceil(width / side));
  const rowBytes = cols * blockBytes(format);
  const stride = Math.ceil(rowBytes / ROW_ALIGN_BYTES) * ROW_ALIGN_BYTES;
  return { bytesPerRow: stride, rowsPerImage: rows };
}
