/**
 * @file デバッグ用のアサーション関数
 */

/**
 * 条件が満たされていることを表明する。満たされていない場合は例外を投げる。
 * __DEBUG__ ビルドでのみ評価される。
 *
 * @param condition 満たされるべき条件
 * @param message 条件が満たされなかった場合のエラーメッセージ
 */
export function assert(condition: boolean, message: string): asserts condition {
  if (__DEBUG__ && !condition) {
    throw new Error(message);
  }
}

/**
 * 到達不可能コードであることを表明する。
 * switch 文の exhaustive check などに使用する。
 *
 * @param value 到達不可能な値
 * @returns 決して戻らない
 */
export function unreachable(value: never): never {
  throw new Error(`Unreachable: ${String(value)}`);
}
