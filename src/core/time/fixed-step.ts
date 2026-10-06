// @pluto-hot
/**
 * @file 固定タイムステップのアキュムレータ。
 */

import { logger } from '../debug';

/**
 * 物理演算などのための固定タイムステップアキュムレータ。
 */
export class FixedStepper {
  /** 1 ステップの長さ (ミリ秒)。 */
  public readonly stepMs: number;
  /** 1 フレームで実行する最大ステップ数。 */
  public readonly maxSteps: number;
  private accumulator: number;

  /**
   * @param stepMs 1ステップあたりのミリ秒数
   * @param maxSteps 1フレームでの最大実行回数 (Spiral of Death 回避のため)
   */
  public constructor(stepMs: number, maxSteps = 10) {
    this.stepMs = stepMs;
    this.maxSteps = maxSteps;
    this.accumulator = 0;
  }

  /**
   * 蓄積された時間に基づいてコールバックを複数回実行する。
   * @hot
   * @param dtMs 経過時間 (ミリ秒)
   * @param callback 実行するコールバック (dtMs を受け取る)
   * @returns 実行されたステップ数
   */
  public update(dtMs: number, callback: (dt: number) => void): number {
    this.accumulator += dtMs;
    let steps = 0;

    while (this.accumulator >= this.stepMs) {
      if (steps >= this.maxSteps) {
        // Spiral of Death 回避のため、超過分を破棄して終了
        logger.warn(
          'FixedStepper: 最大ステップ数を超過しました。残りの時間を破棄します。maxSteps =',
          this.maxSteps,
        );
        this.accumulator %= this.stepMs;
        break;
      }

      callback(this.stepMs);
      this.accumulator -= this.stepMs;
      steps++;
    }

    return steps;
  }

  /**
   * アキュムレータをリセットする。
   */
  public reset(): void {
    this.accumulator = 0;
  }
}
