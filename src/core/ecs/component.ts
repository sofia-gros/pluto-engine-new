/**
 * @file コンポーネント定義 `defineComponent` と、Worker との ID 整合用のコンポーネント表 (docs/04-memory-and-ecs.md §3)。
 */
import { ErrorCode, PlutoError } from '../debug';
import type { ScalarType } from '../memory';
import type { ComponentSchema, FieldToken } from './schema';

/** コンポーネント数の上限。 */
export const MAX_COMPONENTS = 256;

/** コンポーネント ID (0 始まりの連番)。 */
export type ComponentId = number;

/** フィールド名に使えない名前 (定義オブジェクトのプロパティと衝突するため)。 */
const RESERVED_FIELD_NAMES = new Set(['id', 'name', 'fields']);

/**
 * 型引数を消したコンポーネント定義。World の API はこの型で受け取る。
 */
export interface AnyComponentDef {
  /** コンポーネント ID。 */
  readonly id: ComponentId;
  /** コンポーネント名 (一意)。 */
  readonly name: string;
  /** フィールドトークン (定義順)。 */
  readonly fields: readonly FieldToken[];
}

/** スキーマ付きのコンポーネント定義 (フィールド名でトークンを引ける)。 */
export type ComponentDef<S extends ComponentSchema> = AnyComponentDef & {
  readonly [K in keyof S]: FieldToken<S[K]>;
};

/** コンポーネント表の 1 要素 (Worker との ID 整合に使う)。 */
export interface ComponentLayoutEntry {
  /** コンポーネント名。 */
  readonly name: string;
  /** コンポーネント ID。 */
  readonly id: ComponentId;
  /** フィールド (定義順)。 */
  readonly fields: readonly {
    readonly name: string;
    readonly fieldId: number;
    readonly type: ScalarType;
  }[];
}

/** コンポーネント表 (ID 順)。 */
export type ComponentLayout = readonly ComponentLayoutEntry[];

/** 内部用: ID を書き換えられるフィールドトークン。 */
interface MutableFieldToken {
  fieldId: number;
  componentId: number;
  readonly type: ScalarType;
  readonly name: string;
}

/** 内部用: 定義本体と書き換え用の参照。 */
interface ComponentRecord {
  readonly def: {
    id: number;
    readonly name: string;
    readonly fields: readonly MutableFieldToken[];
  };
  readonly fields: MutableFieldToken[];
}

let nextComponentId = 0;
let nextFieldId = 0;
const registry: AnyComponentDef[] = [];
const byName = new Map<string, ComponentRecord>();

/** ID → コンポーネント定義の表 (コマンドの復元に使う)。 */
export const COMPONENT_REGISTRY: readonly AnyComponentDef[] = registry;

/**
 * コンポーネントを定義する。モジュールのトップレベルでのみ呼ぶ (動的定義は禁止)。
 * @param name コンポーネント名 (一意)
 * @param schema フィールド名 → スカラ型
 * @returns コンポーネント定義
 */
export function defineComponent<S extends ComponentSchema>(
  name: string,
  schema: S,
): ComponentDef<S> {
  if (nextComponentId >= MAX_COMPONENTS) {
    throw new PlutoError(
      ErrorCode.CapacityExceeded,
      'コンポーネント数が上限 (256) に達しました。コンポーネントをまとめてください。',
    );
  }
  if (byName.has(name)) {
    throw new PlutoError(
      ErrorCode.InvalidArgument,
      `コンポーネント名 '${name}' は既に使われています。名前は一意にしてください。`,
    );
  }
  for (const key of Object.keys(schema)) {
    if (RESERVED_FIELD_NAMES.has(key)) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        `コンポーネント ${name}: フィールド名 '${key}' は予約されています (id / name / fields は使えません)。`,
      );
    }
  }
  const componentId = nextComponentId++;
  const fields: MutableFieldToken[] = [];
  const def: Record<string, unknown> & ComponentRecord['def'] = { id: componentId, name, fields };
  for (const key of Object.keys(schema)) {
    const token: MutableFieldToken = {
      fieldId: nextFieldId++,
      componentId,
      type: schema[key],
      name: key,
    };
    fields.push(token);
    def[key] = token;
  }
  byName.set(name, { def, fields });
  const comp = def as ComponentDef<S>;
  registry[componentId] = comp;
  return comp;
}

/**
 * 現在のコンポーネント表を返す (メイン側。Worker の init で送る)。
 * @returns ID 順のコンポーネント表
 */
export function getComponentLayout(): ComponentLayout {
  return registry.map((c) => ({
    name: c.name,
    id: c.id,
    fields: c.fields.map((f) => ({ name: f.name, fieldId: f.fieldId, type: f.type })),
  }));
}

/**
 * コンポーネント表に合わせて、同名コンポーネントの ID とフィールド ID を書き換える (Worker 専用)。
 * フィールドトークンは同じオブジェクトのまま書き換わる。表に無いコンポーネントには、表と衝突しない新しい ID を振る。
 * @param layout メインのコンポーネント表
 */
export function applyComponentLayout(layout: ComponentLayout): void {
  let maxComponentId = -1;
  let maxFieldId = -1;
  const matched = new Set<string>();
  for (const entry of layout) {
    maxComponentId = Math.max(maxComponentId, entry.id);
    for (const f of entry.fields) maxFieldId = Math.max(maxFieldId, f.fieldId);
    const rec = byName.get(entry.name);
    if (rec === undefined) continue;
    const isSameShape =
      rec.fields.length === entry.fields.length &&
      rec.fields.every(
        (f, i) => f.name === entry.fields[i].name && f.type === entry.fields[i].type,
      );
    if (!isSameShape) {
      throw new PlutoError(
        ErrorCode.InvalidState,
        `コンポーネント ${entry.name} のフィールド構成がメインスレッドと Worker で異なります。`,
      );
    }
    rec.def.id = entry.id;
    rec.fields.forEach((f, i) => {
      f.fieldId = entry.fields[i].fieldId;
      f.componentId = entry.id;
    });
    matched.add(entry.name);
  }
  for (const [name, rec] of byName) {
    if (matched.has(name)) continue;
    rec.def.id = ++maxComponentId;
    for (const f of rec.fields) {
      f.fieldId = ++maxFieldId;
      f.componentId = rec.def.id;
    }
  }
  registry.length = 0;
  for (const rec of byName.values()) registry[rec.def.id] = rec.def;
  nextComponentId = maxComponentId + 1;
  nextFieldId = maxFieldId + 1;
}
