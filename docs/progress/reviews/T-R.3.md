# レビュー記録: T-R.3 core の是正

## チェックリスト結果

- [x] `AGENTS.md` §3 の禁止事項を破っていない: 変更は `src/core/**`、`tests/unit/core/**`、`src/lowlevel.ts`、docs (04 / 05 / 02 / 03 / 12)、`tools/lib/hot-rules.mjs` (検査の誤検出の修正) のみ。新規の src ファイルなし
- [x] 02 に無いファイルを追加していない: 新規は `tests/unit/core/ecs/system.test.ts`、`tests/unit/core/memory/scalar-type.test.ts` (必須テスト)
- [x] チェックを弱めていない: テストの期待値を変えたのは仕様を変更した 2 箇所だけ。1 つは `growBackingBuffer` の同サイズ許容 (04 §1.1)、もう 1 つは half の仕様化 (近似比較からビット一致に強化)
- [x] R1: `as unknown as` / `any` / `!` なし (check-rules で 0 件)。公開シンボルに日本語 JSDoc あり (check-rules で 0 件)
- [x] R2: HOT ファイルの違反 0 件 (check-rules)。初期化専用の関数には `@cold` を付けた
- [x] R3: core の import はすべて index.ts 経由 (check-boundaries で core の違反 0 件)
- [ ] `pnpm verify` 成功: Phase R の規定により失敗を許容。残る失敗はすべて jobs / bench (T-R.4 / T-R.5)
- [x] ロードマップ T-R.3 の受け入れ条件: 下記

## 仕様との対応表 (Phase 1 共通条件 1)

| 仕様                                                                                                                                                       | 実装                                                                                                  |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- |
| 04 §1.1 `createBackingBuffer` / `growBackingBuffer` (同サイズは何もしない) / `isSharedMemoryEnabled`                                                       | `core/memory/buffer-factory.ts`                                                                       |
| 04 §1.1 「伸長時に新しいバッファを作らない」                                                                                                               | `Column.grow`・`Archetype.growTo` が `growBackingBuffer` を使い、length-tracking ビューを作り直さない |
| 04 §1.2 `ScalarType` (F32:0 〜 U8:6)、`SCALAR_BYTES`、`TypedArrayOf`                                                                                       | `core/memory/scalar-type.ts`                                                                          |
| 04 §2.1 `ENTITY_INDEX_BITS = 22`、`ENTITY_INDEX_MASK = 0x3fffff`、`ENTITY_GENERATION_MASK = 0x3ff`、`MAX_ENTITIES = 4194303`、`NULL_ENTITY = 0xFFFFFFFF`   | `core/ecs/entity.ts`                                                                                  |
| 04 §2.2 EntityTable (`archetypeIds: Uint16Array` で `0xFFFF` = 未使用、`rows`、`generations`、FreeList、isAlive の 3 条件)                                 | `core/ecs/entity-table.ts`                                                                            |
| 04 §3.1 `defineComponent`・`MAX_COMPONENTS = 256`・`FieldToken`・予約フィールド名・`AnyComponentDef`                                                       | `core/ecs/component.ts`, `schema.ts`                                                                  |
| 04 §4.1 `INITIAL_ARCHETYPE_ROWS = 1024`、2 倍伸長、`maxRows` 上限                                                                                          | `core/ecs/column.ts`                                                                                  |
| 04 §4.2 `Archetype` (`id`・`mask`・`entities`・`count`・`getColumn`・`hasComponent`・`pushRow`・`swapRemove`・`copyRowTo`・`fromShared`)、pushRow で dirty | `core/ecs/archetype.ts`                                                                               |
| 04 §4.3 エッジキー `archetypeId * 512 + componentId * 2 + add`、16 進マスクキー、ID → 配列                                                                 | `core/ecs/archetype-graph.ts`                                                                         |
| 04 §5.1〜5.3 `CHUNK_ROWS = 16384`、`ChunkView` (`chunkIndex` は通し番号)、Query (1 回だけ登録・正規形キャッシュキー・`getChunk`)                           | `core/ecs/chunk-view.ts`, `query.ts`                                                                  |
| 04 §6 `DIRTY_BLOCK_ROWS = 64`、`markRange` / `forEachDirtyRange(fieldId, rowCount, cb)` / `clear`、backing buffer 上                                       | `core/ecs/change-tracking.ts`                                                                         |
| 04 §7.1 CommandBuffer (u32 語数、容量チェック → index 予約の順、`spawn1` / `spawnN`)                                                                       | `core/ecs/command-buffer.ts`                                                                          |
| 04 §8 `Phase` (0〜4)、`KernelRef`・`KernelExecutor`・`SystemDef` (`params` 含む)、`MAX_KERNEL_PARAMS = 64`                                                 | `core/ecs/system.ts`                                                                                  |
| 04 §9 `WorldConfig` の既定 (1,048,576 / maxEntities / 1,048,576)、`isIterating` (getter)、`setExecutor`、`structureVersion`、`NULL_ENTITY` による移動判定  | `core/ecs/world.ts`                                                                                   |
| 02 §6 half の API (`f32ToF16` / `f16ToF32` / `packHalf2x16(lo, hi)`、最近接偶数)                                                                           | `core/math/half.ts`                                                                                   |

## 実装中に決めたこと (docs に反映済み)

