/**
 * @file WebGPU 版のバッファ (docs/06-rhi.md §4・§4.1、`docs/02` §12)。
 * `RhiBuffer` を `GPUBuffer` で満たす。`readAsync` はコールドパス専用で、
 * フレーム中に呼ぶと 1 フレームを止めてしまう (.agents/rules/02-performance.md)。
 */
import { ErrorCode, PlutoError } from '../../core/debug';
import type { RhiBuffer } from '../device';
import { BufferUsage } from '../types';

/** `GPUMapMode.READ` の値 (WebGPU 仕様で固定)。ブラウザのグローバルを使わない。 */
const MAP_MODE_READ = 0x0001;

/** WebGPU 版のバッファ。 */
export class WebGpuBuffer implements RhiBuffer {
  /** 生成時のラベル。省略時は空文字列。 */
  public readonly label: string;

  /** バイト数。 */
  public readonly sizeBytes: number;

  /** `BufferUsage` のビットフラグ。 */
  public readonly usage: number;

  private readonly handle: GPUBuffer;

  private destroyed = false;

  private mapped = false;

  /**
   * バッファのラッパーを作る。生成は `WebGpuDevice.createBuffer` からだけ呼ぶ。
   * @param handle WebGPU のバッファ
   * @param label 生成時のラベル
   * @param sizeBytes バイト数
   * @param usage `BufferUsage` のビットフラグ
   */
  public constructor(handle: GPUBuffer, label: string, sizeBytes: number, usage: number) {
    this.handle = handle;
    this.label = label;
    this.sizeBytes = sizeBytes;
    this.usage = usage;
  }

  /**
   * WebGPU のバッファを取り出す。`src/rhi/webgpu/` 内部専用。
   * @returns `GPUBuffer`
   */
  public get gpu(): GPUBuffer {
    this.assertAlive();
    return this.handle;
  }

  /**
   * バッファの一部を読み出す。`BufferUsage.MapRead` が立っているバッファだけ読める。
   * コールドパスとテスト専用 (フレーム中に呼んではいけない)。
   * @param offsetBytes 読み出す開始バイト
   * @param sizeBytes 読み出すバイト数
   * @returns 読み出したデータ (内部の ArrayBuffer の複製)
   */
  public async readAsync(offsetBytes: number, sizeBytes: number): Promise<ArrayBuffer> {
    this.assertAlive();
    if ((this.usage & BufferUsage.MapRead) === 0) {
      throw new PlutoError(
        ErrorCode.InvalidState,
        `バッファ ${this.label} に BufferUsage.MapRead がありません。MapRead と CopyDst を指定してください`,
      );
    }
    if (this.mapped) {
      throw new PlutoError(
        ErrorCode.InvalidState,
        `バッファ ${this.label} は既に map されています`,
      );
    }
    if (offsetBytes < 0 || sizeBytes < 0 || offsetBytes + sizeBytes > this.sizeBytes) {
      const end = offsetBytes + sizeBytes;
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        `読み出し範囲 ${String(offsetBytes)}..${String(end)} がバッファ ${this.label} (${String(this.sizeBytes)} バイト) を超えています`,
      );
    }
    let out: ArrayBuffer;
    let hasUnmapped = false;
    this.mapped = true;
    try {
      await this.handle.mapAsync(MAP_MODE_READ, offsetBytes, sizeBytes);
      const src = new Uint8Array(this.handle.getMappedRange(offsetBytes, sizeBytes));
      out = src.slice().buffer;
      hasUnmapped = true;
    } finally {
      if (hasUnmapped) this.handle.unmap();
      this.mapped = false;
    }
    return out;
  }

  /**
   * バッファを破棄する。2 回呼んでも安全。
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
      throw new PlutoError(ErrorCode.InvalidState, `破棄済みのバッファ ${this.label} を使いました`);
    }
  }
}
