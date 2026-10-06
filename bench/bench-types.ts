/**
 * @file ベンチマークの型 (docs/10-testing-strategy.md §5)。
 */

/** バックエンド名。 */
export type BenchBackend = 'webgpu' | 'webgl2';
/** ビルド名。 */
export type BenchBuild = 'parallel' | 'embed';

/** シーンに渡す計測コンテキスト。 */
export interface BenchContext {
  /** 要求されたバックエンド。 */
  readonly backend: BenchBackend;
  /** 実際のビルド (`__PARALLEL__` から判定)。 */
  readonly build: BenchBuild;
  /** 描画先 (1920×1080)。 */
  readonly canvas: HTMLCanvasElement;
  /** 単発処理の計測値 (ms)。キーは camelCase で末尾を `Ms` にする。 */
  readonly metrics: Record<string, number>;
  /**
   * 毎フレームの計測値を記録する。終了時に `${name}P50Ms` と `${name}P99Ms` として metrics に入る。
   * 判定に使うのは P50 である (docs/04 §10)。P99 は外れ値を把握するための参考値。
   * @param name 名前
   * @param ms 値 (ミリ秒)
   */
  sample(name: string, ms: number): void;
  /**
   * 現在時刻 (ミリ秒)。bench は src ではないので performance.now() を使ってよい。
   * @returns 時刻
   */
  now(): number;
}

/** ベンチシーン (`bench/scenes/*.ts` が `scene` として export する)。 */
export interface BenchScene {
  /** シーン名 (ファイル名と同じ)。 */
  readonly name: string;
  /** `--count` 省略時の個数。 */
  readonly defaultCount: number;
  /**
   * 準備 (計測対象外。単発処理はここで metrics に記録する)。
   * @param ctx コンテキスト
   * @param count 個数
   */
  setup(ctx: BenchContext, count: number): void | Promise<void>;
  /**
   * 1 フレームの処理 (CPU 時間は cpuMs として計測される)。
   * @param frame フレーム番号
   */
  step?(frame: number): void;
}

/** 1 回の計測結果。 */
export interface BenchResult {
  /** シーン名。 */
  readonly scene: string;
  /** バックエンド。 */
  readonly backend: BenchBackend;
  /** ビルド。 */
  readonly build: BenchBuild;
  /** 個数。 */
  readonly count: number;
  /** crossOriginIsolated だったか (parallel の確認用)。 */
  readonly crossOriginIsolated: boolean;
  /** フレーム時間の平均 (ms)。 */
  readonly meanMs: number;
  /** フレーム時間の中央値 (ms)。 */
  readonly p50Ms: number;
  /** フレーム時間の p99 (ms)。 */
  readonly p99Ms: number;
  /** step の CPU 時間の p99 (ms)。 */
  readonly cpuMs: number;
  /** step の CPU 時間の中央値 (ms)。判定に使う。 */
  readonly cpuP50Ms: number;
  /** GPU パス合計の p99 (ms)。timestamp-query がある場合のみ。 */
  readonly gpuMs?: number;
  /** 単発処理・サンプルの計測値 (ms)。 */
  readonly metrics?: Readonly<Record<string, number>>;
}
