# 現在のタスク: T-4.2 テクスチャ・アセット

## 1. 目的

`docs/07-renderer.md` §4〜5、`docs/02-directory-structure.md` §13, §17、および `docs/12-roadmap.md` に基づき、アセット読み込み基盤 (`src/assets/`) と、テクスチャ配列管理・アトラスパッカー・フレームテーブル (`src/render/texture/`) を実装する。

## 2. 作成・編集するファイル (`docs/02-directory-structure.md` に完全準拠)

| ファイル                                                  | 責務                                                                                        |
| --------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `src/assets/asset-types.ts`                               | `AssetKey`, `ImageAsset`, `AtlasAsset`, `AtlasFrameData` 等の型定義 (新規)                  |
| `src/assets/asset-cache.ts`                               | キー → アセットのキャッシュと参照カウント管理 (新規)                                        |
| `src/assets/loaders/image-loader.ts`                      | 画像ローダ (新規)                                                                           |
| `src/assets/loaders/atlas-loader.ts`                      | TexturePacker JSON (Hash / Array 形式) のパーサ (新規)                                      |
| `src/assets/loader.ts`                                    | `Loader`: キュー、並列フェッチ、進捗イベント (新規)                                         |
| `src/assets/index.ts`                                     | `src/assets` の公開窓口 (新規)                                                              |
| `src/render/texture/atlas-packer.ts`                      | 個別画像の実行時パッキング (shelf アルゴリズム, 2px パディング) (新規)                      |
| `src/render/texture/frame-table.ts`                       | フレームテーブル (32 バイト / フレーム, 派生フレームキャッシュ, WHITE_FRAME_ID 予約) (新規) |
| `src/render/texture/texture-array-manager.ts`             | 2D テクスチャ配列の層割当とアップロード、圧縮形式選択 (BC7 → ASTC → ETC2) (新規)            |
| `tests/unit/assets/asset-types.test.ts`                   | アセット型の単体テスト (新規)                                                               |
| `tests/unit/assets/asset-cache.test.ts`                   | キャッシュと参照カウントの単体テスト (新規)                                                 |
| `tests/unit/assets/atlas-loader.test.ts`                  | TexturePacker JSON パースの単体テスト (新規)                                                |
| `tests/unit/assets/loader.test.ts`                        | キューと進捗イベントの単体テスト (新規)                                                     |
| `tests/unit/assets/index.test.ts`                         | assets 公開窓口テスト (新規)                                                                |
| `tests/unit/render/texture/atlas-packer.test.ts`          | shelf パッカーの単体テスト (新規)                                                           |
| `tests/unit/render/texture/frame-table.test.ts`           | フレームテーブル・派生フレーム・上限超過の単体テスト (新規)                                 |
| `tests/unit/render/texture/texture-array-manager.test.ts` | テクスチャ配列層割当と優先順選択の単体テスト (新規)                                         |
| `docs/progress/PROGRESS.md`                               | T-4.2 を IN_PROGRESS に更新                                                                 |

## 3. 実装ステップ

1. **Step 1: 計画作成と PROGRESS 更新 (`pluto-task-start`)**
   - 本ファイルを保存し、`PROGRESS.md` を `IN_PROGRESS` に更新。
2. **Step 2: `src/assets/` の実装 (`pluto-implement`)**
   - `asset-types.ts`, `asset-cache.ts` の実装と単体テスト。
   - `atlas-loader.ts` (Hash / Array 両形式対応) の実装と単体テスト。
   - `image-loader.ts`, `loader.ts`, `index.ts` の実装と単体テスト。
3. **Step 3: `src/render/texture/` の実装 (`pluto-implement`)**
   - `atlas-packer.ts` (shelf アルゴリズム, 2px パディング) の実装と単体テスト。
   - `frame-table.ts` (32 バイト std レイアウト、`getDerivedFrame` キャッシュ、`WHITE_FRAME_ID` 予約、`CapacityExceeded`) の実装と単体テスト。
   - `texture-array-manager.ts` (テクスチャ配列層管理、圧縮テクスチャ配列、BC7 → ASTC → ETC2 優先順) の実装と単体テスト。
4. **Step 4: テスト・静的解析の実行 (`pluto-test`)**
   - `pnpm verify` を実行し、エラー 0・警告 0 を確認。
   - ブラウザテストおよびビルドを確認。
5. **Step 5: レビューとコミット (`pluto-review` / `pluto-task-finish`)**
   - レビュー記録 `docs/progress/reviews/T-4.2.md` を作成。
   - `docs/progress/PROGRESS.md` を更新。
   - 変更をコミットし、プッシュ。

## 4. 受け入れ条件 (ロードマップより)

- `frame-table` の派生フレーム `getDerivedFrame` (同じ組み合わせで同じ ID、`MAX_FRAMES` 超過で `CapacityExceeded`) と `WHITE_FRAME_ID` の予約をユニットテストで検証。
- `texture-array-manager` は圧縮テクスチャ配列 (07 §5) を、対応形式の選択順 (BC7 → ASTC → ETC2) を含めて実装する。
- TexturePacker JSON (Hash / Array) を正しくパースできる。
- `atlas-packer` が shelf 法で個別画像をパッキングできる。
- `pnpm verify` がエラー 0・警告 0 で成功する。
