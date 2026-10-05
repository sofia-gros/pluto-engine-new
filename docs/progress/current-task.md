# T-0.7: ベンチ基盤

## 目的

エンジンのパフォーマンスを測定・比較するためのベンチマーク基盤を構築する。変更により 10% 以上の性能悪化があった場合に検知できる仕組みを作る。

## 編集・作成するファイル

- `bench/runner.html`
- `bench/runner.ts`
- `bench/bench-types.ts`
- `bench/baseline.json`
- `bench/scenes/empty.ts`
- `tools/run-bench.mjs`
- `tools/compare-bench.mjs`

## 実装ステップ

1. **型の定義とダミーシーンの作成**
   - `bench/bench-types.ts` を作成し、`BenchScene` 型（`name`, `setup`, `step?`）と、結果の型 `{ scene, backend, build, count, meanMs, p50Ms, p99Ms, gpuMs? }` を定義する。
   - `bench/scenes/empty.ts` を作成し、空フレームを回すだけのシーンを作る。
2. **ランナー (ブラウザ側) の作成**
   - `bench/runner.html` と `bench/runner.ts` を作成する。
   - ウォームアップ 120 フレーム後に 600 フレーム計測し、フレームごとの時間を `performance.now()` 等で記録する。計測完了後、結果（mean, p50, p99）を算出し、Playwright に伝えるためのイベントやグローバル変数に格納する。
3. **ベンチマーク実行スクリプトの作成**
   - `tools/run-bench.mjs` を作成し、Playwright (`chromium.launch({ headless: false })`) を使って `runner.html` を開く。
   - スクリプトは `--scene` などの引数を受け取り、測定結果を `bench/results/latest.json` に保存する。
4. **比較スクリプトの作成とベースラインの準備**
   - `bench/baseline.json` を作成し、初期状態として空配列 `[]` を置く。
   - `tools/compare-bench.mjs` を作成し、`latest.json` の `p99Ms` が `baseline.json` に比べて 10% を超えて悪化していたら exit 1 する。ベースラインがない場合は「ベースラインなし」と表示して exit 0 する。

## 完了条件（受け入れ条件）

1. `node tools/run-bench.mjs --scene empty` が `bench/results/latest.json` を出力すること。
2. `node tools/compare-bench.mjs` を実行し、ベースライン空の場合は「ベースラインなし」と表示し exit 0 すること。
3. 10% を超えて悪化しているダミーの `latest.json` を用いた場合、exit 1 になることを確認すること。
