/**
 * @file エラーコードと PlutoError クラスの定義。
 */

/**
 * Pluto Engine のエラーコード。
 */
export const ErrorCode = {
  InvalidArgument: 'E_INVALID_ARGUMENT',
  CapacityExceeded: 'E_CAPACITY_EXCEEDED',
  NotInitialized: 'E_NOT_INITIALIZED',
  AssetNotFound: 'E_ASSET_NOT_FOUND',
  AssetLoadFailed: 'E_ASSET_LOAD_FAILED',
  GpuUnavailable: 'E_GPU_UNAVAILABLE',
  GpuDeviceLost: 'E_GPU_DEVICE_LOST',
  ShaderCompileFailed: 'E_SHADER_COMPILE_FAILED',
  UnsupportedFeature: 'E_UNSUPPORTED_FEATURE',
  InvalidState: 'E_INVALID_STATE',
} as const;

/** {@link ErrorCode} の値の型。 */
export type ErrorCode = (typeof ErrorCode)[keyof typeof ErrorCode];

/**
 * Pluto Engine 専用のエラークラス。
 * エンジン内部の例外はすべてこのクラスを使用する。
 */
export class PlutoError extends Error {
  /**
   * エラーコード。
   */
  public readonly code: ErrorCode;

  /**
   * PlutoError を構築する。
   * @param code エラーコード
   * @param message 日本語のエラーメッセージ
   */
  public constructor(code: ErrorCode, message: string) {
    super(`[${code}] ${message}`);
    this.name = 'PlutoError';
    this.code = code;

    // V8 のスタックトレースからコンストラクタ自身を除外する
    Error.captureStackTrace(this, PlutoError);
  }
}
