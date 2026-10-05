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

export type LogLevel = (typeof LogLevel)[keyof typeof LogLevel];

class Logger {
  public level: LogLevel = __DEBUG__ ? LogLevel.Debug : LogLevel.Warn;

  public debug(...args: unknown[]): void {
    if (this.level <= LogLevel.Debug) {
      console.debug('[Pluto:DEBUG]', ...args);
    }
  }

  public info(...args: unknown[]): void {
    if (this.level <= LogLevel.Info) {
      console.info('[Pluto:INFO]', ...args);
    }
  }

  public warn(...args: unknown[]): void {
    if (this.level <= LogLevel.Warn) {
      console.warn('[Pluto:WARN]', ...args);
    }
  }

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
