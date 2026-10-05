# T-1.8: クエリ・変更追跡

## 目的

エンティティデータに対するバッチ処理の単位であるチャンク (`ChunkView`)、条件に合致するアーキタイプを検索・キャッシュしてイテレーションする `Query`、およびコンポーネントデータの変更(dirty)を64行単位で追跡する `ChangeTracker` を実装する。

## 編集・作成するファイル

- `src/core/ecs/chunk-view.ts`
- `src/core/ecs/query.ts`
- `src/core/ecs/change-tracking.ts`
- `src/core/ecs/index.ts`
- `tests/unit/core/ecs/chunk-view.test.ts`
- `tests/unit/core/ecs/query.test.ts`
- `tests/unit/core/ecs/change-tracking.test.ts`

## 実装ステップ

1. **chunk-view.ts**
   - 定数 `CHUNK_ROWS = 16384`。
   - `ChunkView` クラスの実装。
   - プロパティ: `archetype`, `start`, `end`, `chunkIndex` (全アーキタイプ通しのインデックスではなく、そのアーキタイプ内でのチャンクインデックスとして管理するか、ジョブシステム側の要求に従うが、ここではアーキタイプ内のインデックスと見なすか後で確認。とりあえず引数で渡せるようにする)。
   - メソッド: `column(field)`, `entity(row)`。
   - `markDirty(field)`: このチャンク範囲全体をdirtyとしてマークする(ChangeTracker連携)。
2. **change-tracking.ts**
   - 定数 `DIRTY_BLOCK_ROWS = 64`。
   - `ChangeTracker` クラスの実装。
   - 各フィールド(列)ごとに、`Math.ceil(maxRows / 64)` ビット（つまり `Uint32Array` で管理。1要素 = 32ビット = 2048行）を保持。
   - メソッド: `markRange(fieldId, startRow, endRow)`、`forEachDirtyRange(fieldId, cb(startRow, endRow))`、`clear(fieldId)`。
   - ※Archetype内にフィールドごとのChangeTrackerを持たせるか、独立させるか。ドキュメントには `Archetypeのフィールドごとに Uint32Arrayの dirty ビット` とあるため、Archetypeと連携させる。
3. **query.ts**
   - 抽出条件 `QueryDesc` (`all?: AnyComponentDef[]`, `none?: AnyComponentDef[]`)。
   - `Query` クラスの実装。
   - マッチする `Archetype` の配列をキャッシュ。
   - `forEachChunk(cb)`: 内部で `ChunkView` インスタンスを使い回し、各アーキタイプの要素数に応じて `CHUNK_ROWS` ごとにチャンクを切り出しコールバックを呼ぶ (アロケーション0)。
4. **テスト作成**
   - 変更追跡ビットの正常なセット、クリア、範囲走査の確認。
   - クエリ条件によるアーキタイプのマッチングと、チャンクごとの正確な行分割の確認。
   - ホットパスにおけるオブジェクトアロケーション回避の確認。

## 完了条件

1. `Query` が要求されたコンポーネント構成を持つアーキタイプを正しく抽出し、`ChunkView` を用いて GC を発生させずにループできること。
2. `ChangeTracker` が64行単位でのdirty区間を正確に追跡・反復できること。
3. カバレッジ `core/ecs/**` で lines 95% / branches 90% 以上を維持していること。
4. ホットパスのルールに準拠していること (`forEachChunk` 等)。
