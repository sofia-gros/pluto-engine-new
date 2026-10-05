/**
 * @file コンポーネントのスキーマとフィールド定義。
 */

import type { ScalarType } from '../memory/scalar-type';

/**
 * 1つのコンポーネント内の特定のフィールドを指し示すトークン。
 */
export interface FieldToken<T extends ScalarType = ScalarType> {
  readonly fieldId: number;
  readonly componentId: number;
  readonly type: T;
  readonly name: string;
}
