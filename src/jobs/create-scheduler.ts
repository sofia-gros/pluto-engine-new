/**
 * @file 実装を選ぶ唯一の場所 (docs/05-jobs-and-builds.md §3.4)。
 * parallel ビルドかつ crossOriginIsolated のときだけ並列スケジュラを生成し、それ以外は直列に縮退する。
 */
import { logger } from '../core/debug';
import type { Scheduler } from './scheduler';
import { SerialScheduler } from './serial-scheduler';
import { ThreadedScheduler } from './threaded-scheduler';

/**
 * 初期化時に適切なスケジューラを生成して返す。
 * @param config スケジューラの設定 (Worker 数の上限)
 * @returns Serial または Threaded のスケジューラ
 */
export function createScheduler(config: { maxWorkers?: number } = {}): Scheduler {
  if (__PARALLEL__) {
    if (globalThis.crossOriginIsolated) {
      return new ThreadedScheduler(config);
    }
    logger.warn(
      'crossOriginIsolated ではないため直列実行に縮退します。COOP/COEP ヘッダを設定してください。',
    );
  }
  return new SerialScheduler();
}
