# T-1.6: エンティティ・コンポーネント

## 目的

SoA ECS (Entity Component System) の最も基礎となるエンティティの表現、エンティティの生存状態を管理するテーブル、およびコンポーネント（スキーマ）定義の仕組みを実装する。

## 編集・作成するファイル

- `src/core/ecs/index.ts`
- `src/core/ecs/entity.ts`
- `src/core/ecs/entity-table.ts`
- `src/core/ecs/schema.ts`
- `src/core/ecs/component.ts`
- ユニットテスト (`tests/unit/core/ecs/entity.test.ts`, `entity-table.test.ts`, `component.test.ts`)

## 実装ステップ

1. **entity.ts**
   - `Entity` 型 (`number & { readonly __brand: 'Entity' }`)
   - `ENTITY_INDEX_BITS`, `ENTITY_INDEX_MASK`, `ENTITY_GENERATION_MASK`, `MAX_ENTITIES`, `NULL_ENTITY`
   - `makeEntity(index, generation)`, `entityIndex(e)`, `entityGeneration(e)`
   - （ビット演算には `>>> 0` や `| 0` を使用し符号なし32bit整数として扱うこと）
2. **entity-table.ts**
   - `EntityTable` クラス
   - `archetypeIds`, `rows`, `generations` の `Uint16Array` / `Uint32Array` を持つ
   - `core/memory/free-list` または同等の仕組みを使って index をリサイクルする
   - `create()`: 新しい Entity を発行 (generation を進めるか、新規インデックスを発行)
   - `destroy(e)`: Entity を破棄 (インデックスをフリーリストに戻し、generation を `+1 & mask` する)
   - `isAlive(e)`: `index < capacity` かつ `generations[index] === entityGeneration(e)` かつ `archetypeIds[index] !== 0xFFFF` (または同等の生存フラグ) を確認
   - `getArchetype(e)`, `getRow(e)`, `update(e, archetypeId, row)` などの操作
3. **schema.ts / component.ts**
   - `FieldToken<T>` インターフェースの定義 (フィールドに一意の `fieldId` を振る)
   - `defineComponent(name, schema)`: MAX_COMPONENTS = 256
   - 内部で `ComponentId` をグローバルに採番 (0から始まり255まで)
   - タグコンポーネント (フィールドなし) にも対応
4. **テスト作成**
   - ビット演算が境界値で正しく動くか (index 0, index max, gen 0, gen max)
   - `EntityTable` の生成と破棄、再利用時の generation インクリメントと `isAlive` 判定
   - コンポーネント定義と ID 割り当ての仕様確認
5. カバレッジとLintチェック。

## 完了条件

1. 仕様書の定数名・値・型と完全一致すること（`Entity`, `ENTITY_INDEX_BITS`, `makeEntity` 等）。
2. `EntityTable` が SoA 形式の TypedArray でデータ管理し、ガベージコレクションを発生させないこと。
3. ユニットテストにより正常系・境界値・異常系が網羅されていること。
4. カバレッジ `core/ecs/**` が lines 95% / branches 90% 以上であること。
5. HOT ファイル指定（あれば）のルールに従っていること。
