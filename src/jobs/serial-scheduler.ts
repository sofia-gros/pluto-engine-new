// @pluto-hot
/**
 * @file メインスレッドで全チャンクを順に実行するスケジューラ (docs/05-jobs-and-builds.md §3.1)。
 */
import { ChunkView, MAX_KERNEL_PARAMS } from '../core/ecs';
import type { KernelRef, Query } from '../core/ecs';
import { ErrorCode, PlutoError } from '../core/debug';
import type { KernelBuffers } from './kernel';
import { getKernelById } from './kernel-registry';
import type { KernelBufferKind, Scheduler } from './scheduler';

/**
 * 直列スケジューラ。Threaded と同じチャンク分割・同じ 64 要素の params で実行する (パリティのため)。
 */
export class SerialScheduler implements Scheduler {
  /** 並列度 (常に 1)。 */
  public readonly concurrency = 1;
  private readonly u32: Uint32Array[] = [];
  private readonly f32: Float32Array[] = [];
  private readonly i32: Int32Array[] = [];
  private readonly buffers: KernelBuffers = { u32: this.u32, f32: this.f32, i32: this.i32 };
  private readonly view = new ChunkView();
  private readonly params = new Float32Array(MAX_KERNEL_PARAMS);

  /** 直列実行では同期するものがない。 */
  public syncWorld(): void {
    // 共有メモリを使わないので何もしない
  }

  /**
   * 共有バッファを登録する。
   * @cold 初期化時のみ
   * @param kind 種類
   * @param slot スロット番号
   * @param array TypedArray
   */
  public registerBuffer(
    kind: KernelBufferKind,
    slot: number,
    array: Uint32Array | Float32Array | Int32Array,
  ): void {
    if (kind === 'u32' && array instanceof Uint32Array) this.u32[slot] = array;
    else if (kind === 'f32' && array instanceof Float32Array) this.f32[slot] = array;
    else if (kind === 'i32' && array instanceof Int32Array) this.i32[slot] = array;
    else
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        `registerBuffer: kind '${kind}' と配列の型が一致しません。`,
      );
  }

  /**
   * クエリの全チャンクにカーネルを実行する。
   * @hot
   * @param kernel カーネル
   * @param query 対象クエリ
   * @param params パラメータ (長さ ≤ 64)
   */
  public runKernel(kernel: KernelRef, query: Query, params: Float32Array): void {
    if (params.length > MAX_KERNEL_PARAMS) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        'runKernel: params は 64 要素以下にしてください。',
      );
    }
    const def = getKernelById(kernel.id);
    const p = this.params;
    p.fill(0);
    p.set(params);
    const chunks = query.chunkCount();
    for (let i = 0; i < chunks; i++) {
      query.getChunk(i, this.view);
      def.fn(this.view, p, this.buffers);
    }
  }

  /** 解放するものがない。 */
  public dispose(): void {
    // Worker を持たないので何もしない
  }
}
