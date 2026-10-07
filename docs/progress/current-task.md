# 現在のタスク: T-4.3 スプライトデータ

## 1. 目的

`docs/07-renderer.md` §3, §10〜11、`docs/02-directory-structure.md` §15, §17、および `docs/12-roadmap.md` に基づき、スプライト 32 バイトインスタンスレイアウト (SSOT)、スプライト ECS コンポーネント、スプライト GPU/CPU バッファ、パックカーネルとシステム、対応シェーダ共通定義 (`sprite-instance.*`, `frame.*`, `storage-emulation.glsl`) を実装し、Worker へのカーネル登録を行う。

## 2. 作成・編集するファイル (`docs/02-directory-structure.md` に完全準拠)

| ファイル                                                  | 責務                                                                                          | HOT |
| --------------------------------------------------------- | --------------------------------------------------------------------------------------------- | --- |
| `src/render/sprite/sprite-instance-layout.ts`             | スプライト 32 バイトレイアウトの SSOT (オフセット定数、フラグ定数、`packSprite` 関数)         | HOT |
| `src/render/sprite/sprite-components.ts`                  | `Sprite`, `SpriteSlot` コンポーネント定義 (`docs/07` §11)                                     | -   |
| `src/render/sprite/sprite-buffer.ts`                      | GPU スプライトバッファ、`RangeAllocator` によるスロット割当、`Bitset` による dirty range 転送 | HOT |
| `src/render/sprite/sprite-pack-kernel.ts`                 | CPU Tier の SoA → 32 バイト AoS ステージングへのパックカーネル                                | HOT |
| `src/render/sprite/sprite-pack-system.ts`                 | 上記カーネルを dirty チャンクに対してスケジュールするシステム                                 | -   |
| `src/render/index.ts`                                     | `src/render` の公開窓口                                                                       | -   |
| `src/shaders/common/sprite-instance.wgsl`                 | スプライトインスタンス構造体とデコード関数 (WGSL)                                             | -   |
| `src/shaders/common/sprite-instance.glsl`                 | スプライトインスタンス構造体とデコード関数 (GLSL, データテクスチャ対応)                       | -   |
| `src/shaders/common/frame.wgsl`                           | フレームテーブル構造体 (WGSL)                                                                 | -   |
| `src/shaders/common/frame.glsl`                           | フレームテーブル構造体 (GLSL)                                                                 | -   |
| `src/shaders/common/storage-emulation.glsl`               | WebGL2 データテクスチャ読取ヘルパ (`pluto_fetch`)                                             | -   |
| `src/worker-main.ts`                                      | `sprite-pack-kernel` の登録                                                                   | -   |
| `tests/unit/render/sprite/sprite-instance-layout.test.ts` | レイアウトテスト (TS と WGSL/GLSL の定義一致検証)                                             | -   |
| `tests/unit/render/sprite/sprite-components.test.ts`      | コンポーネント定義の単体テスト                                                                | -   |
| `tests/unit/render/sprite/sprite-buffer.test.ts`          | スプライトバッファ・スロット割当・dirty 転送テスト                                            | -   |
| `tests/unit/render/sprite/sprite-pack-kernel.test.ts`     | パックカーネルの単体テスト                                                                    | -   |
| `tests/unit/render/sprite/sprite-pack-system.test.ts`     | パックシステムの単体テスト                                                                    | -   |
| `tests/unit/render/index.test.ts`                         | render モジュール公開窓口テスト                                                               | -   |
| `docs/progress/PROGRESS.md`                               | T-4.3 を IN_PROGRESS に更新                                                                   | -   |

## 3. 実装ステップ

1. **Step 1: 計画作成と PROGRESS 更新 (`pluto-task-start`)**
   - 本ファイルを保存し、`PROGRESS.md` を `IN_PROGRESS` に更新。
2. **Step 2: レイアウトとシェーダ共通定義の実装 (`pluto-shader` / `pluto-implement`)**
   - `sprite-instance-layout.ts` (32 バイトインスタンス、オフセット定数、フラグ定数、packSprite)
   - `shaders/common/sprite-instance.wgsl` & `sprite-instance.glsl`
   - `shaders/common/frame.wgsl` & `frame.glsl`
   - `shaders/common/storage-emulation.glsl`
   - `shader-library.ts` への登録
   - TS ⇔ WGSL / GLSL のレイアウト一致テストの作成・検証。
3. **Step 3: スプライトコンポーネント・バッファの実装 (`pluto-implement` / `pluto-perf`)**
   - `sprite-components.ts` (`Sprite`, `SpriteSlot`)
   - `sprite-buffer.ts` (`RangeAllocator`, `Bitset` dirty 管理, `writeBuffer` 転送)
   - 単体テスト作成と検証。
4. **Step 4: パックカーネル・システムの実装と Worker 登録 (`pluto-implement`)**
   - `sprite-pack-kernel.ts` (SoA → AoS, 角度・スケール計算, dirtyBits 設定)
   - `sprite-pack-system.ts`
   - `src/worker-main.ts` にカーネルを登録
   - `src/render/index.ts` の作成
   - 単体テスト作成と検証。
5. **Step 5: 検証・ベンチマーク (`pluto-perf` / `pluto-test`)**
   - `pnpm verify` がエラー 0・警告 0 で成功することを確認。
6. **Step 6: レビューとコミット (`pluto-review` / `pluto-task-finish`)**
   - レビュー記録 `docs/progress/reviews/T-4.3.md` 作成。
   - `docs/progress/PROGRESS.md` 更新、コミット＆プッシュ。

## 4. 受け入れ条件 (ロードマップより)

- レイアウトテストで TS のオフセットと WGSL/GLSL の構造体定義が一致することを文字列解析で検証。
- `FLAG_OCCLUDER` (bit 5) と `FRAME_PAGE_COMPRESSED_BIT` を含む。
- `sprite-pack-kernel` を `src/worker-main.ts` に登録する。
- `pnpm verify` がエラー 0・警告 0 で成功する。
