# T-1.7: アーキタイプ

## 目的

エンティティのコンポーネント構成（アーキタイプ）ごとにデータをSoA形式で格納するバッファの管理（Column, Archetype）と、コンポーネント追加/削除時のアーキタイプ遷移を管理するグラフ（ArchetypeGraph）を実装する。

## 編集・作成するファイル

- `src/core/ecs/column.ts`
- `src/core/ecs/archetype.ts`
- `src/core/ecs/archetype-graph.ts`
- `tests/unit/core/ecs/column.test.ts`
- `tests/unit/core/ecs/archetype.test.ts`
- `tests/unit/core/ecs/archetype-graph.test.ts`

## 実装ステップ

1. **column.ts**
   - `INITIAL_ARCHETYPE_ROWS = 1024`
   - `Column<T extends ScalarType>` クラスの実装。
   - `buffer-factory` の `createBackingBuffer` を使用して `TypedArray` を作成。
   - `grow(newRows)` メソッドでバッファを拡張（SharedArrayBuffer の場合はリサイズ不可なので初期最大サイズで確保される仕組みに合わせる。通常の ArrayBuffer なら作り直してコピー）。
2. **archetype.ts**
   - `Archetype` クラスの実装。
   - `id`, `mask` (Bitset 256bit), `entities` (Uint32Array), `count` の保持。
   - 初期化時に指定されたフィールド(FieldToken)に基づき `Column` を作成・保持。
   - `pushRow(entity)`: 容量を超えそうならすべての Column と `entities` を `grow()` して新規行番号を返す。
   - `swapRemove(row)`: `count - 1` 番目のデータを `row` 番目に移動させ `count--` する (O(1) 削除)。移動した Entity を返す（空になったら `NULL_ENTITY`）。
   - `copyRowTo(row, dstArchetype, dstRow)`: 共通するコンポーネントのフィールドデータをコピーする。
3. **archetype-graph.ts**
   - `ArchetypeGraph` クラス。
   - アーキタイプのID採番と保持 (`Map<string, Archetype>`)。キーは `Bitset` の 16進数文字列表現 (`mask.toString()` など)。
   - `(archetypeId, componentId, add|remove) -> nextArchetypeId` のエッジ遷移を `Map<number, number>` でキャッシュ (キー: `archetypeId * 512 + componentId * 2 + (add ? 1 : 0)`)。
4. **テスト作成**
   - Column: `grow` 時に既存データが保持されること。
   - Archetype: `pushRow`, `swapRemove` で要素が正しく移動・削除されること。`copyRowTo` の共通フィールドコピ－の確認。
   - ArchetypeGraph: コンポーネント追加・削除で正しいアーキタイプが取得・生成されること。エッジキャッシュの動作。

## 完了条件

1. `Column` と `Archetype` がデータ再配置 (grow) および `swapRemove` を正しく行えること。
2. GCを最小限に抑えるため、要素追加・削除時のバッファアロケーションが必要な `grow` 時以外に発生しないこと。
3. カバレッジ `core/ecs/**` 全体で lines 95% / branches 90% 以上であること。
4. ホットパスのルールに準拠していること。
