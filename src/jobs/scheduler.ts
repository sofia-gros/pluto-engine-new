/**
 * @file ジョブスケジューラのインターフェース定義。
 */

import type { World } from '../core/ecs/world';
import type { Query } from '../core/ecs/query';
import type { KernelDef } from './kernel';

/**
 * ジョブスケジューラ。
 * カーネルの実行や共有バッファの登録、Worldの同期を行う。
 */
export interface Scheduler {
  /**
   * 並列実行に使うスレッド数 (メイン含む)。
   * 直列実行 (SerialScheduler) の場合は常に 1。
   */
  readonly concurrency: number;

  /**
   * ワーカーへ World の共有メモリ情報を同期する。
   * (アーキタイプ・クエリの新規作成後に World が呼ぶ)。
   *
   * @param world 同期する World インスタンス。
   */
  syncWorld(world: World): void;

  /**
   * カーネル用共有バッファを登録する (初期化時のみ)。
   *
   * @param kind バッファの種類 (u32, f32, i32)。
   * @param slot バッファのスロット番号 (`KernelBufferSlot` などの定数)。
   * @param array 登録する TypedArray インスタンス。
   */
  registerBuffer(
    kind: 'u32' | 'f32' | 'i32',
    slot: number,
    array: Uint32Array | Float32Array | Int32Array,
  ): void;

  /**
   * クエリの全チャンクに対してカーネルを実行し、完了まで戻らない。
   *
   * @param kernel 実行するカーネルの定義。
   * @param query 実行対象のエンティティを絞り込むクエリ。
   * @param params カーネルに渡すパラメータ配列 (最大 MAX_KERNEL_PARAMS = 64 要素)。
   */
  runKernel(kernel: KernelDef, query: Query, params: Float32Array): void;

  /**
   * ワーカーなどを終了し、リソースを解放する。
   */
  dispose(): void;
}
