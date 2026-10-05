# 12. ロードマップとタスク定義

## 0. タスクの進め方 (厳守)

- タスクは **ID 順に 1 つずつ** 実施する。前のタスクが `DONE` になるまで次に着手しない。
- 各タスクで作成してよいファイルは「作成ファイル」欄 (と `docs/02-directory-structure.md` の該当タスク列) に書かれたものと、その **ユニットテスト** のみ。
- 「受け入れ条件」をすべて満たし、証拠を `docs/progress/reviews/T-x.y.md` に記録したら完了。
- **「詳細: 未定義」のタスクには着手しない**。そのフェーズに到達したらユーザーに詳細化を依頼する (`pluto-escalate`)。

---

## Phase 0 — リポジトリ基盤

### T-0.1 パッケージと TypeScript 設定

- **作成ファイル**: `package.json`, `pnpm-lock.yaml`, `tsconfig.json`, `.gitignore`, `.editorconfig`, `.prettierrc.json`, `.prettierignore`
- **参照**: `docs/11-build-and-release.md` §1〜4, `docs/03-coding-standards.md` §9
- **手順**: `git init` (未初期化の場合) → package.json (name `pluto-engine`, version `0.0.0`, `"type": "module"`, `"sideEffects": false`, `engines`, `packageManager`, scripts は §3 の **全部** を記載) → 許可リストの devDependencies を `pnpm add -D` で追加。
- **受け入れ条件**:
  1. `dependencies` が存在しないか空
  2. devDependencies が許可リストの部分集合
  3. `pnpm install --frozen-lockfile` が成功
  4. `.gitignore` に `node_modules/`, `dist/`, `coverage/`, `bench/results/`, `test-results/`, `playwright-report/` を含む
  5. `pnpm check:structure` `pnpm check:boundaries` `pnpm check:rules` が成功

### T-0.2 ESLint

- **作成ファイル**: `eslint.config.js`
- **参照**: `docs/03-coding-standards.md` §8
- **受け入れ条件**:
  1. §8 のルールがすべて設定されている (レビュー記録にルール一覧を貼る)
  2. `linterOptions.noInlineConfig: true`
  3. 一時ファイルで `enum`, `any`, `export default`, `console.log` を書くと `pnpm lint` がエラーになることを確認し、一時ファイルを削除した (確認結果をレビュー記録に貼る)
  4. `pnpm lint` が成功 (対象ファイルなしでも成功)

### T-0.3 Vite 2 ビルドとエントリ

- **作成ファイル**: `vite.config.ts`, `tsconfig.build.json`, `src/build-flags.d.ts`, `src/index.ts`, `src/lowlevel.ts`, `tools/check-bundle.mjs`
- **参照**: `docs/05-jobs-and-builds.md` §4〜5, `docs/11-build-and-release.md` §5〜6
- **内容**: `src/index.ts` は `export const VERSION: string = __VERSION__;` のみ (JSDoc 付き)。`src/lowlevel.ts` は `@file` コメントと `export {};` のみ (Phase 1 以降で re-export を追加)。
- **受け入れ条件**:
  1. `pnpm build` が成功し、`dist/parallel/pluto.js`, `dist/parallel/pluto.debug.js`, `dist/embed/pluto.js`, `dist/embed/pluto.debug.js`, `dist/types/index.d.ts` が生成される
  2. `node tools/check-bundle.mjs` が成功
  3. `pnpm typecheck` が成功

### T-0.4 Vitest と最初のコード

- **作成ファイル**: `vitest.config.ts`, `src/core/debug/index.ts`, `src/core/debug/assert.ts`
- **参照**: `docs/10-testing-strategy.md` §2, `docs/03-coding-standards.md` §5.2
- **内容**: vitest の `define` で `__PARALLEL__=false`, `__DEBUG__=true`, `__VERSION__='test'`。カバレッジ閾値は §2 の表のとおり。`assert` は T-1.2 まで `Error` を投げる (T-1.2 で `PlutoError` に置換)。
- **受け入れ条件**:
  1. `tests/unit/core/debug/assert.test.ts` が存在し、成功/失敗/`unreachable` を検証
  2. `pnpm test:coverage` が成功し閾値を満たす
  3. `pnpm verify` が成功

