# T-2.3 スケジューラ選択とパリティ

## 目的

T-R.4で再実装した並列スケジューラ（ThreadedScheduler）と直列スケジューラ（SerialScheduler）の選択ロジックを実装し、ブラウザテストを用いて両者の実行結果のパリティ（ビット一致）およびエラーハンドリング等を検証する。

## 作成・編集するファイル

- `src/jobs/create-scheduler.ts` (作成)
- `src/jobs/index.ts` (変更: createSchedulerの公開)
- `src/lowlevel.ts` (変更: createSchedulerの公開)
- `tests/browser/jobs/parity.spec.ts` (作成)
- `tests/browser/fixtures/parity-worker.ts` (作成: テスト用Workerエントリ)
- `tests/browser/fixtures/parity-kernels.ts` (作成: テスト用カーネル定義)

## 実装ステップ

1. **`createScheduler`の実装**:
   - `src/jobs/create-scheduler.ts` を作成する。
   - `__PARALLEL__ && crossOriginIsolated` が true の場合は `ThreadedScheduler` を返す。
   - そうでない場合は `SerialScheduler` を返す。ただし `__PARALLEL__ === true` なのに `crossOriginIsolated` が false の場合は `logger.warn` を1回だけ呼び出し、縮退を警告する。
2. **モジュールの公開**:
   - `src/jobs/index.ts` と `src/lowlevel.ts` から `createScheduler` を export する。
3. **テスト用カーネルとWorkerエントリの実装**:
   - `tests/browser/fixtures/parity-kernels.ts` でテスト用のコンポーネントとカーネル（`chunkIndex`を使用するもの、単純な計算など）を `defineKernel` する。
   - `tests/browser/fixtures/parity-worker.ts` を作成し、`parity-kernels.ts` を import した上で `runWorkerLoop(port)` を呼び出す（`src/worker-main.ts` を参考にする）。
4. **パリティテストの実装 (`tests/browser/jobs/parity.spec.ts`)**:
   - 4 Worker × 100万エンティティで、Serial と Threaded の結果がビット一致するか検証する。
   - 異なる2つのカーネルを交互に1,000回連続実行し、前ジョブとの競合がないことを検証する。
   - 同期後にアーキタイプが伸長してもWorkerから伸長後の行が見えること、既存クエリにアーキタイプが追加されてもWorkerが全チャンクを処理することを検証する。
   - Worker内でカーネルが例外を投げた場合に、メインスレッドが `PlutoError(InvalidState)` を受け取りハングしないことを検証する。
   - embedビルド（`crossOriginIsolated === false`）環境において、`createScheduler` が `SerialScheduler` を返し、`logger.warn` が1回だけ出されることを検証する。
5. **バンドル検査の確認**:
   - `check-bundle.mjs` が `parallel` 側でも成功することを確認する（`createScheduler` が参照されることでWorkerがバンドルに正しく含まれるか確認）。

## 完了条件

1. 4 Worker × 100 万エンティティでカーネル結果が Serial とビット一致 (`chunkIndex` を使うカーネルを含む)
2. 異なる 2 つのカーネルを交互に 1,000 回連続実行しても結果が Serial と一致する (前ジョブとの競合がない)
3. 同期後にアーキタイプが伸長しても、Worker から伸長後の行が見える。既存クエリにアーキタイプが追加されても Worker が全チャンクを処理する
4. Worker 内でカーネルが例外を投げると、メインが `PlutoError(InvalidState)` を受け取り、ハングしない
5. `crossOriginIsolated === false` (embed プロジェクト) で `createScheduler` が `SerialScheduler` を返し、`logger.warn` を 1 回出す
6. `check-bundle.mjs` の parallel 側検査が成功
