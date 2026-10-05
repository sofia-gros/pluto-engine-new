/**
 * @file デバッグ用のアサーション関数。
 */
import { PlutoError, ErrorCode } from './pluto-error';

/**
 * 条件が満たされることを表明する。満たされない場合は例外を投げる。
 * __DEBUG__ ビルドでのみ評価される。
 *
 * @param condition 評価する条件
 * @param message 満たされない場合のエラーメッセージ
 */
export function assert(condition: boolean, message: string): asserts condition {
  if (__DEBUG__ && !condition) {
    throw new PlutoError(ErrorCode.InvalidState, message);
  }
}

/**
 * 到達不可能なコードパスであることを表明する。
 * switch 文の exhaustive check などに使用する。
 *
 * @param value 到達不可能な値
 * @returns 決して戻らない
 */
export function unreachable(value: never): never {
  throw new PlutoError(ErrorCode.InvalidState, `Unreachable: ${String(value)}`);
}
