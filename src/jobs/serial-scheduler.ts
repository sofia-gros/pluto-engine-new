// @pluto-hot
/**
 * @file 直列実行用スケジューラの実装。
 */

import type { Scheduler } from './scheduler';

import type { Query } from '../core/ecs/query';
import type { KernelDef, KernelBuffers } from './kernel';
import { ChunkView } from '../core/ecs/chunk-view';

/**
 * シングルスレッドで同期的にカーネルを実行するスケジューラ。
 */
export class SerialScheduler implements Scheduler {
  public readonly concurrency = 1;

  private readonly u32Buffers: Uint32Array[] = [];
  private readonly f32Buffers: Float32Array[] = [];
  private readonly i32Buffers: Int32Array[] = [];

  private readonly buffers: KernelBuffers = {
    u32: this.u32Buffers,
    f32: this.f32Buffers,
    i32: this.i32Buffers,
  };

  private readonly view = new ChunkView();

  /**
   * World の状態を同期する (直列実行のため何もしない)。
   */
  public syncWorld(): void {
    // 処理なし
  }

  /**
   * 共有バッファを登録する。
   *
   * @param kind バッファの種類。
   * @param slot バッファのスロット番号。
   * @param array 登録する TypedArray インスタンス。
   */
  public registerBuffer(
    kind: 'u32' | 'f32' | 'i32',
    slot: number,
    array: Uint32Array | Float32Array | Int32Array,
  ): void {
    if (kind === 'u32') {
      this.u32Buffers[slot] = array as Uint32Array;
    } else if (kind === 'f32') {
      this.f32Buffers[slot] = array as Float32Array;
    } else {
      this.i32Buffers[slot] = array as Int32Array;
    }
  }

  /**
   * カーネルを実行する。
   *
   * @param kernel 実行するカーネル定義。
   * @param query 実行対象のエンティティを含むクエリ。
   * @param params カーネルパラメータ。
   */
  public runKernel(kernel: KernelDef, query: Query, params: Float32Array): void {
    const chunks = query.chunkCount();
    for (let i = 0; i < chunks; i++) {
      query.getChunk(i, this.view);
      kernel.fn(this.view, params, this.buffers);
    }
  }

  /**
   * リソースを解放する。
   */
  public dispose(): void {
    // 処理なし
  }
}
