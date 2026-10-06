# 12. ロードマップとタスク定義

## 0. タスクの進め方 (厳守)

- タスクは **ID 順に 1 つずつ** 実施する。前のタスクが `DONE` になるまで次に着手しない。
- **実施順序**: T-0.1 〜 T-2.2 (DONE) → **Phase R (T-R.1 〜 T-R.5)** → T-2.3 → T-2.4 → Phase 3 以降。Phase R は 2026-10-06 のレビューで挿入した是正フェーズ。
- 各タスクで作成してよいファイルは「作成ファイル」欄 (と `docs/02-directory-structure.md` の該当タスク列) に書かれたものと、その **ユニットテスト** のみ。
- 「受け入れ条件」をすべて満たし、証拠を `docs/progress/reviews/T-x.y.md` に記録したら完了。
- 「作成ファイル」に加え、Phase 5 以降は「変更ファイル」欄に書かれた既存ファイルだけを変更してよい。
- 2026-10-06 時点で、本書の全タスクの詳細が確定している (末尾「決定事項」)。それでもドキュメントに無い判断が必要になったら作業を止めて `pluto-escalate`。

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

## Phase R — 是正 (T-2.3 より前に実施)

2026-10-06 のレビュー (`docs/progress/reviews/2026-10-06-codebase-review.md`) で、DONE 扱いの Phase 0〜2 に仕様違反と未実装が見つかった。主な原因は検査ツール (`check-*`) がほぼ空で、違反が `pnpm verify` をすり抜けていたこと。以下の是正タスクを **T-2.3 より前に ID 順で** 実施する。

- Phase R のタスクは、本書で指定した範囲に限り `tools/**`、設定ファイル (`vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.js`, `.github/**`) と DONE 済みファイルを変更してよい (ユーザー承認済み, 2026-10-06)。
- **Phase R 中の `pnpm verify` の扱い**: T-R.1 で検査が厳しくなるため、既存の違反で verify が失敗する。各タスクは「自分の範囲の違反を 0 にし、違反の総数を増やさない」ことを完了条件とし、違反一覧 (`pnpm verify` の出力) をレビュー記録に貼る。**T-R.5 の完了時点で `pnpm verify` を完全に成功させる** (以降は通常の完了の定義に戻る)。
- 既存の DONE タスク (T-0.x〜T-2.2) の状態は変更しない。是正は R タスクの成果として記録する。

### T-R.1 検査ツールの実装

- **変更ファイル**: `tools/check-structure.mjs`, `tools/check-boundaries.mjs`, `tools/check-rules.mjs`, `tools/check-bundle.mjs`, `tools/verify.mjs`, `tools/lib/*.mjs`
- **参照**: `docs/02-directory-structure.md` §3・§23〜24, `.agents/rules/01〜03`, `docs/03-coding-standards.md` §1〜§7, `docs/10-testing-strategy.md` §2, `docs/11-build-and-release.md` §3・§6
- **内容**:
  - `check-structure`: (1) `src/` のファイルが 02 の表にある、(2) `tests/`・`bench/`・`examples/` が 02 §23〜24 のパターンに合う、(3) `tests/unit/x.test.ts` に対応する `src/x.ts` がある、(4) 10 §2.2 の必須ユニットテストがある (例: `src/core/ecs/system.ts` → `tests/unit/core/ecs/system.test.ts`)。
  - `check-boundaries`: import を解析し、(1) `.agents/rules/03-architecture.md` の依存表、(2) 他モジュールは `index.ts` 経由、(3) 封印ルール (`rhi/webgpu|webgl2`、`threaded-scheduler`、`worker-main`、`runWorkerLoop`、`?raw`)、(4) `src/` から `tests/bench/examples/tools` を import しない、(5) 循環 import なし、を検査する。
  - `check-rules`: (1) 03 §7 の禁止 API と例外ファイル、(2) `as unknown as`・`@ts-*`・`eslint-disable`・`any` (src/tests/bench/tools 全体)、(3) `/** */` に日本語を含む・`@file` がある・export に JSDoc がある、(4) 400 行制限 (tests は 800)、(5) HOT ファイル: **1 行目** が `// @pluto-hot`、R2 の禁止事項 (オブジェクト/配列リテラル・`new`・クロージャ・スプレッド・分割代入・テンプレート文字列・高階関数・`for...of`・`Object.keys` 等) を、行末に `// pluto-allow: 理由` がない限り検出、export 関数に `@hot`、(6) `index.ts` は re-export とコメントのみで `export *` なし、(7) `TODO` は `TODO(T-x.y)` 形式。
  - `check-bundle`: parallel 側の検査を失敗扱いにする (11 §6)。
  - `verify`: package.json がなくても落ちない。最後に要約表を出す。
- **受け入れ条件**:
  1. 各検査について「違反を 1 件ずつ含む一時ファイル」で検出されること、修正後に通ることを確認し、一時ファイルを削除した (結果をレビュー記録に貼る)
  2. 既存コードに対する検出結果の一覧をレビュー記録に貼り、レビュー報告書の指摘と照合した
  3. ツールのみで完結 (src/tests は変更しない)

### T-R.2 ビルド・テスト設定の是正

