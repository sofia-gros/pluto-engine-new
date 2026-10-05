# T-2.3 スケジューラ選択とパリティ

## 目的

`__PARALLEL__` および `globalThis.crossOriginIsolated` に基づいて `ThreadedScheduler` または `SerialScheduler` を選択する `createScheduler` を実装する。
また、`SerialScheduler` と `ThreadedScheduler` が同じカーネルと同じ入力に対して全く同じ結果を返す（ビット一致する）ことを保証するパリティテストをブラウザテスト (Playwright) にて実装する。
さらに、`tools/check-bundle.mjs` で parallel ビルドの検査を有効化し、不要なコードが含まれていないことを確認する。

## 編集・作成するファイル

- `src/jobs/index.ts` (編集: `createScheduler` のエクスポート)
- `src/jobs/create-scheduler.ts` (作成: スケジューラ選択ロジック)
- `tests/browser/jobs/parity.spec.ts` (作成: パリティテスト)
- `tools/check-bundle.mjs` (編集: T-2.3並列検査の有効化)

## 実装ステップ

1. **`src/jobs/create-scheduler.ts`**
   - `docs/05-jobs-and-builds.md` 3.4 に記載された `createScheduler` 関数を実装する。
   - `ThreadedScheduler` は動的にインポートするか、あるいは直接インポートして `__PARALLEL__` で分岐する。
   - `logger` を使用して警告等を出力する。
2. **`src/jobs/index.ts`**
   - `createScheduler` をエクスポートする。
3. **`tests/browser/jobs/parity.spec.ts`**
   - Playwright によるブラウザテストを作成。
   - 同じ World と Entity 設定（例: 100万エンティティ、4 Worker）において、SerialScheduler と ThreadedScheduler で同じ Kernel を実行。
   - 実行後のコンポーネント列（TypedArray）がビット一致することを検証する。
4. **`tools/check-bundle.mjs`**
   - `embed` ビルド（直列）において `Worker` や `SharedArrayBuffer` などの並列用コードが含まれていないことを確認する `TODO` コメント外しの修正。
   - `parallel` ビルドの検証も必要であれば追加。

## 完了条件

- [ ] ブラウザテストで 4 Worker × 100 万エンティティのカーネル実行が完了し、Serial とビット一致 (T-2.3 のテストで検証)
- [ ] `check-bundle.mjs` の parallel 側検査が有効になり成功
- [ ] `pnpm verify` がエラー 0・警告 0 で成功
- [ ] テストのカバレッジ要件を満たす
- [ ] 日本語のJSDocが公開APIに存在する