### T-0.5 Playwright ハーネス

- **作成ファイル**: `playwright.config.ts`, `tests/browser/fixtures/harness.html`, `tests/browser/fixtures/harness.ts`, `tests/browser/helpers/golden.ts`, `tests/browser/smoke/harness.spec.ts`
- **参照**: `docs/10-testing-strategy.md` §3
- **内容**: プロジェクト `webgpu`, `webgl2`, `embed` を定義。`webServer` で vite dev server を起動。`golden.ts` に `expectGolden(page, name)` (pixelmatch + pngjs) を実装。
- **受け入れ条件**:
  1. `pnpm test:browser --project=webgl2` でハーネスが読み込まれ、`crossOriginIsolated === true` を検証するテストが成功
  2. `golden.ts` の比較ロジックにユニット的な検証 (同一画像 = 差分 0、1px 違い = 検出) がブラウザテスト内にある

### T-0.6 CI

- **作成ファイル**: `.github/workflows/ci.yml`
- **参照**: `docs/11-build-and-release.md` §7
- **受け入れ条件**: YAML が §7 のジョブ構成どおり。ローカルで同じコマンド列が成功することを確認し記録。

### T-0.7 ベンチ基盤

- **作成ファイル**: `bench/runner.html`, `bench/runner.ts`, `bench/bench-types.ts`, `bench/baseline.json` (空配列 `[]`), `bench/scenes/empty.ts`, `tools/run-bench.mjs`, `tools/compare-bench.mjs`
- **参照**: `docs/10-testing-strategy.md` §5
- **内容**: この時点ではエンジンが無いので `empty.ts` は `requestAnimationFrame` で空フレームを回すだけ (bench は src ではないので `requestAnimationFrame` 可)。
- **受け入れ条件**: `node tools/run-bench.mjs --scene empty` が `bench/results/latest.json` を出力。`compare-bench.mjs` がベースライン空の場合は「ベースラインなし」と表示し exit 0、10% 超悪化のダミーデータで exit 1 になることを確認。

---

## Phase 1 — Core

| ID     | 内容                         | 作成ファイル (src/ 配下。テストは対応パス)                                              | 参照         |
| ------ | ---------------------------- | --------------------------------------------------------------------------------------- | ------------ |
| T-1.1  | 数学                         | `core/math/` の全ファイル                                                               | 03 §2, 02 §6 |
| T-1.2  | エラー・ログ                 | `core/debug/pluto-error.ts`, `core/debug/logger.ts` (+ `assert` を `PlutoError` に置換) | 03 §5        |
| T-1.3  | メモリ                       | `core/memory/` の全ファイル                                                             | 04 §1        |
| T-1.4  | イベント                     | `core/events/` の全ファイル                                                             | 02 §8        |
| T-1.5  | 時間                         | `core/time/` の全ファイル                                                               | 02 §8        |
| T-1.6  | エンティティ・コンポーネント | `core/ecs/index.ts`, `schema.ts`, `component.ts`, `entity.ts`, `entity-table.ts`        | 04 §2〜3     |
| T-1.7  | アーキタイプ                 | `core/ecs/column.ts`, `archetype.ts`, `archetype-graph.ts`                              | 04 §4        |
| T-1.8  | クエリ・変更追跡             | `core/ecs/change-tracking.ts`, `chunk-view.ts`, `query.ts`                              | 04 §5〜6     |
| T-1.9  | World                        | `core/ecs/command-buffer.ts`, `system.ts`, `world.ts`                                   | 04 §7〜9     |
| T-1.10 | ECS ベンチ                   | `bench/scenes/ecs-move.ts` (World を直接使う)                                           | 04 §10       |

