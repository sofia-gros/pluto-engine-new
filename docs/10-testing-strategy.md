# 10. テスト戦略

## 1. テストの種類

| 種類           | ツール                  | 場所                    | 対象                                                       | 実行コマンド               |
| -------------- | ----------------------- | ----------------------- | ---------------------------------------------------------- | -------------------------- |
| ユニット       | Vitest (Node)           | `tests/unit/`           | GPU を使わない全コード                                     | `pnpm test`                |
| ブラウザ       | Playwright (Chromium)   | `tests/browser/`        | RHI・シェーダ・レンダラ・Worker・入力                      | `pnpm test:browser`        |
| ゴールデン画像 | Playwright + pixelmatch | `tests/browser/golden/` | 描画結果                                                   | `pnpm test:browser` に含む |
| パリティ       | Vitest / Playwright     | 各モジュール            | Serial と Threaded の結果一致、WebGPU と WebGL2 の結果一致 | 同上                       |
| ベンチ         | Playwright + `bench/`   | `bench/`                | 性能                                                       | `pnpm bench`               |
| 静的検査       | tsc / ESLint / tools    | -                       | 全体                                                       | `pnpm verify`              |

## 2. ユニットテストの規則

1. `src/a/b/c.ts` に対して `tests/unit/a/b/c.test.ts` (同じ相対パス)。`index.ts` と `*.d.ts` と型定義のみのファイルは不要。
2. 以下のモジュールは **ユニットテスト必須** (`tools/check-structure.mjs` が存在を検査):
   `core/**`, `jobs/kernel.ts`, `jobs/serial-scheduler.ts`, `transform/**`, `assets/**` (fetch はモック可), `compute/cpu-*.ts`, `render/sprite/sprite-instance-layout.ts`, `render/sprite/sprite-pack-kernel.ts`, `render/sprite/sprite-cpu-cull-kernel.ts`, `render/texture/atlas-packer.ts`, `render/texture/frame-table.ts` (GPU 部分以外), `render/text/text-layout.ts`, `render/graphics/shape-builder.ts`, `physics/**` (GPU 以外), `animation/**`, `scene/game-config.ts`, `input/**` (DOM イベントは合成で)
3. 各公開関数に対して最低限: 正常系 1、境界値 1、異常系 (PlutoError) 1。
4. テスト内で `Math.random` / 実時間を使わない。`createRng(seed)` と `ManualClock` を使う。
5. スナップショットテスト (`toMatchSnapshot`) は **禁止** (中身を確認せずに更新されがちなため)。期待値は明示的に書く。
6. モックは境界 (fetch, DOM, GPU) に限る。自分のモジュールをモックしない。

### カバレッジ閾値 (`vitest.config.ts`)

**カバレッジ集計から除外するファイル** (Node では実行できないもの。代わりに **ブラウザテストで動作を検証することが必須**):

| パターン                                                                                                                                                          | 理由                       | 代替の検証                             |
| ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- | -------------------------------------- |
| `src/rhi/**`, `src/shaders/**`, `src/devtools/**`                                                                                                                 | GPU / DOM                  | `tests/browser/rhi/` 等                |
| `src/jobs/threaded-scheduler.ts`, `src/jobs/worker-entry.ts`, `src/worker-main.ts`                                                                                | Worker + SharedArrayBuffer | `tests/browser/jobs/parity.spec.ts`    |
| `src/compute/gpu-*.ts`, `src/compute/gpgpu-pass.ts`                                                                                                               | GPU                        | パリティテスト (§4)                    |
| `src/render/renderer.ts`, `src/render/sprite/sprite-renderer.ts`, `src/render/sprite/sprite-path-*.ts`                                                            | GPU                        | ゴールデン画像                         |
| `src/render/texture/texture-array-manager.ts`, `src/render/graph/transient-pool.ts`, `src/render/camera/camera-fx-pass.ts`                                        | GPU                        | ゴールデン画像                         |
| `src/render/{text,tilemap,graphics}/*-renderer.ts`, `src/render/lighting/{lighting-simple,radiance-cascades}.ts`, `src/render/post/{bloom,tonemap,post-chain}.ts` | GPU                        | ゴールデン画像                         |
| `src/sim/**` (ただし `*-config.ts` は除外しない), `src/sim/fluid/fluid-renderer.ts`                                                                               | GPU                        | `readBufferAsync` 検証・ゴールデン画像 |
| `src/scene/game.ts`                                                                                                                                               | rAF・デバイス生成          | `tests/browser/scene/`                 |

