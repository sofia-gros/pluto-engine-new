# T-1.2: エラー・ログ

## 目的

エンジン内部のエラーを統括する `PlutoError` と `ErrorCode`、およびコンソール出力をラップする `logger` を実装する。既存の `assert.ts` が投げるエラーも `PlutoError` に変更し、無秩序な `console.*` 呼び出しや生の `Error` 送出を防止する。

## 編集・作成するファイル

- `src/core/debug/pluto-error.ts` (新規: `PlutoError` クラス, `ErrorCode` 定数)
- `src/core/debug/logger.ts` (新規: `logger` オブジェクト)
- `src/core/debug/index.ts` (編集: 新規ファイルからの公開を追加)
- `src/core/debug/assert.ts` (編集: エラー送出を `PlutoError` に変更)
- 対応するテスト (`tests/unit/core/debug/pluto-error.test.ts`, `logger.test.ts`, `assert.test.ts` の修正)

## 実装ステップ

1. **pluto-error.ts の実装とテスト**
   - `docs/03-coding-standards.md` の §5 に記載されている `ErrorCode` 定数 (as const) を定義。
   - `PlutoError` クラスを `Error` を継承して作成。
   - テスト: `code` と `message` が正しく設定され、`instanceof Error` となることを確認。
2. **logger.ts の実装とテスト**
   - `console` をラップする `logger` オブジェクト (`info`, `warn`, `error`, `debug` 等) を実装。
   - このファイルのみ `eslint-disable no-console` または ESLint 設定でのオーバーライドを考慮する（今回は ESLint 設定で対応済みのため直接 `console` を使用可能）。
   - テスト: Spy を用いて `console.warn` 等が呼ばれることを確認。
3. **assert.ts の修正とテスト修正**
   - `assert` 関数内で `throw new Error` していた箇所を `throw new PlutoError(ErrorCode.InvalidState, message)` に変更。
   - 既存の `tests/unit/core/debug/assert.test.ts` を修正し、`PlutoError` が投げられることを確認。
4. **index.ts の修正**
   - `PlutoError`, `ErrorCode`, `logger` を公開。

## 完了条件（受け入れ条件）

1. 仕様書のシグネチャ・定数名・値と完全一致すること（レビュー記録に対応表を書く）。
2. `ErrorCode` が `03-coding-standards.md` §5 に指定された通りに定義されている。
3. `assert` の失敗時に `PlutoError` (code = `InvalidState`) が送出されること。
4. ユニットテスト: 公開関数ごとに正常系・境界値・異常系が存在すること。
5. カバレッジ `core/debug/**` が lines 95% / branches 90% 以上であること。