**共通の受け入れ条件 (Phase 1 の全タスク)**:

1. 仕様書のシグネチャ・定数名・値と完全一致 (レビュー記録に対応表を書く)
2. ユニットテスト: 公開関数ごとに正常系・境界値・異常系
3. カバレッジ `core/**` lines 95% / branches 90%
4. HOT ファイルは `pnpm check:rules` の HOT 検査を通過
5. T-1.1 個別: `rng` は同じシードで同じ列、`half` は既知値表 (0, 1, -2, 65504, 6.1e-5, NaN, Inf) で往復一致
6. T-1.10 個別: 04 §10 の性能基準を満たし、結果を `bench/baseline.json` に登録 (`pluto-perf` の手順)

## Phase 2 — Jobs / Transform

| ID    | 内容           | 作成ファイル                                                                              | 参照           |
| ----- | -------------- | ----------------------------------------------------------------------------------------- | -------------- |
| T-2.1 | カーネル・直列 | `jobs/index.ts`, `kernel.ts`, `kernel-registry.ts`, `scheduler.ts`, `serial-scheduler.ts` | 05 §2〜3.1     |
| T-2.2 | 並列           | `jobs/sync.ts`, `worker-protocol.ts`, `worker-entry.ts`, `threaded-scheduler.ts`          | 05 §3.2〜3.3   |
| T-2.3 | 選択とパリティ | `jobs/create-scheduler.ts`, `tests/browser/jobs/parity.spec.ts`                           | 05 §3.4, 10 §4 |
| T-2.4 | Transform      | `transform/` の全ファイル                                                                 | 02 §11         |

受け入れ条件 (追加):

- T-2.2: ブラウザテストで 4 Worker × 100 万エンティティのカーネル実行が完了し、Serial とビット一致 (T-2.3 のテストで検証)
- T-2.3: `check-bundle.mjs` の parallel 側検査が有効になり成功
- T-2.4: 深さ 8 の階層でワールド行列が参照実装 (`affine2d` の逐次乗算) と 1e-5 以内で一致

## Phase 3 — RHI

| ID    | 内容             | 作成ファイル                                                                   | 参照     |
| ----- | ---------------- | ------------------------------------------------------------------------------ | -------- |
| T-3.1 | インターフェース | `rhi/index.ts`, `types.ts`, `device.ts`, `capabilities.ts`, `shader-source.ts` | 06 全体  |
| T-3.2 | WebGPU 実装      | `rhi/webgpu/` の全ファイル                                                     | 06 §4〜9 |
| T-3.3 | WebGL2 実装      | `rhi/webgl2/` の全ファイル                                                     | 06 §4〜9 |
| T-3.4 | デバイス生成     | `rhi/create-device.ts`, `tests/browser/rhi/*.spec.ts`                          | 06 §2    |

受け入れ条件 (T-3.4 で一括検証):

- 両バックエンドで: クリアカラー、vertex pulling による 1 つの四角形描画 (ゴールデン画像)、ストレージ (WebGL2 はデータテクスチャ) から色を読む四角形描画、`writeBuffer` の部分転送
- WebGPU のみ: compute で配列を 2 倍にし `readBufferAsync` で検証、`drawIndirect`
- `backend: 'webgl2'` 強制時に `caps.compute === false`

## Phase 4 — スプライトレンダラ (マイルストーン: 100 万スプライト)