- **`AnyComponentDef` を API の型に**: 型引数なしの `ComponentDef` は、TypeScript で全コンポーネントの共通型にできない (インデックスシグネチャと `id: number` が衝突する)。04 §3.1・§9 の記述を `AnyComponentDef` に改めた。
- **`pushRow` で追加した行を dirty にする**: そうしないと spawn 直後のスプライトがパックされない (04 §4.2)。
- **`MAX_KERNEL_PARAMS` の定義場所**: `core/ecs/system.ts` で定義し、jobs から再公開する。ecs は jobs を import できないため (05 §2)。
- **spawn の経路**: 空アーキタイプからの遷移 (エッジのキャッシュ) を辿り、spawn ごとの文字列キー生成を避けた。
- **HOT 検査の修正** (`tools/lib/hot-rules.mjs`, 03 §10): 初期化処理の中のクロージャと `throw new` (エラー経路) を対象外にした。トップレベルで宣言した関数の本体は検査対象のまま。検出テスト 62/62 件 (新しい 3 ケースを含む)。
- **ロードマップの誤りを訂正**:
  - T-R.3 条件 3 の「6.1e-5 は 0x0400 に丸まる」は誤りで、正しくは 0x03FF (後述の計算結果)。
  - `check-bundle` の parallel 検査は `createScheduler` ができる T-2.3 まで通らない (T-R.3 条件 6・T-R.4 条件 4 を修正)。

## 受け入れ条件の確認

1. **Phase 1 共通条件**: 対応表は上記のとおり。各公開関数の正常系・境界値・異常系 (`PlutoError`) のテストを追加した (ECS は全ファイルを書き直し、`system.test.ts` と `scalar-type.test.ts` を新規作成)。カバレッジ (`pnpm test:coverage`) は次のとおりで、閾値 95/90 を満たす。

   | 範囲        | lines  | branches |
   | ----------- | ------ | -------- |
   | core/ecs    | 99.23% | 96.55%   |
   | core/math   | 99.53% | 91.93%   |
   | core/memory | 99.00% | 94.87%   |
   | core/debug  | 100%   | 92.85%   |
   | core/events | 100%   | 95.83%   |
   | 全体        | 98.33% | 95.35%   |

   テストは 35 ファイル / 181 件すべて成功。

2. **回帰テスト** (`tests/unit/core/ecs/world.test.ts`・`archetype.test.ts`):
   - 「クエリ作成後に 1,000 体 spawn しても件数とチャンク数が正しい」: `archetypes` 1 件 / count 1000 / chunkCount 1
   - 「最初の個体 makeEntity(0, 0) が swap-remove で移動しても正しい行を読む」
   - 「INITIAL_ARCHETYPE_ROWS を超えて伸長しても、伸長前に取ったビューで伸長後の行が読める」
   - いずれも成功。
3. **half**: 期待値は Python 標準の `struct` (`'<e'`、IEEE 754 binary16、最近接偶数丸め) で、f32 に丸めた値から独立に計算した。
   ```
   0.0→0x0 / -0.0→0x8000 / 1.0→0x3c00 / -2.0→0xc000 / 65504→0x7bff / 65519→0x7bff / 65520→0x7c00
   6.1e-05→0x3ff / 2^-14→0x400 / 2^-24→0x1 / 2^-25→0x0 / 1.5*2^-25→0x1 / 2^-26→0x0 / 2^-110→0x0
   1+2^-10→0x3c01 / 1+2^-11→0x3c00 / 1+3*2^-11→0x3c02 / inf→0x7c00 / -inf→0xfc00
   ```
   `half.test.ts` で、この表との一致と、f16 → f32 → f16 の全 65536 パターンのビット一致 (NaN は NaN のまま) を確認した。旧実装は 2^-110 で誤った値になり、丸めも切り捨てだった。
4. **rng**: Vigna の参照実装 (`xoshiro128starstar.c`) を Python に書き写し、splitmix32 によるシード展開と組み合わせて参照列を計算した。書き写しの正しさは、状態 {1,2,3,4} の出力が公知の参照値 `11520, 0, 5927040, 70819200, 2031721883, …` と一致することで確認した。シード 12345 と 0 の先頭 8 個が一致することを `rng.test.ts` で確認。
5. **検査**: `check-structure` は全体で OK。`check-boundaries` と `check-rules` で `src/core/**`・`tests/unit/core/**` の違反は 0 件 (残りはすべて `src/jobs/**`・`bench/**`)。lint も全体で 0 件。
6. **ビルド**: `pnpm build` の parallel / embed / debug / 型定義のビルドはすべて成功した (`pluto-error.ts` の型エラーを解消)。最後の `check-bundle` だけが parallel 検査で失敗する。理由は、`createScheduler` がまだ無く Worker がバンドルに入らないためで、T-2.3 で解消する。

## pnpm verify の要約 (Phase R の途中なので失敗を許容)

| 段階             | 結果 | 内容                                                                          |
| ---------------- | ---- | ----------------------------------------------------------------------------- |
| check:structure  | 成功 |                                                                               |
| check:boundaries | 失敗 | 13 件、すべて `src/jobs/**` (T-R.4)                                           |
| check:rules      | 失敗 | 74 件、すべて `src/jobs/**`・`tests/unit/jobs/**`・`bench/**` (T-R.4 / T-R.5) |
| typecheck        | 成功 |                                                                               |
| lint             | 成功 |                                                                               |
| format:check     | 失敗 | `src/jobs` 2・`tests/unit/jobs` 2・`bench/scenes/ecs-move.ts` (T-R.4 / T-R.5) |
| test:coverage    | 失敗 | `src/jobs/**` lines 72.97% のみ (T-R.4)                                       |

## 未解決 / 申し送り

- T-R.4: `jobs/kernel.ts` から `MAX_KERNEL_PARAMS` を再公開する。jobs は `Archetype.fromShared` / `toShared`・`ChangeTracker.sharedDescs`・`World.structureVersion` / `setExecutor` を使って作り直す。
- git 管理外のため、コミットは行っていない。
