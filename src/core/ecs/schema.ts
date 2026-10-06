/**
 * @file コンポーネントスキーマとフィールドトークンの型 (docs/04-memory-and-ecs.md §3.1)。
 */
import type { ScalarType } from '../memory';

/** コンポーネントのスキーマ (フィールド名 → スカラ型)。フィールドなし = タグ。 */
export type ComponentSchema = Readonly<Record<string, ScalarType>>;

/**
 * コンポーネント内の 1 フィールドを指すトークン。カラムの取得に使う。
 */
export interface FieldToken<T extends ScalarType = ScalarType> {
  /** 全コンポーネント通しのフィールド連番。 */
  readonly fieldId: number;
  /** 所属コンポーネントの ID。 */
  readonly componentId: number;
  /** フィールドのスカラ型。 */
  readonly type: T;
  /** フィールド名。 */
  readonly name: string;
}
