/**
 * @file コンポーネント定義。
 */

import { PlutoError, ErrorCode } from '../debug/pluto-error';
import type { ScalarType } from '../memory/scalar-type';
import type { FieldToken } from './schema';

export const MAX_COMPONENTS = 256;

let nextComponentId = 0;
let nextFieldId = 0;

export type ComponentSchema = Record<string, ScalarType>;

export interface AnyComponentDef {
  readonly id: number;
  readonly name: string;
  readonly fields: readonly FieldToken[];
}

export type ComponentDef<S extends ComponentSchema> = AnyComponentDef & {
  readonly [K in keyof S]: FieldToken<S[K]>;
};

export const COMPONENT_REGISTRY: AnyComponentDef[] = [];

/**
 * 新しいコンポーネントを定義する。
 * @param name コンポーネント名
 * @param schema スキーマ定義
 * @returns コンポーネント定義
 */
export function defineComponent<S extends ComponentSchema>(
  name: string,
  schema: S,
): ComponentDef<S> {
  if (nextComponentId >= MAX_COMPONENTS) {
    throw new PlutoError(ErrorCode.CapacityExceeded, 'コンポーネントの最大数に達しました');
  }

  const componentId = nextComponentId++;
  const fields: FieldToken[] = [];
  const tokens = {} as { [K in keyof S]: FieldToken<S[K]> };

  for (const key of Object.keys(schema)) {
    const type = schema[key] as S[keyof S];
    const fieldToken: FieldToken<S[keyof S]> = {
      fieldId: nextFieldId++,
      componentId,
      type,
      name: key,
    };
    fields.push(fieldToken);
    tokens[key as keyof S] = fieldToken;
  }

  const base = {
    id: componentId,
    name,
    fields,
  };

  const comp = Object.assign(base, tokens);
  COMPONENT_REGISTRY[componentId] = comp;
  return comp;
}
