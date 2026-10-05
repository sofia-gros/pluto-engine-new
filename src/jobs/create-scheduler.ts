/**
 * @file 初期化時に適切なスケジューラを選択・生成する関数。
 */

import { logger } from '../core/debug/logger';
import type { Scheduler } from './scheduler';
import { SerialScheduler } from './serial-scheduler';
import { ThreadedScheduler } from './threaded-scheduler';

/**
 * 環境やビルドフラグに応じて、並列または直列のスケジューラを生成して返します。
 *
 * @param config スケジューラのオプション設定（Worker数など）
 * @returns Scheduler インターフェースを満たすインスタンス
 */
export function createScheduler(config: { maxWorkers?: number } = {}): Scheduler {
  if (__PARALLEL__) {
    if (globalThis.crossOriginIsolated) {
      return new ThreadedScheduler(config);
    }
    logger.warn(
      'crossOriginIsolated ではないため並列実行に縮退します。COOP/COEP ヘッダを設定してください。',
    );
  }
  return new SerialScheduler();
}
