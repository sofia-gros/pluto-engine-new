# T-0.4: Vitest と最初のコード

## 目的

ユニットテスト基盤（Vitest）を導入し、最初のエンジンコアコードとしてデバッグ用のアサーション関数（`assert`）を実装する。TDD のフローを確立する。

## 編集・作成するファイル

- `vitest.config.ts`
- `src/core/debug/index.ts`
- `src/core/debug/assert.ts`
- `tests/unit/core/debug/assert.test.ts`
- `package.json` (`test` などのスクリプト追加)

## 実装ステップ

1. **Vitest設定の作成**
   - `vitest.config.ts` を作成する。
   - `define` で `__PARALLEL__: false`, `__DEBUG__: true`, `__VERSION__: '"test"'` を設定。
   - `docs/10-testing-strategy.md` §2 の要件に沿ってカバレッジ閾値を設定（`src/core/**` は 95/90%、など）。
2. **テストコードの作成 (TDD Step 1-2)**
   - `tests/unit/core/debug/assert.test.ts` を作成する。
   - テストケース:
     1. `condition` が `true` のとき、何も起こらない（成功）
     2. `condition` が `false` かつ `__DEBUG__ === true` のとき、指定したメッセージを持つ `Error` を投げる（失敗）
     3. `unreachable` などのヘルパーが用意されている場合はその挙動（T-0.4では`assert`のみが必須）
3. **実装コードの作成 (TDD Step 3)**
   - `src/core/debug/assert.ts` を作成し、`assert` 関数を実装する。
   - `__DEBUG__ && !condition` の場合のみ `Error` を投げるようにする（T-1.2でPlutoErrorにするため今は標準のError）。
   - `src/core/debug/index.ts` を作成し、`assert` を export する。
4. **テスト・カバレッジの実行**
   - `pnpm test:coverage` を実行し、すべてのテストがパスし、カバレッジが閾値を満たすことを確認する。
   - `pnpm verify` を実行し、静的検査が通ることを確認する。

## 完了条件（受け入れ条件）

1. `tests/unit/core/debug/assert.test.ts` が存在し、成功/失敗を検証している。
2. `pnpm test:coverage` が成功し、閾値を満たす。
3. `pnpm verify` が成功する。