- 上表以外 (例: `sprite-buffer.ts` のスロット割当、`frame-table.ts` の CPU 部分、scene のハンドル) はユニットテストの対象。GPU は **境界としてのモック** (`RhiDevice` の呼び出し記録) を使ってよいが、「GPU 上で正しく動いた」ことの証拠にはしない。
- 除外リストの追加・変更はこの表を更新してから `vitest.config.ts` に反映する。

| 範囲                                                                                              | lines | branches |
| ------------------------------------------------------------------------------------------------- | ----- | -------- |
| `src/core/**`                                                                                     | 95%   | 90%      |
| `src/jobs/**`, `src/transform/**`, `src/animation/**`, `src/physics/**`                           | 90%   | 85%      |
| 全体 (`src/**`, ただし `src/rhi/**`, `src/shaders/**`, `src/devtools/**`, GPU パスファイルを除く) | 85%   | 80%      |

閾値の引き下げは禁止。

## 3. ブラウザテストの規則

1. ハーネス `tests/browser/fixtures/harness.html` が `?backend=webgpu|webgl2` を受け、テスト用関数を `window.__pluto` に公開する。
2. GPU 結果の検証は `readBufferAsync` (バッファ) または canvas のピクセル読み取り (ゴールデン画像) で行う。
3. ゴールデン画像:
   - 解像度 256×256 固定、`pixelArt: true`、アンチエイリアスなし。
   - 比較は pixelmatch `threshold: 0.1`、差分ピクセル率 ≤ 0.5%。
   - 画像は `tests/browser/golden/webgpu/` と `tests/browser/golden/webgl2/` に別々に置く。
   - 撮影対象は **256×256 の canvas 要素** (`page.locator('canvas').screenshot()`)。ページ全体ではない。
   - API は `expectGolden(page: Page, name: string): Promise<void>` (`testInfo` は `test.info()` で取得)。保存先は `tests/browser/golden/<backend>/<name>.png` (`<backend>` はハーネスの `backend` パラメータ。プロジェクト名ではない)。
   - 更新は Playwright 標準の `pnpm test:browser --update-snapshots` (`testInfo.config.updateSnapshots`) で行い、**更新理由をレビュー記録に書く**。差分画像を目視確認せずに更新してはならない。
   - ゴールデン画像が存在しないときは **失敗** にする (黙って新規作成しない。新規作成も `--update-snapshots` のときだけ)。
4. WebGPU テストは Chromium を `--enable-unsafe-webgpu --enable-features=Vulkan` 等で起動 (`playwright.config.ts`)。WebGPU が使えない環境 (CI) では **`--project=webgl2` を CLI で指定して** WebGPU プロジェクトを実行対象から外す (テストコード内での `test.skip` は禁止)。
5. Worker / SharedArrayBuffer テストは dev server の COOP/COEP ヘッダ付きで実行。
6. プロジェクトとハーネスの対応: `webgpu` → `harness.html?backend=webgpu`、`webgl2` → `?backend=webgl2`、`embed` → `?backend=webgl2&build=embed` (embed ビルド成果物 `/dist/embed/pluto.debug.js` を読み込む。事前に `pnpm build:embed` が必要で、`pnpm test:browser:embed` がそれを行う)。spec は URL を直書きせず、プロジェクトの `use` に置いたパラメータからハーネス URL を組み立てるヘルパ (`tests/browser/helpers/`) を使う。
7. ハーネスは `backend` / `build` パラメータを検証し、不正値なら例外で止める。

