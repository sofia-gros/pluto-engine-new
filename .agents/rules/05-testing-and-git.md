---
trigger: model_decision
description: テストの作成・修正・実行、テスト失敗の調査、またはコミットを行うときに必ず適用する。
---

# R5: テスト・Git 規則

## テスト
- ユニットテストは `tests/unit/` に **`src/` と同じ相対パス** で置く: `src/core/math/vec2.ts` → `tests/unit/core/math/vec2.test.ts`。
- テスト名 (`describe` / `it`) は日本語で「何がどうなるべきか」を書く。例: `it('容量を超えると PlutoError を投げる', ...)`。
- 1 つの `it` で 1 つの振る舞いだけを検証する。
- テストを通すために実装ではなくテストを変えることは禁止 (仕様変更タスクを除く)。
- 乱数は `createRng(seed)` で固定シードを使う。時間は `ManualClock` を使う。
- GPU が必要なテストは `tests/browser/` (Playwright)。Node のユニットテストで GPU をモックして「動いたことにする」のは禁止。
- 失敗したら原因を特定してから直す。当てずっぽうの修正を繰り返さない (3 ストライクルール)。

## Git
- コミットは 1 タスク 1 コミットを基本とする (大きいタスクは複数可)。
- メッセージ形式 (Conventional Commits + タスク ID、説明は日本語):
  `<type>(<scope>): T-x.y <日本語の要約>`
  - type: `feat` | `fix` | `perf` | `refactor` | `test` | `docs` | `build` | `ci` | `chore`
  - scope: モジュール名 (`core/ecs`, `render`, `rhi` など)
  - 例: `feat(core/ecs): T-1.7 アーキタイプとカラムを実装`
- コミット前に `pnpm verify` が成功していること。
- `git push` / `git reset --hard` / `git rebase` / `git commit --amend` (自分の直前コミット以外) は禁止。