| ID    | 内容                     | 作成ファイル                                                                                                                                                                                                                                               | 参照           |
| ----- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| T-4.1 | シェーダ基盤             | `shaders/index.ts`, `raw.d.ts`, `preprocess.ts`, `shader-library.ts`, `common/constants.*`, `common/camera.*`                                                                                                                                              | 07 §2, R4      |
| T-4.2 | テクスチャ・アセット     | `assets/index.ts`, `asset-types.ts`, `asset-cache.ts`, `loader.ts`, `loaders/image-loader.ts`, `loaders/atlas-loader.ts`, `render/texture/` の全ファイル                                                                                                   | 07 §4〜5       |
| T-4.3 | スプライトデータ         | `render/index.ts`, `render-constants.ts`, `render/sprite/sprite-instance-layout.ts`, `sprite-components.ts`, `sprite-buffer.ts`, `sprite-pack-kernel.ts`, `sprite-pack-system.ts`, `shaders/common/sprite-instance.*`, `frame.*`, `storage-emulation.glsl` | 07 §3, §10〜11 |
| T-4.4 | CPU 補助パス             | `render/sprite/sprite-path-cpu-assisted.ts`, `sprite-cpu-cull-kernel.ts`, `sprite-renderer.ts`, `shaders/sprite/*`                                                                                                                                         | 07 §7, §9      |
| T-4.5 | GPU プリミティブ         | `compute/index.ts`, `gpu-prefix-sum.ts`, `gpu-radix-sort.ts`, `shaders/scan/prefix-sum.wgsl`, `shaders/sort/radix-sort.wgsl`                                                                                                                               | 07 §8, 10 §4   |
| T-4.6 | GPU 駆動パス             | `render/sprite/sprite-path-gpu-driven.ts`, `shaders/cull/*`                                                                                                                                                                                                | 07 §8          |
| T-4.7 | カメラ・グラフ・レンダラ | `render/camera/*`, `render/graph/*`, `render/renderer.ts`, `shaders/post/fullscreen.*`, `shaders/post/blit.frag.glsl`, `bench/scenes/static-sprites.ts`                                                                                                    | 07 §6, §12〜13 |

受け入れ条件 (追加):

- T-4.3: レイアウトテストで TS のオフセットと WGSL/GLSL の構造体定義が一致することを文字列解析で検証
- T-4.4: 両バックエンドでゴールデン画像 (layer/sortKey/flip/tint/opaque/additive を含む 64 スプライトのシーン)
- T-4.5: 10 §4 のパリティテスト
- T-4.6: T-4.4 と同じシーンで GPU 駆動パスのゴールデン画像が CPU 補助パスと一致
- T-4.7: 07 §13 の性能基準。結果を `bench/baseline.json` に登録

---

## Phase 5 — 高レベル API v1 (詳細: タスク表のみ。着手前に受け入れ条件をユーザーと確定)

| ID    | 内容                                                                                                       |
| ----- | ---------------------------------------------------------------------------------------------------------- |
| T-5.1 | Game / Scene / SceneManager / Factory (image, sprite, sprites) / CameraManager / Loader 統合 / json-loader |
| T-5.2 | 入力                                                                                                       |
| T-5.3 | トゥイーン・タイムライン                                                                                   |
| T-5.4 | フレームアニメーション                                                                                     |
| T-5.5 | タイマー・カメラエフェクト                                                                                 |
| T-5.6 | Group / Container                                                                                          |

## Phase 6 — GPU シミュレーション I (詳細: 未定義)

T-6.1 空間ハッシュ / T-6.2 パーティクル / T-6.3 群衆 (フローフィールド + 追従) / T-6.4 群衆 PBD

## Phase 7 — 流体 (詳細: 未定義)

T-7.1 Stable Fluids / T-7.2 PBF / T-7.3 MLS-MPM / T-7.4 流体描画

## Phase 8 — 物理 (詳細: 未定義)

T-8.1 アーケード物理 / T-8.2 XPBD 剛体

## Phase 9 — コンテンツ機能 (詳細: 未定義)

T-9.1 KTX2 / T-9.2 MSDF テキスト / T-9.3 タイルマップ / T-9.4 図形 / T-9.5 ライティング / T-9.6 オーディオ / T-9.7 ポストエフェクト

## Phase 10 — 仕上げ (詳細: 未定義)

T-10.1 devtools / T-10.2 サンプル集 / T-10.3 API リファレンス生成 / T-10.4 リリース