## 4. パリティテスト (必須)

| 対象                                        | 比較                                                         | タスク |
| ------------------------------------------- | ------------------------------------------------------------ | ------ |
| `SerialScheduler` vs `ThreadedScheduler`    | 同じカーネル・同じ入力でカラムがビット一致                   | T-2.3  |
| GPU 駆動パス vs CPU 補助パス                | 同じシーンのゴールデン画像が一致 (GPU Tier を含まないシーン) | T-4.6  |
| GPU prefix-sum / radix-sort vs CPU 参照実装 | 結果が完全一致 (ランダム入力 10 種, サイズ 1〜2^20)          | T-4.5  |
| Stable Fluids WebGPU vs WebGL2              | 10 ステップ後の密度の最大誤差 ≤ 1e-3                         | T-7.1  |

## 5. ベンチマーク

- `bench/scenes/*.ts` は `export const scene: BenchScene = { name, setup(ctx: BenchContext, count), step?(frame) }` を export する。`BenchContext` = `{ backend, build, canvas, metrics: Record<string, number> }` (エンジンの `Game` ができるまでは各シーンが自分で World や RHI を作る。T-5.1 以降は `Game` を作る)。単発処理 (spawn など) の計測値は `ctx.metrics` に ms で書く。
- `bench/runner.ts` はシーンを `import.meta.glob('./scenes/*.ts')` で動的に読み込む (シーン追加で runner を変更しない)。
- 計測値の定義:
  - `meanMs / p50Ms / p99Ms`: **フレーム時間** (連続する rAF コールバックの間隔)。vsync で頭打ちにならないよう、Chromium を `--disable-gpu-vsync --disable-frame-rate-limit` で起動する。
  - `cpuMs`: 各フレームの `step()` + エンジン更新にかかった CPU 時間の p99。
  - `gpuMs`: `timestamp-query` がある場合のみ、GPU パス合計の p99。
  - パーセンタイルは昇順ソート後の `index = ceil(p × n) - 1`。
- `tools/run-bench.mjs` の引数: `--scene <name|all>` (既定 `all`)、`--count <n>` (既定はシーンの `defaultCount`)、`--backend webgpu|webgl2` (既定 `webgpu`)、`--build parallel|embed` (既定 `embed`)。プロジェクトの `vite.config.ts` を使って Vite サーバーを起動し、`define` を `--build` に合わせて上書きし (`__DEBUG__ = false`)、COOP/COEP ヘッダを付ける。Chromium は **headed**・WebGPU フラグ付きで起動し、ウォームアップ 120 フレーム後に 600 フレーム計測する。
- 結果は `BenchResult[]` (`{ scene, backend, build, count, meanMs, p50Ms, p99Ms, cpuMs, gpuMs?, metrics? }`) として `bench/results/latest.json` に保存する。
- `tools/compare-bench.mjs` は `bench/baseline.json` (`BenchResult[]`) と **`(scene, backend, build, count)` が一致する要素同士** を比較し、`p99Ms`・`cpuMs`・各 `metrics` のいずれかが 10% を超えて悪化したら exit 1。ベースラインが空配列なら「ベースラインなし」で exit 0、JSON が不正・配列でない場合は exit 1、対応するベースラインがない結果は「新規」と表示して exit 0。
- ベンチの数値は **同一マシンでの相対比較のみ** に使う。CI では実行しない。
- `bench/baseline.json` の更新は `pluto-perf` スキルの手順でのみ行う。

## 6. テストを書く順番 (TDD)

1. 仕様ドキュメントからテストケースを列挙し `docs/progress/current-task.md` に書く
2. 失敗するテストを書く (`pnpm test -- <path>` で赤を確認)
3. 実装して緑にする
4. リファクタリング (緑を維持)
