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
   - 更新は `pnpm test:browser --update-golden` で行い、**更新理由をレビュー記録に書く**。差分画像を目視確認せずに更新してはならない。
4. WebGPU テストは Chromium を `--enable-unsafe-webgpu --enable-features=Vulkan` 等で起動 (`playwright.config.ts`)。WebGPU が使えない環境 (CI) では WebGPU プロジェクトを `skip` ではなく **別プロジェクトとして実行対象から外す** (設定で制御。テストコード内での `test.skip` は禁止)。
5. Worker / SharedArrayBuffer テストは dev server の COOP/COEP ヘッダ付きで実行。

## 4. パリティテスト (必須)

| 対象                                        | 比較                                                         | タスク |
| ------------------------------------------- | ------------------------------------------------------------ | ------ |
| `SerialScheduler` vs `ThreadedScheduler`    | 同じカーネル・同じ入力でカラムがビット一致                   | T-2.3  |
| GPU 駆動パス vs CPU 補助パス                | 同じシーンのゴールデン画像が一致 (GPU Tier を含まないシーン) | T-4.6  |
| GPU prefix-sum / radix-sort vs CPU 参照実装 | 結果が完全一致 (ランダム入力 10 種, サイズ 1〜2^20)          | T-4.5  |
| Stable Fluids WebGPU vs WebGL2              | 10 ステップ後の密度の最大誤差 ≤ 1e-3                         | T-7.1  |

## 5. ベンチマーク

- `bench/scenes/*.ts` は `export const scene: BenchScene = { name, setup(game, count), step?(frame) }` を export する。
- `tools/run-bench.mjs` は Chromium を **headed** で起動し、ウォームアップ 120 フレーム後に 600 フレーム計測、`{ scene, backend, build, count, meanMs, p50Ms, p99Ms, gpuMs? }` を `bench/results/latest.json` に保存。
- `tools/compare-bench.mjs` は `bench/baseline.json` と比較し、`p99Ms` が 10% を超えて悪化したら exit 1。
- ベンチの数値は **同一マシンでの相対比較のみ** に使う。CI では実行しない。
- `bench/baseline.json` の更新は `pluto-perf` スキルの手順でのみ行う。

## 6. テストを書く順番 (TDD)

1. 仕様ドキュメントからテストケースを列挙し `docs/progress/current-task.md` に書く
2. 失敗するテストを書く (`pnpm test -- <path>` で赤を確認)
3. 実装して緑にする
4. リファクタリング (緑を維持)
