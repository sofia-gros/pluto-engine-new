# コードベースレビュー報告書 (2026-10-06)

対象: T-0.1〜T-2.2 で DONE とされた全成果物 (`src/core/**`, `src/jobs/**`, エントリ, 設定ファイル, `tools/**`, `bench/**`, `tests/**`)。
方法: 仕様書 (01〜11, `.agents/rules/`) とコードの突き合わせ + 実行確認。重要な指摘はコードを直接読んで裏取りした。

是正は `docs/12-roadmap.md` の **Phase R (T-R.1〜T-R.5)** で行う。各指摘の右端は担当タスク。

## 1. 実行結果 (2026-10-06 時点, WSL2 Ubuntu 26.04 / Node 22.22.1 / pnpm 10.0.0)

| コマンド                                    | 結果                                                                                                                                                          |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm check:structure / boundaries / rules` | OK と表示されるが、**検査がほぼ実装されていない** (§4)                                                                                                        |
| `pnpm typecheck`                            | 成功                                                                                                                                                          |
| `pnpm lint`                                 | 成功                                                                                                                                                          |
| `pnpm format:check`                         | **失敗**: `src/jobs/threaded-scheduler.ts`, `src/jobs/worker-entry.ts`, `bench/scenes/ecs-move.ts`, `tools/run-bench.mjs`, tests 3 件, `docs/progress` 4 件   |
| `pnpm test:coverage`                        | テストは 145 件すべて成功。**カバレッジ閾値未達**: `src/jobs/**` lines 13.17% / branches 5.97% (閾値 90/85)、全体 lines 83.09% / branches 74.14% (閾値 85/80) |
| `pnpm test:browser --project=webgl2`        | 2 件成功 (ハーネス・golden 比較)                                                                                                                              |
| `pnpm build` (T-R.1 で追加確認)             | **失敗**: `build:types` で `pluto-error.ts(45,11): TS2339 captureStackTrace` (T-0.3 の受け入れ条件が崩れている。T-R.3 で是正)                                 |

→ `pnpm verify` は失敗する。PROGRESS の T-2.1・T-2.2 の「`pnpm verify` 成功」という記録とは一致しない。

## 2. core (`src/core/**`) — T-R.3

### 高

| #   | 場所                                                          | 内容                                                                                                                                                                              |
| --- | ------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| C1  | `world.ts:68-70, 119-121, 148-150, 266-269`, `query.ts:88-92` | spawn・add・remove・flush のたびに全クエリへ `tryRegister` しており、重複判定がない。同じアーキタイプが何度も登録され、`count()`・`chunkCount()`・`forEachChunk` が重複して数える |
| C2  | `world.ts:88, 114, 143`                                       | swap-remove 後の移動判定が `movedEntity !== 0`。NULL_ENTITY で表を書き換えて壊すうえ、正規のエンティティ `makeEntity(0,0)` が移動したときに表を更新しない                         |
| C3  | `column.ts:75-101`, `archetype.ts:95-109`                     | 伸長のたびに新しいバッファを確保してコピーしている (`growBackingBuffer` は未使用)。`entities` も素の `Uint32Array`。parallel ビルドでは Worker との共有メモリが成立しない         |
| C4  | `system.ts:9-15`                                              | `Phase` の値が文字列。仕様は 0〜4 の数値                                                                                                                                          |
| C5  | `world.ts:43`                                                 | `maxEntities` の既定値が 4,194,304。仕様は 1,048,576                                                                                                                              |
| C6  | `world.ts:212-238`, `system.ts:32`                            | `kernel` を持つシステムが黙って無視される (`kernel?: unknown`)。World からスケジューラを使う経路がない                                                                            |

### 中

- `isIterating` が外部から書き換え可能 (`world.ts:40`)。
- クエリのキャッシュキーが `JSON.stringify(desc)` で、`all` の順序が違うと別インスタンスになる (`world.ts:192-210`)。
- `getArchetypeById` が Map の線形走査で、get/set のたびに O(アーキタイプ数) かかる (`archetype-graph.ts:60-67`)。
- マスクキーが 16 進ではなく 10 進のカンマ区切り。spawn ごとに文字列を確保する。
- HOT ファイル内の違反に `pluto-allow` がない (`archetype.ts:106,134,151`、`command-buffer.ts:59`)。
- `CommandBuffer` が容量チェック前にエンティティ index を予約しており、失敗すると index がリークする。
- 素の `Error` を throw している箇所がある (`query.ts:147`, `column.ts:38`)。
- `half.ts`: 極小値でシフト量が 32 以上になり、誤った値を返す。丸めは切り捨て (RNE ではない)。単一値の関数に `packHalf2x16` という名前を付けている。
- フィールド名 `id`・`name`・`fields` が定義本体のプロパティを上書きする (`component.ts:58-64`)。
- 他モジュールの内部ファイルを直接 import している (R3 違反)。各 `index.ts` が `export *` を使っている (03 §1.3 違反)。
- テストに異常系 (`toThrow`) がない。`half` の往復を一致ではなく近似で比較している。`rng` に参照列との照合がない。必須の `system.test.ts` がない。

### 低

- JSDoc の欠落が多数 (WorldConfig, World の一部メソッド, Phase, 各定数, logger など)。
- `chunk-view.ts:19` の確定代入 `!`。
- HOT ファイルのテンプレート文字列 (`fixed-step.ts:40-42`)。
- release ビルドで `entity-table.ts` の空 FreeList を pop する。
- `growBackingBuffer` が同サイズを拒否する。

## 3. jobs (`src/jobs/**`) — T-R.4

### 高

| #   | 場所                                                       | 内容                                                                                                                                                                                      |
| --- | ---------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| J1  | `worker-entry.ts:38-51, 171`                               | Worker 側のアーキタイプミラーが `ChunkView` と互換でない (`getColumn` のシグネチャが違う)。`as unknown as Archetype` で隠しているため、カーネルが実行時に TypeError になる                |
| J2  | `worker-entry.ts:150`                                      | Worker 側のカーネルレジストリが空 (カーネルを定義したモジュールを import していない)。ID が登録順に依存し、メインと一致する保証もない                                                     |
| J3  | `threaded-scheduler.ts:188-190`                            | Worker で例外が出ると DONE が TOTAL に届かず、メインが無限スピンする                                                                                                                      |
| J4  | `threaded-scheduler.ts:163-165`, `worker-entry.ts:159-161` | 前ジョブの Worker が `NEXT` を加算している最中に、次のジョブが `NEXT=0` にリセットできる。古いカーネルを新しい params で実行し、新ジョブの chunk 0 が飛ばされる (データ競合)              |
| J5  | `worker-entry.ts:74, 128-184`                              | `init` の直後から `Atomics.wait` の無限ループに入るため、後続の archetype / query / buffer メッセージを処理できない。`ready` も待たない。既存クエリにアーキタイプが追加されても再送しない |
| J6  | (C3 と同根)                                                | 伸長後のカラムが Worker から見えない。`as SharedArrayBuffer` と書いているが、実体は ArrayBuffer のコピー                                                                                  |
| J7  | 5 箇所                                                     | `as unknown as` (AGENTS §3-4 違反): `threaded-scheduler.ts:81`, `worker-entry.ts:147,171`, `serial-scheduler.test.ts:50,74`                                                               |

### 中

- `chunkIndex` の意味がメイン (アーキタイプ内) と Worker (グローバル) で違う。
- `MAX_KERNEL_PARAMS` が未定義。params を黙って切り捨て、前回の値もクリアしない。経路によって長さが変わる。
- HOT 違反 (`new` と `for...of`)。`@hot` タグがない。英語の調査メモ (「Wait, ...」) が残っている。JSDoc が欠落。
- `jobs/index.ts` の公開範囲が仕様より広い。
- T-2.2 の受け入れ条件 (4 Worker × 100 万でビット一致) が未検証のまま DONE になっている。

## 4. 設定・ツール — T-R.1 / T-R.2 / T-R.5

### 高

| #   | 場所                         | 内容                                                                                                                                                                                                                   |
| --- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| T1  | `tools/check-boundaries.mjs` | **何も検査せずに OK を表示する** (3 行)                                                                                                                                                                                |
| T2  | `tools/check-rules.mjs`      | `// @pluto-hot` を含むかどうかしか見ていない。禁止 API、日本語 JSDoc、`@file`、行数、HOT の禁止事項はすべて未実装                                                                                                      |
| T3  | `tools/check-structure.mjs`  | `src/` が 02 の表にあるかしか見ていない。必須ユニットテスト (例: `system.test.ts` の欠落) も、tests/bench/examples のパターンも検査しない                                                                              |
| T4  | `vite.config.ts:7-8`         | dev server (mode `development`) で `__PARALLEL__` と `__DEBUG__` がどちらも false になる (仕様はどちらも true)                                                                                                         |
| T5  | `playwright.config.ts`       | `embed` プロジェクトが embed ビルドを使っていない (dev server の src をそのまま使っている)                                                                                                                             |
| T6  | `tools/run-bench.mjs`        | 引数が `--scene` しかない。`__PARALLEL__` は false 固定、COOP/COEP なし、WebGPU フラグなし。`pnpm bench` の build 成果物も使っていない                                                                                 |
| T7  | `bench/baseline.json`        | `BenchResult[]` ではなく独自のオブジェクト。compare-bench は「ベースラインなし」と判定して exit 0 になり、回帰検出が無効。数値を出力するコード経路がなく、**T-1.10 の性能値は根拠が確認できない** (AGENTS §3-9 の疑い) |
| T8  | `bench/runner.ts:40-51`      | rAF の間隔を測っているため vsync で頭打ちになる。シーンを静的 import している                                                                                                                                          |

### 中・低

- `check-bundle` の parallel 検査が INFO 止まりで、失敗にならない。
- `golden.ts`: ゴールデン画像がなければ黙って作成する。ページ全体を撮影している。保存先がプロジェクト名。引数に testInfo を必須にしている。
- compare-bench: JSON が不正でも exit 0。
- ESLint: naming-convention の不足 (真偽値の接頭辞、列挙キー)、logger の override にテストが含まれている、仕様外の `no-empty-function: off`、tools を lint していない。
- ci.yml がブランチで絞り込んでいる。`preview.headers` がない。`verify.mjs` に要約表示がない。
- `tests/browser/smoke/harness.spec.ts:13` と `bench/scenes/ecs-move.ts:52,63` に `as unknown as`。

## 5. 仕様側の曖昧さ・矛盾 (解決済み)

レビュー中に見つかった仕様の穴は、`docs/12-roadmap.md` 末尾の「決定事項」D-11〜D-19 として決定し、各仕様書を更新した。例: Kernel のシグネチャ、カーネル ID の決め方、Worker エントリの配置、`chunkIndex` の定義、World とスケジューラの接続、`NULL_ENTITY` の衝突、`half` の API と丸め、`commandCapacity` の単位、ゴールデン画像の更新方法、embed テストの方法、ESLint の例外。

## 6. プロセス上の問題と再発防止

- **原因**: 検査ツールが空のまま Phase 0 を DONE にしたため、以降のタスクの「`pnpm check:*` 成功」が何も保証していなかった。レビュー記録も、検査結果を貼らずにチェックを付けていた。
- **対策**:
  1. T-R.1 で検査を実装する。各検査について「違反を検出できること」を一時ファイルで確認させる。
  2. Phase R 完了以降、レビュー記録には `pnpm verify` の **要約表をそのまま貼る** ことを必須にする (AGENTS §5 の既存規定を厳守)。
  3. 性能の数値は `bench/results/latest.json` の該当要素を貼る。