- **変更ファイル**: `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `eslint.config.js`, `.github/workflows/ci.yml`, `tests/browser/fixtures/harness.ts`, `tests/browser/fixtures/harness.html`, `tests/browser/helpers/golden.ts`, `tests/browser/helpers/*.ts` (ハーネス URL ヘルパ `harness-test.ts` の新規作成を含む), `tests/browser/smoke/*.spec.ts` (`golden.spec.ts` の新規作成を含む), `tools/**` (T-R.2 で lint 対象にしたことで出た指摘の修正に限る)
- **参照**: `docs/05-jobs-and-builds.md` §4, `docs/10-testing-strategy.md` §2〜3, `docs/11-build-and-release.md` §5・§7, `docs/03-coding-standards.md` §8
- **内容**:
  - vite: dev server (`command === 'serve'`) は `__PARALLEL__ = true`, `__DEBUG__ = true`。`preview.headers` に COOP/COEP。
  - vitest: 10 §2 の除外表のうち、現存するファイル (`jobs/threaded-scheduler.ts`, `jobs/worker-entry.ts`) を除外に追加。以降のタスクは対象ファイルを作るときに除外を追加する。
  - playwright / ハーネス: 10 §3.6〜3.7 のとおり (プロジェクトごとの `backend` / `build` パラメータ、embed は `dist/embed/pluto.debug.js` を読む、パラメータ検証、`@file` と JSDoc)。
  - golden.ts: 10 §3.3 のとおり (`expectGolden(page, name)`、canvas 撮影、`--update-snapshots`、無ければ失敗、保存先は backend 名)。
  - eslint: 03 §8 の追記どおり (naming-convention の全規則、logger のみの override、設定ファイルの例外、tools を lint、仕様外の緩和を削除)。
  - ci.yml: トリガーをブランチで絞らない。
- **受け入れ条件**:
  1. dev server 上で `__PARALLEL__ === true && __DEBUG__ === true` をブラウザテストで検証
  2. `pnpm test:browser:embed` で embed ビルドが読み込まれ (`VERSION` と `__PARALLEL__ === false` を検証)、`webgl2` プロジェクトとは別の成果物であることを確認
  3. golden.ts: 同一画像で差分 0、1px 違いを検出、ゴールデン画像がないと失敗、`--update-snapshots` で作成、の 4 点をブラウザテストで検証
  4. eslint: 真偽値の接頭辞違反・列挙キーの PascalCase 違反を一時ファイルで検出できる
  5. `pnpm test:browser --project=webgl2` と `pnpm test:browser:embed` が成功

### T-R.3 core の是正

- **変更ファイル**: `src/core/**`, `tests/unit/core/**` (`tests/unit/core/ecs/system.test.ts` の新規作成を含む)
- **参照**: `docs/04-memory-and-ecs.md` (2026-10-06 改訂版) 全体, `docs/01-architecture.md` §4, `docs/03-coding-standards.md`, レビュー報告書 §2
- **内容** (レビュー報告書の core の指摘をすべて解消する):
  - ECS の正しさ: クエリへのアーキタイプ重複登録、`NULL_ENTITY` 判定、`maxEntities` 既定値・上限と index 0x3FFFFF の予約、`Phase` を数値に、`isIterating` を読み取り専用に、クエリキャッシュキーの正規化、ID → アーキタイプの配列化、マスクキーの 16 進化。
  - メモリ: Column と `Archetype.entities` を `growBackingBuffer` + length-tracking に変更 (※ E-002 / D-20 で「固定長バッファ + 伸長時コピー」に再変更。T-R.5 で対応)、変更追跡ビットを backing buffer 上に置く、`growBackingBuffer` の同サイズ許容、`Archetype.fromShared()` の追加、`forEachDirtyRange(fieldId, rowCount, cb)`、`CommandBuffer` の容量チェックを index 予約の前に移す、`spawn1` / `spawnN`。
  - System / World: `KernelRef` / `KernelExecutor` / `SystemDef.params`、`setExecutor`、`structureVersion`、kernel システムの実行 (04 §9)。
  - math: `half.ts` を `f32ToF16` / `f16ToF32` / `packHalf2x16(lo, hi)` に変更し、最近接偶数丸め・極小値の 0 への丸めを正しくする。
  - 規約: 他モジュールは `index.ts` 経由で import、`index.ts` から `export *` を除去、素の `Error` を `PlutoError` に、`!` の確定代入を除去、HOT ファイルの違反の除去または `pluto-allow`、フィールド名 `id/name/fields` の禁止、JSDoc の欠落 (レビュー報告書の一覧) を補う。
  - `pnpm build` の型定義出力の失敗 (`pluto-error.ts` の `Error.captureStackTrace` が `tsconfig.build.json` の型環境に無い) を、設定を緩めずに解消する (存在チェック付きの呼び出しにする等)。
  - `src/lowlevel.ts` に core の公開 API (World, defineComponent, defineSystem, Phase, Query, ChunkView, ScalarType, 数学関数など) を re-export する。
- **受け入れ条件**:
  1. Phase 1 の共通受け入れ条件 (仕様との対応表・正常/境界/異常系・カバレッジ `core/**` 95/90) をすべて満たす
  2. 回帰テスト: クエリ作成後に 1,000 体 spawn しても `chunkCount()` が正しい、最初の個体 (`makeEntity(0, 0)`) が swap-remove で移動しても `world.get` が正しい行を返す、Column を伸長してもデータが保たれる (※ D-20 以降、伸長前のビューは古くなる仕様)
  3. `half`: 既知値表 (0, -0, 1, -2, 65504, 6.1e-5, 2^-24, 2^-25, 2^-110, NaN, ±Inf) の f32 → f16 が IEEE 754 の最近接偶数丸めの期待ビット列と一致し、f16 → f32 → f16 がビット一致 (6.1e-5 は f32 に丸めた後、f16 の最近傍値 0x03FF (最大の非正規化数) に丸まることを確認。最小正規化数 0x0400 = 6.1035e-5 ではない)
  4. `rng`: 既知のシードに対して xoshiro128** の参照実装の出力列 (先頭 8 個) と一致
  5. `pnpm check:*` (T-R.1 版) で `src/core/**` と `tests/unit/core/**` の違反が 0
  6. `pnpm build` の各ビルド (parallel / embed / 型定義) が成功する。最後の `check-bundle` の parallel 検査は、エントリから `createScheduler` が参照される T-2.3 まで失敗する (Worker がバンドルに入らないため)

### T-R.4 jobs の再実装と World 連携

- **作成ファイル**: `src/worker-main.ts`
- **変更ファイル**: `src/jobs/**`, `tests/unit/jobs/**`, `src/lowlevel.ts`, `src/core/ecs/component.ts`・`src/core/ecs/archetype.ts` とそのテスト (コンポーネント表の整合 `getComponentLayout` / `applyComponentLayout`、`fromShared` をレジストリ非依存にする。05 §3.3)
- **参照**: `docs/05-jobs-and-builds.md` (2026-10-06 改訂版) 全体, `docs/04-memory-and-ecs.md` §4.2・§8〜9, レビュー報告書 §3
- **内容**:
  - `defineKernel` の ID を FNV-1a ハッシュに変更、`MAX_KERNEL_PARAMS` を `kernel.ts` に定義、params を常に 64 要素の 0 埋めバッファで渡す (Serial / Threaded 共通)、`registerBuffer` で SAB を検査。
  - Worker: `worker-entry.ts` を副作用のない `runWorkerLoop()` にし、`Atomics.waitAsync` によるイベント駆動、`syncVersion` による参加判定、`Archetype.fromShared()` によるミラー、`ARCH_COUNTS` からの行数読み取り、ジョブ番号付きカウンタによるチャンク取得、コンポーネント表の整合に変更。`src/worker-main.ts` を作成 (この時点では組込カーネルを持つモジュールがないので `jobs` のみ import。T-2.4 以降、カーネルを追加したモジュールをここに追記する)。
  - ThreadedScheduler: ジョブ番号付きカウンタ (05 §3.2)、`CTRL_ERROR` による例外伝播、`createWorker` の注入、既存クエリへのアーキタイプ追加時のクエリ再送、`as unknown as` の除去、HOT 違反の除去、JSDoc。
  - `jobs/index.ts` の公開範囲を 05 §2 のとおりに絞る。`src/lowlevel.ts` に jobs の公開 API を追加。
- **受け入れ条件**:
  1. Serial の単体テスト: params の 0 埋め・65 要素以上の拒否・`chunkIndex` がクエリ全体の通し番号であること
  2. `defineKernel`: 同名の再定義・ハッシュ衝突が `PlutoError(InvalidArgument)`、ID が登録順に依存しない
  3. World 連携のユニットテスト: kernel システムが `KernelExecutor` 経由で実行される、`structureVersion` 変化時だけ `syncWorld` が呼ばれる、executor 未設定で `PlutoError(NotInitialized)`
  4. Threaded の動作はブラウザテストで T-2.3 が検証する (ここでは各ビルドの成功まで。`check-bundle` の parallel 検査は T-2.3 で成功させる)
  5. `pnpm check:*` (T-R.1 版) で `src/jobs/**` の違反が 0

### T-R.5 ベンチ基盤の是正と ECS ベンチの再計測

- **E-002 の回答による追加 (2026-10-06)**: メモリモデルを「固定長バッファ + 伸長時コピー + Worker への再送」に変更する (04 §1.1)。`src/core/memory/buffer-factory.ts`・`src/core/ecs/{column,archetype,archetype-graph,change-tracking,world}.ts`・`src/jobs/{threaded-scheduler,worker-entry}.ts` とそのテストを変更してよい。
- **変更ファイル**: `tools/run-bench.mjs`, `tools/compare-bench.mjs`, `bench/runner.ts`, `bench/runner.html`, `bench/bench-types.ts`, `bench/scenes/empty.ts`, `bench/scenes/ecs-move.ts`, `bench/baseline.json`, `docs/progress/reviews/T-1.10.md` (訂正の追記のみ)
- **参照**: `docs/10-testing-strategy.md` §5 (2026-10-06 改訂版), `docs/04-memory-and-ecs.md` §10, `.agents/skills/pluto-perf`
- **内容**: run-bench の引数 (`--scene/--count/--backend/--build`)、vsync を外した起動、プロジェクト設定 + define 上書き + COOP/COEP、runner のシーン動的読み込みと `BenchContext`、`cpuMs` と `metrics`、compare-bench の比較キーと異常時の終了コード。`ecs-move.ts` は spawn・get/set・移動カーネルを個別に計時して `metrics` に記録し、毎フレームの `world.query()`・クロージャ生成・`as unknown as` をやめる。**判定は p50** (04 §10)。E-002 の回答 (2026-10-06) に加えて `Archetype.pushRows` による一括生成 (`World.spawnN`) を測定対象に加えた。
- **受け入れ条件**:
  1. `pnpm bench -- --scene empty --build embed` と `--build parallel` の両方で `bench/results/latest.json` に `build` が正しく入った結果が出る (parallel は `crossOriginIsolated === true` を記録)
  2. **vsync 解除の確認 (T-4.7 以降に再検証)**: `empty` シーンの `p50Ms` が 1000 / リフレッシュレート より明確に小さい。**2026-10-06 時点では満たせていない**ので保留する。理由は 2 つある。(a) 基準機 (RTX 4060) の表示先が Parsec の仮想ディスプレイで、実ディスプレイは 143Hz なのに Chromium が約 60Hz で止まる (`--disable-gpu-vsync --disable-frame-rate-limit`・headless どちらでも効かない)。(b) 描画パス (Phase 4) が入るまで `p50Ms` はエンジンowymな速さを測らない (`empty` で cpuP50 0.005ms でも p50 は 17.4ms)。判定は `cpuP50Ms` で行う (04 §10)。実測値は `reviews/T-R.5.md` にある
  3. compare-bench: 空配列で exit 0、10% 超の悪化で exit 1、不正 JSON で exit 1、未登録の構成は「新規」で exit 0。**判定は p50 で行う** (`cpuP50Ms` と `metrics.*P50Ms`。p99 系は参考値として表示のみ。docs/04 §10)
  4. `ecs-move` を基準機で計測し、**`docs/04` §10 の基準を実測値で満たす** (数値は §10 に定義済み。T-R.5 では「一括生成は初期化なので毎フレーム予算と無関係」という根拠で `spawnN` を 60ms に設定し、判定は p50 にした)。`bench/baseline.json` を `BenchResult[]` 形式で登録し直す。T-1.10 のレビュー記録に「旧ベースラインは根拠となる出力がなく無効」と訂正を追記する
  5. **`pnpm verify` が警告・エラー 0 で成功** (Phase R の完了条件)

---

## Phase 2 — Jobs / Transform

| ID    | 内容           | 作成ファイル                                                                              | 参照           |
| ----- | -------------- | ----------------------------------------------------------------------------------------- | -------------- |
| T-2.1 | カーネル・直列 | `jobs/index.ts`, `kernel.ts`, `kernel-registry.ts`, `scheduler.ts`, `serial-scheduler.ts` | 05 §2〜3.1     |
| T-2.2 | 並列           | `jobs/sync.ts`, `worker-protocol.ts`, `worker-entry.ts`, `threaded-scheduler.ts`          | 05 §3.2〜3.3   |
| T-2.3 | 選択とパリティ | `jobs/create-scheduler.ts`, `tests/browser/jobs/parity.spec.ts`                           | 05 §3.4, 10 §4 |
| T-2.4 | Transform      | `transform/` の全ファイル                                                                 | 02 §11         |

受け入れ条件 (追加):

- T-2.2: ブラウザテストで 4 Worker × 100 万エンティティのカーネル実行が完了し、Serial とビット一致 (T-2.3 のテストで検証)
- T-2.3 (T-R.4 の実装を検証する。テスト用カーネルは `tests/browser/fixtures/` 側で `defineKernel` し、テスト用の Worker エントリはハーネスから組み立てる):
  1. 4 Worker × 100 万エンティティでカーネル結果が Serial とビット一致 (`chunkIndex` を使うカーネルを含む)
  2. 異なる 2 つのカーネルを交互に 1,000 回連続実行しても結果が Serial と一致する (前ジョブとの競合がない)
  3. 同期後にアーキタイプが伸長しても、Worker から伸長後の行が見える。既存クエリにアーキタイプが追加されても Worker が全チャンクを処理する
  4. Worker 内でカーネルが例外を投げると、メインが `PlutoError(InvalidState)` を受け取り、ハングしない
  5. `crossOriginIsolated === false` (embed プロジェクト) で `createScheduler` が `SerialScheduler` を返し、`logger.warn` を 1 回出す
  6. `check-bundle.mjs` の parallel 側検査が成功 (対象は `dist/parallel/pluto-lowlevel.js`。`pluto.js` への Worker 同梱は T-5.1 で `scene` を作ったときに確認する。`docs/11` §6)
- T-2.4: 変換カーネルを `src/worker-main.ts` に登録する (変更ファイル)。`src/lowlevel.ts` に transform を re-export
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
- 圧縮テクスチャ (06 §3・§5): `caps.textureCompression*` が実際の機能・拡張の有無と一致する。`false` の形式で `createTexture` すると `PlutoError(UnsupportedFeature)` (必ず検証する)。`true` の形式は単色ブロックをアップロードしてサンプルした色が期待値 (環境により検証内容を分岐してよいが、`test.skip` は禁止)

## Phase 4 — スプライトレンダラ (マイルストーン: 100 万スプライト)

| ID    | 内容                     | 作成ファイル                                                                                                                                                                                                                                               | 参照           |
| ----- | ------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------- |
| T-4.1 | シェーダ基盤             | `shaders/index.ts`, `raw.d.ts`, `preprocess.ts`, `shader-library.ts`, `common/constants.*`, `common/camera.*`                                                                                                                                              | 07 §2, R4      |
| T-4.2 | テクスチャ・アセット     | `assets/index.ts`, `asset-types.ts`, `asset-cache.ts`, `loader.ts`, `loaders/image-loader.ts`, `loaders/atlas-loader.ts`, `render/texture/` の全ファイル                                                                                                   | 07 §4〜5       |
| T-4.3 | スプライトデータ         | `render/index.ts`, `render-constants.ts`, `render/sprite/sprite-instance-layout.ts`, `sprite-components.ts`, `sprite-buffer.ts`, `sprite-pack-kernel.ts`, `sprite-pack-system.ts`, `shaders/common/sprite-instance.*`, `frame.*`, `storage-emulation.glsl` | 07 §3, §10〜11 |
| T-4.4 | CPU 補助パス             | `render/sprite/sprite-path-cpu-assisted.ts`, `sprite-cpu-cull-kernel.ts`, `sprite-renderer.ts`, `shaders/sprite/*`                                                                                                                                         | 07 §7, §9      |
| T-4.5 | GPU プリミティブ         | `compute/index.ts`, `gpu-prefix-sum.ts`, `gpu-radix-sort.ts`, `shaders/scan/prefix-sum.wgsl`, `shaders/sort/radix-sort.wgsl`                                                                                                                               | 07 §8, 10 §4   |
| T-4.6 | GPU 駆動パス             | `render/sprite/sprite-path-gpu-driven.ts`, `shaders/cull/*`                                                                                                                                                                                                | 07 §8          |
| T-4.7 | カメラ・グラフ・レンダラ | `render/camera/*` (`camera-fx-pass.ts` を除く), `render/graph/*`, `render/renderer.ts`, `shaders/post/fullscreen.*`, `shaders/post/blit.frag.glsl`, `bench/scenes/static-sprites.ts`                                                                       | 07 §6, §12〜13 |

受け入れ条件 (追加):

- T-4.2: `frame-table` の派生フレーム `getDerivedFrame` (同じ組み合わせで同じ ID、`MAX_FRAMES` 超過で `CapacityExceeded`) と `WHITE_FRAME_ID` の予約をユニットテストで検証。`texture-array-manager` は圧縮テクスチャ配列 (07 §5) を、対応形式の選択順 (BC7 → ASTC → ETC2) を含めて実装する
- T-4.3: レイアウトテストで TS のオフセットと WGSL/GLSL の構造体定義が一致することを文字列解析で検証。`FLAG_OCCLUDER` (bit 5) と `FRAME_PAGE_COMPRESSED_BIT` を含む。`sprite-pack-kernel` を `src/worker-main.ts` に登録する
- T-4.4: スプライトシェーダは RGBA8 配列と圧縮配列の両方をバインドし `textureSampleLevel` / `textureLod` で読む (07 §5)。`sprite-cpu-cull-kernel` を `src/worker-main.ts` に登録する
- T-4.4: 両バックエンドでゴールデン画像 (layer/sortKey/flip/tint/opaque/additive を含む 64 スプライトのシーン)
- T-4.5: 10 §4 のパリティテスト
- T-4.6: T-4.4 と同じシーンで GPU 駆動パスのゴールデン画像が CPU 補助パスと一致
- T-4.7: 07 §13 の性能基準 (`pnpm bench -- --scene static-sprites --backend webgpu` と `--backend webgl2`)。結果を `bench/baseline.json` に登録。レンダーグラフの既定パス順は 07 §12 (未実装のパスは登録しないだけで、順序の定数はここで確定する)

---

## Phase 5〜10 共通ルール

### 共通の受け入れ条件 (Phase 5 以降の全タスク)

1. `docs/09-api-design.md` §4 のカタログにある名前・シグネチャ・既定値と完全一致 (レビュー記録に対応表を書く)
2. 設計規約 A1〜A14 (`docs/09-api-design.md` §2) をレビュー記録でチェックリストとして全項目確認
3. `config` を受ける API は `DEFAULT_<NAME>_CONFIG` (`Readonly`) を export し、全フィールドの既定値を JSDoc に記載 (A3)
4. 破棄済みハンドルの使用が `__DEBUG__` で `PlutoError(InvalidState)` になることをユニットテストで検証 (A5)
5. 非対応バックエンドで生成すると `PlutoError(UnsupportedFeature)` (日本語で理由と代替案)、品質表で無効化される設定は `logger.warn` を **1 回だけ** 出すことをテストで検証 (A12, A13)
6. ユーザー向け機能を追加するタスクは `examples/<kebab-name>/main.ts` (30 行以下, G5) を作成し、`tests/browser/smoke/examples.spec.ts` の対象一覧に追加して、`webgl2` プロジェクトでコンソールエラーなく 120 フレーム動作することを確認 (WebGPU 専用機能は `webgpu` プロジェクト)
7. 描画を伴う機能は両バックエンドでゴールデン画像を用意 (WebGPU 専用機能は `webgpu` のみ)。時間に依存する状態のゴールデン画像は作らず、時間依存のロジックは `ManualClock` / 固定 `dt` のユニットテスト・`readBufferAsync` で検証する
8. 新規・変更したモジュールの `index.ts`、`src/index.ts` (高レベル API)、`src/lowlevel.ts` (低レベル API) への re-export 追加はそのタスクの範囲に含む
9. 新しいシェーダは `shader-library.ts` に登録し、ブラウザテストでコンパイル成功を確認 (`pluto-shader`)
10. 性能目標のあるタスクは `pluto-perf` の手順で計測し、結果を `bench/baseline.json` に登録。目標のないベンチシーンも初回計測値をベースラインとして登録する

### 変更ファイルについて

各タスクの「変更ファイル」欄は、前のタスクで作成済みのファイルのうちそのタスクで変更してよいものを示す。欄にないファイルの変更は禁止 (`AGENTS.md` §3-1)。

---

## Phase 5 — 高レベル API v1

### T-5.1 Game / Scene / Factory / カメラ / Loader 統合

- **作成ファイル**: `src/scene/index.ts`, `game-config.ts`, `game.ts`, `scene.ts`, `scene-manager.ts`, `game-object-factory.ts`, `camera-manager.ts`, `handles/sprite-handle.ts`, `handles/sprite-batch.ts`, `src/assets/loaders/json-loader.ts`, `tests/browser/scene/*.spec.ts`, `tests/browser/smoke/examples.spec.ts`, `bench/scenes/batch-sprites.ts`, `examples/hello-sprite/`, `examples/million-sprites/`
- **変更ファイル**: `src/index.ts`, `src/lowlevel.ts`, `src/assets/index.ts`, `src/assets/loader.ts` (`json` の登録のみ), `tests/browser/fixtures/harness.ts`
- **参照**: `docs/09-api-design.md` §2〜4.6・§4.8 (カメラの T-5.1 分), `docs/01-architecture.md` §3〜4, `docs/06-rhi.md` §2・§8, `docs/07-renderer.md` §1・§3・§11, `docs/05-jobs-and-builds.md` §3.4
- **内容**:
  - `Game.create`: `GameConfig` 検証 → canvas 準備 → `createDevice` → `createScheduler({ maxWorkers })` → `World` → `Renderer` → 最初のシーン開始。
  - メインループは `docs/01-architecture.md` §3 の順序どおり。ms ⇔ 秒の変換は `game.ts` だけで行う (A7)。`World.flush()` は `Phase.PostUpdate` の最後。
  - デバイスロスト時は `logger.error` を出してループを停止する (自動復旧なし, 06 §8)。
  - `SpriteHandle` は `Transform`, `WorldTransform`, `Sprite`, `SpriteSlot` を持つエンティティを包む。`blend` は `'opaque'` → `FLAG_OPAQUE`, `'additive'` → `FLAG_ADDITIVE`, `'alpha'` → どちらも立てない。`depth` は `sortKey` (0 以上 1 未満, 範囲外は `InvalidArgument`)。`angle` は度、`rotation` はラジアン (A8)。
  - `setOrigin` は `frame-table` の派生フレームで実現する (`docs/07-renderer.md` §4)。
  - `SpriteBatch` は 1 個の `SpriteHandle` も作らない (A6)。`column(name)` は内部カラムを返し、利用者が書き換えた後は `markDirty()` を呼ぶ契約とする。
  - `json-loader.ts` で `load.json(key, url)` を提供。preload 完了時に画像・アトラスを `render/texture` に登録するのは `scene.ts`。
- **受け入れ条件**:
  1. `tests/unit/scene/game-config.test.ts`: 既定値が §4.1 と一致。`width`/`height` が 0 以下、`maxSprites` が 4,194,304 超、`scenes` が空などは `PlutoError(InvalidArgument)`
  2. `backend: 'webgl2'` / `'webgpu'` 強制時に `game.backend` が一致 (ブラウザテスト)。embed ビルドで `game.isParallel === false`
  3. T-4.4 と同じ 64 スプライトのシーンを `add.image` / `add.sprite` とハンドル API だけで構築し、**T-4.4 のゴールデン画像と一致** (両バックエンド)
  4. `SceneManager` の `start/stop/pause/resume/launch` でライフサイクル (`init → preload → create → update... → shutdown`) が仕様順に呼ばれることをテストで検証。`launch` で 2 シーンが重なって描画される
  5. Loader: `'progress'` が単調増加して最後に 1、`'complete'` が 1 回、存在しない URL で `'error'` と `PlutoError(AssetLoadFailed)`
  6. カメラ: `cameras.add` が `MAX_CAMERAS` (8) を超えると `PlutoError(CapacityExceeded)`。`screenToWorld` が `centerOn`/`setZoom`/`setRotation` の逆変換になっている (誤差 1e-4 以内)。`startFollow(handle, lerp)` の追従値をテストで検証
  7. `game.destroy()` で rAF 停止・Worker 終了 (`scheduler.dispose()`)・GPU リソース解放が行われる
  8. `bench/scenes/batch-sprites.ts` (`add.sprites` で 100 万静止スプライト) の p99 が `static-sprites` ベースラインの 10% 以内
  9. 例: `examples/hello-sprite` (画像 1 枚を表示して回転)、`examples/million-sprites` (`add.sprites` で 100 万)

### T-5.2 入力

- **作成ファイル**: `src/input/` の全ファイル, `tests/browser/input/*.spec.ts`, `examples/input-basics/`
- **変更ファイル**: `src/scene/scene.ts`, `src/scene/game.ts`, `src/scene/handles/sprite-handle.ts` (`setInteractive`, ポインタイベント)
- **参照**: `docs/09-api-design.md` §4.7, `docs/02-directory-structure.md` §14, `docs/03-coding-standards.md` §7 (`document`/`window` の例外)
- **内容**:
  - `InputManager` は DOM イベントをバッファし、`Phase.PreUpdate` の直前に `snapshot()` でフレーム状態を確定する。`justDown` / `justPressed` / `justReleased` は 1 フレームだけ真。
  - `input` は `render` を import できないため、`pointer.worldX/worldY` はコンストラクタで注入する変換関数 (`(x, y, out) => void`, `CameraManager.screenToWorld` を渡す) で計算する。
  - `KeyCode` は `KeyboardEvent.code` の文字列値と一致させる。`keyboard` は `Uint8Array` で状態を持つ。
  - `gamepad.ts` は `snapshot()` 時に `navigator.getGamepads()` をポーリングする。
  - `setInteractive()` のヒットテストは CPU Tier の AABB (回転後の外接矩形) のみ。重なった場合は最前面 (layer → sortKey の大きい方) の 1 つだけがイベントを受ける。GPU Tier は対象外。
- **受け入れ条件**:
  1. ユニットテスト (Node 組込の `EventTarget` に合成イベントを dispatch): `isDown`/`justPressed`/`justReleased` のフレーム遷移、`cursors()`、マルチタッチの `pointers[]`、`wheel`
  2. 同一フレーム内の down → up を `justDown` と `justUp` の両方で取りこぼさない
  3. ブラウザテスト: Playwright の `page.mouse` / `page.keyboard` 操作で `this.input` の状態とイベント (`'pointerdown' | 'pointerup' | 'pointermove' | 'wheel'`) が期待どおり
  4. 重なった 2 スプライトのうち最前面だけが `'pointerdown'` を受ける。カメラをズーム・移動しても `worldX/worldY` とヒットテストが正しい
  5. 例: `examples/input-basics` (キーでスプライト移動、クリックで色変更)

### T-5.3 トゥイーン・タイムライン

- **作成ファイル**: `src/animation/index.ts`, `easing.ts`, `tween-store.ts`, `tween-system.ts`, `timeline.ts`, `src/scene/tween-manager.ts`, `bench/scenes/tweens.ts`, `examples/tweens/`
- **変更ファイル**: `src/scene/scene.ts`, `src/scene/game.ts` (システム登録), `src/lowlevel.ts`
- **参照**: `docs/09-api-design.md` §4.9, `docs/08-simulation.md` §4 (イージング番号表の共有), `docs/02-directory-structure.md` §20
- **内容**:
  - `easing.ts`: `Ease` 定数 (番号表) と関数。番号は WGSL 側 (T-6.2) と共有するため固定する:
    `Linear=0, QuadIn=1, QuadOut=2, QuadInOut=3, CubicIn=4, CubicOut=5, CubicInOut=6, QuartIn=7, QuartOut=8, QuartInOut=9, QuintIn=10, QuintOut=11, QuintInOut=12, SineIn=13, SineOut=14, SineInOut=15, ExpoIn=16, ExpoOut=17, ExpoInOut=18, CircIn=19, CircOut=20, CircInOut=21, BackIn=22, BackOut=23, BackInOut=24, ElasticIn=25, ElasticOut=26, ElasticInOut=27, BounceIn=28, BounceOut=29, BounceInOut=30` (Penner 系 30 種 + Linear)。
  - トゥイーン対象プロパティは `x, y, rotation, angle, scaleX, scaleY, alpha`。`angle` は scene 層でラジアンに変換して `rotation` として登録。`alpha` は `Sprite.tint` の byte3 を書き換える。
  - `tween-system.ts` は `Phase.Update` で動き、HOT 規則に従う (フレーム中の確保なし)。`onComplete` などのコールバックはシステム実行後にメインスレッドでまとめて呼ぶ。
  - `repeat: -1` は無限。`yoyo` は往復で 1 回と数える。対象エンティティが despawn されたトゥイーンは自動で除去する。
  - `timeline(steps)`: 配列の要素は順に実行、要素が配列なら並列 (`TimelineHandle`: `play`, `pause`, `stop`, `on('complete')`)。
- **受け入れ条件**:
  1. 全イージングで `f(0) = 0` かつ `f(1) = 1` (誤差 1e-6)。既知値 (`QuadIn(0.5) = 0.25`, `CubicOut(0.5) = 0.875`, `BounceOut` の区間境界値など) が一致
  2. `ManualClock` 固定ステップで、`delayMs`・`durationMs`・`repeat`・`yoyo` の各時刻の値が期待値と一致し、`onComplete` が正確に 1 回
  3. 不明な `ease` 名・`durationMs < 0` は `PlutoError(InvalidArgument)`
  4. タイムラインの直列/並列の合計時間と完了イベントが正しい
  5. `bench/scenes/tweens.ts` (CPU Tier 10 万トゥイーン同時実行) を計測しベースライン登録。`tween-system` の CPU 時間を記録
  6. 例: `examples/tweens`

### T-5.4 フレームアニメーション

- **作成ファイル**: `src/animation/frame-animation.ts`, `frame-animation-system.ts`, `src/scene/anims-manager.ts`, `examples/frame-animation/`
- **変更ファイル**: `src/animation/index.ts`, `src/scene/scene.ts`, `src/scene/game.ts`, `src/scene/handles/sprite-handle.ts` (`play`, `'animationcomplete'` イベント)
- **参照**: `docs/09-api-design.md` §4.4・§4.9
- **内容**:
  - `frame-animation.ts`: アニメ定義 (フレーム ID 列・`frameRate`・`repeat`) の表と、エンティティごとの再生状態コンポーネント (`animId`, `elapsed`, `isPlaying`)。
  - `anims.frames(texture, { prefix, start, end, zeroPad? })` はフレーム名 `prefix + 数字 (zeroPad 桁で 0 埋め)` を解決する。存在しないフレームは `PlutoError(AssetNotFound)`。
  - `frame-animation-system.ts` は `Phase.Update` で `Sprite.frame` を書き換える (HOT)。
- **受け入れ条件**:
  1. 固定 `dt` で各時刻のフレーム index が `floor(elapsed * frameRate)` に従う。`repeat: -1` でループ、`repeat: n` で n 回後に最終フレームで停止し `'animationcomplete'` が 1 回
  2. 重複キーの `anims.create` は `PlutoError(InvalidArgument)`、未登録キーの `play` は `PlutoError(InvalidArgument)`
  3. `frames()` の 0 埋め (`zeroPad: 3` で `walk001`) をテストで検証
  4. 例: `examples/frame-animation`

### T-5.5 タイマー・カメラエフェクト

- **作成ファイル**: `src/scene/timer-manager.ts`, `src/render/camera/camera-fx-pass.ts`, `src/shaders/post/solid-color.wgsl`, `src/shaders/post/solid-color.frag.glsl`, `examples/timers-camera-fx/`
- **変更ファイル**: `src/scene/scene.ts`, `src/scene/camera-manager.ts` (`shake`, `fade`, `flash`), `src/render/renderer.ts` (`camera:fx` の登録), `src/render/index.ts`, `src/shaders/shader-library.ts`
- **参照**: `docs/09-api-design.md` §4.8〜4.9, `docs/03-coding-standards.md` §7 (`setTimeout` 禁止)
- **内容**:
  - タイマーはフレーム時間ベース (`setTimeout` 不使用)。戻り値 `TimerEvent` と `timeScale` の適用範囲 (タイマーのみ) は `docs/09-api-design.md` §4.9。
  - `shake` は `createRng(seed)` による決定的なオフセット (最大振幅 = `intensity × ビューポート短辺`)。`fade` / `flash` は `camera:fx` パス (`camera-fx-pass.ts` + `solid-color` シェーダ, `docs/07-renderer.md` §12) で描く。仕様は `docs/09-api-design.md` §4.9a。
- **受け入れ条件**:
  1. `delayedCall` が累積時間 ≥ `delayMs` になった最初のフレームで 1 回だけ呼ばれる。`addLoop(intervalMs, cb, repeat)` が `repeat` 回で止まる。`timeScale = 0` で停止、`2` で倍速
  2. コールバック内でのタイマー追加・削除が同フレームの走査を壊さない
  3. `shake` のオフセットが振幅以内で、終了後に元の位置へ戻る。`fade` 完了後の画面が指定色一色 (ゴールデン画像, 両バックエンド)
  4. 例: `examples/timers-camera-fx`

### T-5.6 Group / Container

- **作成ファイル**: `src/scene/handles/group-handle.ts`, `container-handle.ts`, `examples/groups-containers/`
- **変更ファイル**: `src/scene/game-object-factory.ts`, `src/scene/index.ts`
- **参照**: `docs/09-api-design.md` §4.3, `docs/02-directory-structure.md` §11・§22
- **内容**:
  - `ContainerHandle` は `transform` の `Parent` / `HierarchyDepth` を使う。子は `add(handle)` / `remove(handle)`。コンテナの `destroy()` は子も破棄する。
  - `GroupHandle` / `ContainerHandle` の API は `docs/09-api-design.md` §4.9b。
- **受け入れ条件**:
  1. コンテナの移動・回転・拡大が子のワールド座標に反映される (ユニット: 参照計算と 1e-5 以内, ブラウザ: ゴールデン画像)
  2. 深さ 8 のネストで正しく描画される。循環 (自分の祖先を子にする) は `PlutoError(InvalidArgument)`
  3. グループの一括操作が全メンバーに反映され、破棄済みメンバーは自動で除外される
  4. 例: `examples/groups-containers`

---

## Phase 6 — GPU シミュレーション I (マイルストーン: 100 万群衆)

### T-6.1 空間ハッシュ

- **作成ファイル**: `src/compute/gpu-spatial-hash.ts`, `cpu-spatial-hash.ts`, `src/shaders/spatial/spatial-hash.wgsl`, `tests/browser/compute/*.spec.ts`
- **変更ファイル**: `src/compute/index.ts`, `src/shaders/shader-library.ts`
- **参照**: `docs/08-simulation.md` §3
- **内容**: 08 §3 のカウンティングソート方式 (`cs_cell` → `cs_count` → `gpu-prefix-sum` → `cs_scatter`)。ハッシュ式・定数は 08 §3 のとおり。CPU 版は物理用で同じハッシュ式を使う。内部プリミティブのため高レベル API・例は不要。
- **受け入れ条件**:
  1. `tableSize` が 2 の冪でない、または要素数未満なら `PlutoError(InvalidArgument)`
  2. CPU 版: 近傍探索結果がブルートフォースと一致 (シード 10 種, ユニットテスト)
  3. GPU 版 (WebGPU): `cellStart` / `cellCount` が CPU 参照と完全一致、各セル内の index 集合が一致 (順序は不問。ソートして比較)。サイズ 1〜2^20 のランダム入力 10 種
  4. 100 万要素の構築 GPU 時間 (`timestamp-query`) をレビュー記録に記載

### T-6.2 パーティクル

- **作成ファイル**: `src/sim/index.ts`, `gpu-group.ts`, `particles/` の全ファイル, `src/compute/gpgpu-pass.ts`, `src/shaders/particles/` の全ファイル, `src/scene/handles/particles-handle.ts`, `tests/browser/sim/*.spec.ts`, `bench/scenes/particles.ts`, `examples/particles/`
- **変更ファイル**: `src/compute/index.ts`, `src/shaders/shader-library.ts`, `src/render/sprite/sprite-buffer.ts` (GPU Tier 範囲の割当), `src/render/sprite/sprite-path-cpu-assisted.ts` (グループ範囲の描画, 07 §9 #4), `src/render/index.ts`, `src/scene/game-object-factory.ts`
- **参照**: `docs/08-simulation.md` §1・§2・§4, `docs/07-renderer.md` §9〜10, `docs/06-rhi.md` §7
- **内容**:
  - `src/animation/easing.ts` は変更しない (番号表を WGSL に写すだけ)。
  - `GpuGroup`: `GPU_GROUP_ALIGN` 整列のスロット範囲を所有。コマンド (`spawn`, `killAll`, `setParam`) は 1 フレーム 1 回転送。
  - 更新式・補間・生成・乱数 (`pcg_hash(index ^ frame)`) は 08 §4 のとおり。WGSL のイージングは 8 種のみ・番号は T-5.3 の `Ease` と一致。
  - WebGL2 は `gpgpu-pass.ts` (ping-pong の `RGBA32F` ターゲット) で更新し、スプライトデータテクスチャの自グループ行へ fragment 出力で書き込む。
  - `aliveEstimate` は CPU 側の emit 数と寿命から推定する (GPU 読み戻ししない)。
- **受け入れ条件**:
  1. 固定 `dt` で N ステップ実行後の `posX/posY/velX/velY/age` を `readBufferAsync` で読み、CPU 参照実装と誤差 1e-4 以内 (WebGPU / WebGL2 両方)
  2. 寿命切れ要素のスプライト `flags` が 0、リング方式で `emitCursor` が `capacity` で折り返す
  3. `capacity` が `GPU_GROUP_ALIGN` の倍数に切り上げられる。スプライト容量不足は `PlutoError(CapacityExceeded)`
  4. ハーネスから固定 `dt` で駆動したシーンのゴールデン画像 (両バックエンド)
  5. `bench/scenes/particles.ts`: WebGPU 100 万パーティクルで p99 ≤ 6.94ms、シミュレーション GPU 時間 ≤ 2.0ms (`.agents/rules/02-performance.md` 予算)
  6. 例: `examples/particles` (クリックで `explode`)

### T-6.3 群衆 (フローフィールド + 追従)

- **作成ファイル**: `src/sim/crowd/crowd-config.ts`, `crowd-buffers.ts`, `flow-field.ts`, `crowd-system.ts`, `src/shaders/crowd/flow-field.wgsl`, `flow-field.gpgpu.frag.glsl`, `crowd-steer.wgsl`, `crowd-steer.gpgpu.frag.glsl`, `src/scene/handles/crowd-handle.ts`, `bench/scenes/crowd.ts`, `examples/crowd/`
- **変更ファイル**: `src/sim/index.ts`, `src/shaders/shader-library.ts`, `src/scene/game-object-factory.ts`
- **参照**: `docs/08-simulation.md` §2・§5.1〜5.3, `docs/09-api-design.md` §3・§4.10
- **内容**: 08 §5.2 (FIM, WebGPU 1 フレーム最大 32 反復 / WebGL2 ヤコビ 64 反復, 変化量 < 1e-4 で停止, 壁コスト 1e30, `MAX_FLOW_GOALS = 8`) と §5.3 の追従式に忠実に実装。群衆は固定数 (spawn は初期化時のみ)。
- **受け入れ条件**:
  1. 障害物ありの小格子 (例 64×64) で、収束後の `phi` が CPU 参照 (Dijkstra ベースの Fast Marching) と相対誤差 5% 以内、方向場が正規化されている (WebGPU / WebGL2 両方)
  2. 複数フレームに分散しても収束すること、ゴール変更後に再収束すること
  3. 固定 `dt` で 600 ステップ後、壁セル内にいるエージェントが 0
  4. ゴール数が 8 を超えると `PlutoError(CapacityExceeded)`
  5. **G2**: `bench/scenes/crowd.ts` count=1,000,000 (WebGPU, `avoidance: false`) で p99 ≤ 6.94ms
  6. 例: `examples/crowd` (`docs/09-api-design.md` §3 のコードそのもの)

### T-6.4 群衆 PBD 衝突回避

- **作成ファイル**: `src/sim/crowd/crowd-pbd.ts`, `src/shaders/crowd/crowd-pbd.wgsl`, `examples/crowd-avoidance/`
- **変更ファイル**: `src/sim/crowd/crowd-system.ts`, `crowd-config.ts`, `src/scene/handles/crowd-handle.ts`, `src/shaders/shader-library.ts`
- **参照**: `docs/08-simulation.md` §2・§5.4, `docs/09-api-design.md` §4.10 (A13)
- **内容**: 08 §5.4 のとおり。近傍探索は T-6.1 の GPU 空間ハッシュ (セル = 最大半径 × 2)。補正は各エージェントが近傍から自分の分だけ集計して書く (atomic 不使用)。
- **受け入れ条件**:
  1. 重なった 2 体が `pbdIterations` 回の反復後に距離 ≥ `ri + rj - 1e-3` まで離れる
  2. 小規模 (N ≤ 1024) で CPU 参照実装と位置誤差 1e-4 以内 (和の順序差を許容)
  3. WebGL2 で `avoidance: true` を指定すると `logger.warn` が 1 回出て無効化される (A13)
  4. `bench/scenes/crowd.ts` を `avoidance: true` でも計測しベースライン登録。**250,000 体で p99 ≤ 6.94ms** (`docs/08-simulation.md` §8)
  5. 例: `examples/crowd-avoidance`

---

## Phase 7 — 流体

> 流体の可視化は T-7.4 で実装するため、T-7.1〜T-7.3 の例 (`examples/`) は T-7.4 でまとめて作成する (A1 の例外。`docs/09-api-design.md` A15)。T-7.1〜T-7.3 の検証は `readBufferAsync` による数値検証で行う。

### T-7.1 Stable Fluids (格子)

- **作成ファイル**: `src/sim/fluid/fluid-config.ts`, `stable-fluids.ts`, `fluid-system.ts`, `src/shaders/fluid/stable-fluids.wgsl`, `stable-fluids.gpgpu.frag.glsl`, `src/scene/handles/fluid-handle.ts`
- **変更ファイル**: `src/sim/index.ts`, `src/shaders/shader-library.ts`, `src/scene/game-object-factory.ts`
- **参照**: `docs/08-simulation.md` §6.1, `docs/10-testing-strategy.md` §4, `docs/09-api-design.md` §4.10
- **内容**: 08 §6.1 の 1 ステップ順序 (移流 → 外力 → 発散 → 圧力ヤコビ (既定 20) → 勾配減算 → 密度移流 → 散逸)、外周 no-slip。`FluidHandle` は `type: 'grid'` を実装し、`addForce` / `addDye` を提供。`'pbf'` / `'mpm'` は `// TODO(T-7.2)` / `// TODO(T-7.3)` 付きで `PlutoError(UnsupportedFeature)`。
- **受け入れ条件**:
  1. **パリティ**: 同じ初期条件で 10 ステップ後の密度の最大誤差が WebGPU と WebGL2 で ≤ 1e-3 (10 §4)
  2. 投影後の速度場の平均 |発散| が投影前の 1/10 以下
  3. 外周セルの速度が 0
  4. `bench/scenes/fluid-grid.ts` は T-7.4 で作成 (ここでは不要)

### T-7.2 PBF

- **作成ファイル**: `src/sim/fluid/pbf.ts`, `src/shaders/fluid/pbf.wgsl`
- **変更ファイル**: `src/sim/fluid/fluid-system.ts`, `fluid-config.ts`, `src/scene/handles/fluid-handle.ts`, `src/shaders/shader-library.ts`
- **参照**: `docs/08-simulation.md` §2・§6.2
- **内容**: 08 §6.2 の定数 (`epsilon = 100`, `solverIterations = 3`, `sCorr k=0.1 n=4 Δq=0.2h`, XSPH `c=0.01`)。近傍は T-6.1 の GPU 空間ハッシュ (セル = h)。WebGL2 は非対応。
- **受け入れ条件**:
  1. 静止した箱の中で 600 ステップ後、平均密度が `restDensity` の ±5% 以内、NaN/Inf なし、全粒子が境界内
  2. 小規模 (N ≤ 1024) の 1 ステップが CPU 参照実装と誤差 1e-4 以内
  3. `FluidHandle.isSupported(game, 'pbf')` が WebGL2 で false、生成すると `PlutoError(UnsupportedFeature)` (A12)

### T-7.3 MLS-MPM

- **作成ファイル**: `src/sim/fluid/mls-mpm.ts`, `src/shaders/fluid/mls-mpm.wgsl`
- **変更ファイル**: `src/sim/fluid/fluid-system.ts`, `fluid-config.ts`, `src/scene/handles/fluid-handle.ts`, `src/shaders/shader-library.ts`
- **参照**: `docs/08-simulation.md` §2・§6.3
- **内容**: 二次 B スプライン + APIC、材料は `water` / `jelly` のみ (`sand`/`snow` 等は `PlutoError(InvalidArgument)`)。P2G は固定小数点 `atomicAdd<i32>` (`FIXED_POINT_SCALE = 1e5`)。サブステップ既定 4。
- **受け入れ条件**:
  1. P2G 後の格子質量の総和が粒子質量の総和と固定小数点誤差の範囲で一致
  2. 小規模 (N ≤ 1024) の 1 ステップが CPU 参照実装と誤差 1e-3 以内
  3. `jelly` のブロックを落下させて 600 ステップ後も NaN なし、体積変化 ±20% 以内
  4. WebGL2 で `isSupported` が false、生成すると `PlutoError(UnsupportedFeature)`

### T-7.4 流体描画

- **作成ファイル**: `src/sim/fluid/fluid-renderer.ts`, `src/shaders/fluid/fluid-render.wgsl`, `fluid-render.vert.glsl`, `fluid-render.frag.glsl`, `bench/scenes/fluid-grid.ts`, `bench/scenes/fluid-particles.ts`, `examples/fluid-grid/`, `examples/fluid-pbf/`, `examples/fluid-mpm/`
- **変更ファイル**: `src/sim/fluid/fluid-system.ts`, `src/sim/index.ts`, `src/shaders/shader-library.ts`, `src/render/renderer.ts` (`sim:*` パスの登録口のみ)
- **参照**: `docs/08-simulation.md` §6.4, `docs/07-renderer.md` §12
- **受け入れ条件**:
  1. 格子流体: 固定ステップ後の密度テクスチャ合成のゴールデン画像 (両バックエンド)
  2. 粒子流体: 加算描画 → 閾値メタボール合成のゴールデン画像 (WebGPU)
  3. ベンチ 2 種が `docs/08-simulation.md` §8 の基準を満たし、ベースライン登録
  4. 例: `examples/fluid-grid` (両バックエンド), `examples/fluid-pbf`, `examples/fluid-mpm` (WebGPU)

---

## Phase 8 — 物理

### T-8.1 アーケード物理

- **作成ファイル**: `src/physics/index.ts`, `arcade/` の全ファイル, `src/scene/physics-manager.ts`, `src/scene/handles/body-handle.ts`, `bench/scenes/cpu-entities.ts`, `examples/arcade-physics/`
- **変更ファイル**: `src/jobs/kernel-registry.ts` (積分カーネルの登録), `src/scene/scene.ts`, `src/scene/game.ts` (`Phase.FixedUpdate`), `src/lowlevel.ts`
- **参照**: `docs/08-simulation.md` §7.1, `docs/09-api-design.md` §4.11, `docs/05-jobs-and-builds.md` §2 (カーネル契約)
- **内容**: 08 §7.1 のとおり。積分・境界はカーネル (並列可)、衝突検出は `cpu-spatial-hash`。衝突ペアは `RingBuffer` に積み、ステップ後にメインスレッドで `collide` / `overlap` を発火。
- **受け入れ条件**:
  1. ユニット: 半陰的オイラー積分、`drag`、`maxSpeed`、`bounce`、ワールド境界、AABB-AABB / 円-円 / AABB-円 の最小侵入軸分離、`isSensor` は分離せず `overlap` のみ、`isStatic` は動かない
  2. 積分カーネルの Serial / Threaded パリティ (ビット一致, ブラウザテスト)
  3. `collide(a, b, cb)` のコールバックがペアごとに 1 ステップ 1 回
  4. **G4 / 08 §7.1**: `bench/scenes/cpu-entities.ts` (動的ボディ 10 万 + Transform + スプライトパック) の CPU ロジック時間 ≤ 2ms (`pnpm bench -- --scene cpu-entities --build parallel` の `cpuMs`)
  5. 例: `examples/arcade-physics`

### T-8.2 XPBD 剛体

- **作成ファイル**: `src/physics/rigid/` の全ファイル, `bench/scenes/rigid-bodies.ts`, `examples/rigid-bodies/`
- **変更ファイル**: `src/physics/index.ts`, `src/scene/physics-manager.ts` (`rigid.*`), `src/scene/handles/body-handle.ts`
- **参照**: `docs/08-simulation.md` §7.2
- **内容**: 形状は円・凸多角形 (最大 8 頂点)・カプセル。円-円は解析、多角形は SAT。サブステップ既定 8、位置反復 1、非貫通 + 静/動摩擦。GPU 剛体は実装禁止。
- **受け入れ条件**:
  1. ナローフェーズ: 各形状ペアの接触法線・侵入深さが解析解と一致 (ユニット)。9 頂点以上・非凸は `PlutoError(InvalidArgument)`
  2. 10 個の箱の積み重ねが 600 ステップ後も崩れない (各箱の位置ずれ < 1px)
  3. 斜面上の箱が `atan(μs)` 未満の傾斜で静止し、超えると滑る
  4. 大きな速度でもエネルギーが発散しない (600 ステップで運動エネルギーが初期値を超えない)
  5. ベンチを計測しベースライン登録。例: `examples/rigid-bodies`

---

## Phase 9 — コンテンツ機能

### T-9.1 KTX2

- **作成ファイル**: `src/assets/loaders/ktx2-loader.ts`, `examples/ktx2-textures/`
- **変更ファイル**: `src/assets/loader.ts` (`ktx2`), `src/assets/index.ts`, `src/scene/scene.ts` (preload 完了時の圧縮テクスチャ登録)
- **参照**: `docs/02-directory-structure.md` §13, `docs/00-vision.md` §3 (WASM 禁止), `docs/06-rhi.md` §3・§5, `docs/07-renderer.md` §4〜5
- **内容**: 圧縮テクスチャ配列と RHI 対応は T-3.x / T-4.2 で実装済みの前提。ここではローダーと高レベル API の接続のみ。
- **受け入れ条件**:
  1. KTX2 ヘッダ・レベルインデックス・DFD を解析 (ユニット, 合成バイナリ)
  2. Basis Universal / zstd 超圧縮は `PlutoError(UnsupportedFeature)` (WASM 禁止のため, 日本語で代替案を提示)
  3. デバイスが対応しないフォーマットは `PlutoError(UnsupportedFeature)`。`load.ktx2(key, url)` で読んだテクスチャのゴールデン画像 (WebGPU)

### T-9.2 MSDF テキスト

- **作成ファイル**: `src/assets/loaders/msdf-font-loader.ts`, `src/render/text/` の全ファイル, `src/shaders/text/` の全ファイル, `src/scene/handles/text-handle.ts`, `examples/text/`
- **変更ファイル**: `src/assets/loader.ts` (`font`), `src/render/renderer.ts` (`text:draw` パス), `src/render/index.ts`, `src/shaders/shader-library.ts`, `src/scene/game-object-factory.ts`
- **参照**: `docs/09-api-design.md` §4.3・§4.6, `docs/07-renderer.md` §12
- **内容**: msdf-atlas-gen JSON (メトリクス・カーニング) のパース。API は `docs/09-api-design.md` §4.9c。
- **受け入れ条件**:
  1. `text-layout.ts` ユニット: 改行、左/中央/右揃え、カーニング、未知グリフの扱い
  2. ゴールデン画像 (両バックエンド, 拡大・回転・色)
  3. `setText` で内容が変わっても GPU リソースの再生成をしない (事前確保容量内)。容量超過は `PlutoError(CapacityExceeded)`
  4. 例: `examples/text`

### T-9.3 タイルマップ

- **作成ファイル**: `src/assets/loaders/tiled-loader.ts`, `src/render/tilemap/` の全ファイル, `src/shaders/tilemap/` の全ファイル, `src/scene/handles/tilemap-handle.ts`, `bench/scenes/tilemap.ts`, `examples/tilemap/`
- **変更ファイル**: `src/assets/loader.ts` (`tilemap`), `src/render/renderer.ts`, `src/render/index.ts`, `src/shaders/shader-library.ts`, `src/scene/game-object-factory.ts`
- **参照**: `docs/09-api-design.md` §4.3・§4.6
- **内容**: Tiled JSON の orthogonal マップ・タイルレイヤー・非圧縮データ (配列 / base64) と GID のフリップビットに対応。gzip / zlib は `DecompressionStream` で展開。API・対応範囲は `docs/09-api-design.md` §4.9c。
- **受け入れ条件**:
  1. ローダー: GID のフリップビット分解、複数タイルセット、未対応形式 (isometric 等) は `PlutoError(UnsupportedFeature)` (ユニット)
  2. `tilemap-data.ts`: チャンク分割とタイル書換で該当チャンクだけ dirty になる (ユニット)
  3. ゴールデン画像 (両バックエンド)。大マップでカメラ外チャンクを描画しない
  4. ベンチを計測しベースライン登録。例: `examples/tilemap`

### T-9.4 図形

- **作成ファイル**: `src/render/graphics/` の全ファイル, `src/shaders/graphics/` の全ファイル, `src/scene/handles/graphics-handle.ts`, `examples/graphics/`
- **変更ファイル**: `src/render/renderer.ts` (`graphics:draw` パス), `src/render/index.ts`, `src/shaders/shader-library.ts`, `src/scene/game-object-factory.ts`
- **参照**: `docs/09-api-design.md` §4.3, `docs/07-renderer.md` §12
- **内容**: API・テッセレーション規則は `docs/09-api-design.md` §4.9c。
- **受け入れ条件**:
  1. `shape-builder.ts` ユニット: 矩形・円・多角形・線のテッセレーション結果の三角形数と面積が解析値と一致 (誤差 1e-3)。自己交差多角形の扱いを明記しテスト
  2. ゴールデン画像 (両バックエンド)
  3. 例: `examples/graphics`

### T-9.5 ライティング

- **作成ファイル**: `src/render/lighting/` の全ファイル, `src/shaders/lighting/` の全ファイル, `src/scene/handles/light-handle.ts`, `src/scene/lights-manager.ts`, `examples/lighting/`
- **変更ファイル**: `src/render/renderer.ts` (`lighting` パス), `src/render/index.ts`, `src/shaders/shader-library.ts`, `src/scene/game-object-factory.ts`, `src/scene/scene.ts`, `src/scene/handles/sprite-handle.ts` (`setOccluder`), `src/scene/handles/tilemap-handle.ts` (`setLayerOccluder`)
- **参照**: `docs/08-simulation.md` §2 (2D GI は WebGPU のみ), `docs/07-renderer.md` §12
- **内容**: 点光源の加算合成は両バックエンド。Radiance Cascades (JFA による SDF 生成を含む) は WebGPU のみ。API (`LightHandle`, `this.lights`, 遮蔽物 `FLAG_OCCLUDER`) は `docs/09-api-design.md` §4.9c、合成方法は `docs/07-renderer.md` §12。
- **受け入れ条件**:
  1. `light-store.ts` ユニット (光源の追加・削除・容量超過)
  2. 点光源のゴールデン画像 (両バックエンド)、Radiance Cascades のゴールデン画像 (WebGPU)
  3. WebGL2 で GI を要求すると `logger.warn` 1 回で点光源のみに縮退 (A13)、`isSupported` で事前確認できる (A12)
  4. 例: `examples/lighting`

### T-9.6 オーディオ

- **作成ファイル**: `src/audio/` の全ファイル, `src/assets/loaders/audio-loader.ts`, `src/scene/sound-manager.ts`, `examples/audio/`
- **変更ファイル**: `src/assets/loader.ts` (`audio`), `src/scene/scene.ts`, `src/lowlevel.ts`
- **参照**: `docs/09-api-design.md` §4.6・§4.12, `docs/01-architecture.md` §1 (`audio` → `assets` の依存方向)
- **内容**: `audio-loader.ts` は `assets` が `audio` を import できないため、デコード用の `BaseAudioContext` を外部から注入される。ユーザー操作 (pointerdown / keydown) で `AudioContext` をアンロックする。
- **受け入れ条件**:
  1. ユニット (`AudioContext` は境界としてモック可): 音量・パン・ループ・レート・ミュートの反映、アンロック前の `play` はアンロック後に再生される
  2. 不正値 (`volume < 0` 等) は `PlutoError(InvalidArgument)`
  3. ブラウザテスト: 読込・再生・停止でエラーが出ない
  4. 例: `examples/audio`

### T-9.7 ポストエフェクト

- **作成ファイル**: `src/render/post/` の全ファイル, `src/shaders/post/bloom.*`, `src/shaders/post/tonemap.*`, `src/scene/fx-manager.ts`, `examples/post-effects/`
- **変更ファイル**: `src/render/renderer.ts`, `src/render/graph/render-graph.ts`, `src/render/index.ts`, `src/shaders/shader-library.ts`, `src/scene/scene.ts`
- **参照**: `docs/07-renderer.md` §12, `docs/09-api-design.md` §4.12
- **受け入れ条件**:
  1. ポストエフェクトがない時は swapchain へ直接描画、ある時は `RGBA16Float` 中間ターゲット (07 §12) であることをテストで検証
  2. `fx.bloom` / `fx.colorMatrix('grayscale' | 'sepia' | 'none')` のゴールデン画像 (両バックエンド)
  3. `fx.clear()` 後の画像が T-5.1 のゴールデン画像と一致
  4. 例: `examples/post-effects`

---

## Phase 10 — 仕上げ

### T-10.1 devtools

- **作成ファイル**: `src/devtools/` の全ファイル
- **変更ファイル**: `src/scene/game.ts` (`GameConfig.debug.stats`), `src/lowlevel.ts`
- **参照**: `docs/02-directory-structure.md` §21, `docs/06-rhi.md` §3・§7 (timestamp)
- **受け入れ条件**:
  1. `stats-collector`: フレーム時間 (mean / p99)・エンティティ数・ドローコール数が既知シーンで期待値
  2. `gpu-timer`: `caps.timestampQuery === false` の環境では `null` を返し例外を出さない
  3. `debug: { stats: true }` でオーバーレイが表示され、`false` (既定) では DOM を作らない
  4. devtools 有効時でも `static-sprites` ベンチの p99 悪化が 10% 以内

### T-10.2 サンプル集

- **作成ファイル**: `examples/shared-assets/*`, `examples/showcase/` (複数機能を組み合わせた小さなゲーム)
- **変更ファイル**: 既存の `examples/**`, `tests/browser/smoke/examples.spec.ts`
- **受け入れ条件**:
  1. **G5**: 全サンプルの `main.ts` が 30 行以下 (行数をレビュー記録に表で記載)
  2. 全サンプルが smoke テストで `webgl2` (WebGPU 専用は `webgpu`) と `embed` プロジェクトの両方でエラーなく動作
  3. カタログ (`docs/09-api-design.md` §4) の全 API が少なくとも 1 つのサンプルで使われている (対応表)

### T-10.3 API リファレンス生成

- **作成ファイル**: `tools/gen-api-docs.mjs`, `docs/api/*.md` (生成物)
- **変更ファイル**: `package.json` (scripts に `docs:api` を追加, `docs/11-build-and-release.md` §3)
- **内容**: `typescript` の Compiler API で `src/index.ts` と `src/lowlevel.ts` の公開シンボルを辿り、`docs/api/index.md` (高レベル) と `docs/api/lowlevel.md` を出力する。`docs/api/` は生成物で、手編集しない。
- **受け入れ条件**:
  1. `src/index.ts` と `src/lowlevel.ts` から公開される全シンボルが日本語 JSDoc 付きで出力される
  2. JSDoc が欠けた公開シンボルがあれば `pnpm docs:api` が失敗する (一時ファイルで確認)
  3. 2 回実行して差分が出ない (決定的な出力)

### T-10.4 リリース

- **作成ファイル**: `CHANGELOG.md` (`docs/11-build-and-release.md` §8), `README.md` (概要・導入・`docs/09-api-design.md` §3 の最小コード例・parallel/embed の選び方・WebGL2 の制約)
- **変更ファイル**: `package.json` (`version: 0.1.0`, `exports` を `docs/05-jobs-and-builds.md` §5 のとおり, `files`)
- **受け入れ条件**:
  1. `pnpm verify` / `pnpm build` / `pnpm test:browser` / `pnpm test:browser:embed` がすべて成功
  2. G1〜G6 の計測結果を表でレビュー記録に記載し、すべて目標を満たす
  3. `pnpm pack --dry-run` の内容が `dist/`・`package.json`・`CHANGELOG.md`・`README.md` のみ
  4. `dependencies` が空 (G6)
  5. 公開 (`npm publish`) と Git タグはユーザーの明示的な指示があるまで行わない

---

## 目標とタスクの対応

| 目標 | 内容                                  | 検証するタスク         | ベンチシーン / 証拠                     |
| ---- | ------------------------------------- | ---------------------- | --------------------------------------- |
| G1   | WebGPU 100 万静止スプライト @144FPS   | T-4.7 (T-5.1 で再確認) | `static-sprites.ts`, `batch-sprites.ts` |
| G2   | WebGPU 100 万移動エージェント @144FPS | T-6.3 (T-6.4 で再計測) | `crowd.ts`                              |
| G3   | WebGL2 10 万 @144FPS / 100 万 @60FPS  | T-4.7                  | `static-sprites.ts` backend=webgl2      |
| G4   | CPU Tier 10 万体のロジック更新 ≤ 2ms  | T-8.1                  | `cpu-entities.ts` (parallel ビルド)     |
| G5   | サンプルの `main.ts` が 30 行以下     | 各タスク / T-10.2      | `examples/**/main.ts` の行数表          |
| G6   | ランタイム依存ゼロ                    | 全タスク / T-10.4      | `package.json`                          |

---

## 決定事項 (2026-10-06)

以前の未決事項 (旧 U-1〜旧 U-10) と、コードレビューで見つかった仕様の曖昧さについて、次のとおり決定した。詳細は各仕様書に反映済み。経緯は `docs/progress/escalations.md` の E-001。

| ID   | 決定内容                                                                                                                                                                                                                                                                                    | 反映先                                            |
| ---- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- |
| D-1  | (旧 U-1) `run-bench.mjs` に `--scene/--count/--backend/--build` を追加。vsync を外したフレーム時間・`cpuMs`・`metrics` を記録し、`(scene, backend, build, count)` で比較する。T-R.5 で実装                                                                                                  | 10 §5, 11 §3, T-R.5                               |
| D-2  | (旧 U-2) RHI に BC7 / ETC2 / ASTC 4x4 と `caps.textureCompression*` を追加。圧縮テクスチャは対応形式 1 つの別テクスチャ配列にし、フレームの `page` の bit 16 で切り替える                                                                                                                   | 06 §2・§3・§5, 07 §2・§4・§5, T-3.x, T-4.2, T-4.4 |
| D-3  | (旧 U-3) `setOrigin` は `frame-table.getDerivedFrame` による派生フレームで実現                                                                                                                                                                                                              | 07 §4, 09 §4.4                                    |
| D-4  | (旧 U-4) `delayedCall` / `addLoop` は `TimerEvent` (`remove`, `isActive`) を返す。`time.timeScale` はタイマーだけに影響                                                                                                                                                                     | 09 §4.9                                           |
| D-5  | (旧 U-5) fade / flash は専用の `camera:fx` パス (`camera-fx-pass.ts` + `solid-color` シェーダ) で描く。スプライトでの代用はしない (マルチカメラで他のカメラに映り込むため)                                                                                                                  | 02 §15・§17, 07 §12, 09 §4.9a, T-5.5              |
| D-6  | (旧 U-6) Group / Container / Text / Tilemap / Graphics / Light の API を確定。ライティングの入口として `this.lights` (`scene/lights-manager.ts`) を追加。GI の遮蔽物は `FLAG_OCCLUDER`                                                                                                      | 02 §22, 07 §2・§3・§12, 09 §4.9b・§4.9c           |
| D-7  | (旧 U-7) G2 は `avoidance: false` で判定。PBD・流体・物理の暫定目標を設定                                                                                                                                                                                                                   | 08 §8                                             |
| D-8  | (旧 U-8) 流体のサンプルは T-7.4 でまとめて作る (A15)                                                                                                                                                                                                                                        | 09 §2                                             |
| D-9  | (旧 U-9) API リファレンスは `tools/gen-api-docs.mjs` (TypeScript Compiler API) で `docs/api/` に生成。`README.md` と `CHANGELOG.md` は T-10.4 で作成                                                                                                                                        | 02 §2・§3, 11 §3, T-10.3, T-10.4                  |
| D-10 | (旧 U-10) カバレッジ除外ファイルの一覧を確定。除外したファイルはブラウザテストでの検証を必須とする                                                                                                                                                                                          | 10 §2                                             |
| D-11 | `Kernel` のシグネチャは 3 引数 `(view, params, buffers)`。カーネル ID は名前の FNV-1a ハッシュ。params は常に 64 要素                                                                                                                                                                       | 02 §10, 05 §2                                     |
| D-12 | Worker のエントリは `src/worker-main.ts` (ルート直下)。組込カーネルを持つモジュールを import する。Worker は `Atomics.waitAsync` でイベント駆動にし、`syncVersion`・ジョブ番号付きカウンタ・`CTRL_ERROR`・`ARCH_COUNTS`・コンポーネント表の整合を追加 (T-R.4 で `CTRL_ACTIVE` 方式から変更) | 02 §4, 05 §3, rules/03                            |
| D-13 | `core/ecs` は `KernelRef` / `KernelExecutor` を定義し、World が `setExecutor` で受け取った Scheduler で kernel システムを実行する                                                                                                                                                           | 04 §8〜9                                          |
| D-14 | `ChunkView.chunkIndex` はクエリ全体の通し番号。Worker のミラーは `Archetype.fromShared()`                                                                                                                                                                                                   | 04 §4.2・§5                                       |
| D-15 | `MAX_ENTITIES = 4,194,303` (index 0x3FFFFF は `NULL_ENTITY` 用に予約)                                                                                                                                                                                                                       | 04 §2.1                                           |
| D-16 | `half.ts` の API は `f32ToF16` / `f16ToF32` / `packHalf2x16(lo, hi)`、最近接偶数丸め。T-1.1 の 6.1e-5 は f16 最近傍値への丸めとして検証                                                                                                                                                     | 02 §6, T-R.3                                      |
| D-17 | `commandCapacity` の単位は u32 語数。`forEachDirtyRange(fieldId, rowCount, cb)`。`ComponentSchema` は `schema.ts`                                                                                                                                                                           | 04 §3・§6・§7                                     |
| D-18 | ゴールデン画像は canvas を撮影し、`--update-snapshots` で更新、無ければ失敗。embed プロジェクトは `dist/embed` の成果物を読む。WebGPU の除外は CLI の `--project` で行う                                                                                                                    | 10 §3                                             |
| D-19 | ESLint: 設定ファイルは `export default` のみ例外、tools も lint、naming-convention の実装方法を明記。`tests/`・`bench/` は src の内部ファイルを import してよい                                                                                                                             | 03 §8, rules/03                                   |
| D-20 | (E-002) 伸長可能なバッファは使わず、固定長バッファ + 伸長時コピー。伸長したら `bufferVersion` → `structureVersion` を進め、jobs が Worker に再送する (ミラーは `rebindShared`)                                                                                                              | 04 §1.1・§4.1・§4.2, 05 §3.3                      |
