/**
 * @file 時間計測用インターフェースと実装。
 */

/**
 * 時間を取得するインターフェース。
 * 決定論的なテストのために、生のパフォーマンスタイマーをラップする。
 */
export interface Clock {
  /**
   * 現在の時間をミリ秒単位で返す。
   * @returns 時間 (ミリ秒)
   */
  now(): number;
}

/**
 * 実際の performance.now() を使用する Clock の実装。
 */
export class PerformanceClock implements Clock {
  public now(): number {
    return globalThis.performance.now();
  }
}

/**
 * テスト用の手動 Clock。
 * 時間を任意に進めることができる。
 */
export class ManualClock implements Clock {
  private currentTime: number;

  /**
   * @param initialTime 初期時間 (ミリ秒)
   */
  public constructor(initialTime = 0) {
    this.currentTime = initialTime;
  }

  public now(): number {
    return this.currentTime;
  }

  /**
   * 時間を前進させる。
   * @param ms 進める時間 (ミリ秒)
   */
  public advance(ms: number): void {
    if (ms > 0) {
      this.currentTime += ms;
    }
  }
}
