/**
 * @file コンソール出力をラップするロガー。
 */

/**
 * ログレベル。
 */
export const LogLevel = {
  Debug: 0,
  Info: 1,
  Warn: 2,
  Error: 3,
  None: 4,
} as const;

/** {@link LogLevel} の値の型。 */
export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

/**
 * レベル付きロガー。エンジン内で `console` を直接使ってよいのはこのクラスだけ。
 */
class Logger {
  /** 出力する最小レベル (既定: debug ビルドは Debug、release は Warn)。 */
  public level: LogLevel = __DEBUG__ ? LogLevel.Debug : LogLevel.Warn;

  /**
   * デバッグ情報を出力する。
   * @param args 出力する値
   */
  public debug(...args: unknown[]): void {
    if (this.level <= LogLevel.Debug) {
      console.debug('[Pluto:DEBUG]', ...args);
    }
  }

  /**
   * 情報を出力する。
   * @param args 出力する値
   */
  public info(...args: unknown[]): void {
    if (this.level <= LogLevel.Info) {
      console.info('[Pluto:INFO]', ...args);
    }
  }

  /**
   * 警告を出力する。
   * @param args 出力する値
   */
  public warn(...args: unknown[]): void {
    if (this.level <= LogLevel.Warn) {
      console.warn('[Pluto:WARN]', ...args);
    }
  }

  /**
   * エラーを出力する。
   * @param args 出力する値
   */
  public error(...args: unknown[]): void {
    if (this.level <= LogLevel.Error) {
      console.error('[Pluto:ERROR]', ...args);
    }
  }
}

/**
 * グローバルロガーインスタンス。
 */
export const logger = new Logger();
