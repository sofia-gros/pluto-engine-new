/**
 * @file スケジューラのインターフェース (docs/05-jobs-and-builds.md §3)。core/ecs の `KernelExecutor` を満たす。
 */
import type { KernelExecutor, KernelRef, Query, World } from '../core/ecs';

/** 共有バッファの種類。 */
export type KernelBufferKind = 'u32' | 'f32' | 'i32';

/**
 * カーネルをチャンク単位で実行するスケジューラ。
 */
export interface Scheduler extends KernelExecutor {
  /** 並列実行に使うスレッド数 (メイン含む)。Serial は 1。 */
  readonly concurrency: number;
  /**
   * ワーカーへ World の共有メモリ情報を同期する (World が structureVersion の変化時に呼ぶ)。
   * @param world 対象の World
   */
  syncWorld(world: World): void;
  /**
   * カーネル用共有バッファを登録する (初期化時のみ)。
   * @param kind 種類
   * @param slot スロット番号 (`KernelBufferSlot`)
   * @param array TypedArray (parallel では SharedArrayBuffer 上)
   */
  registerBuffer(
    kind: KernelBufferKind,
    slot: number,
    array: Uint32Array | Float32Array | Int32Array,
  ): void;
  /**
   * クエリの全チャンクにカーネルを実行し、完了まで戻らない。
   * @param kernel カーネル (ID でレジストリから引く)
   * @param query 対象クエリ
   * @param params パラメータ (長さ ≤ 64、`params[0]` = dt)
   */
  runKernel(kernel: KernelRef, query: Query, params: Float32Array): void;
  /** ワーカーを終了する。 */
  dispose(): void;
}
