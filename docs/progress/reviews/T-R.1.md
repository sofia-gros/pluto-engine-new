# レビュー記録: T-R.1 検査ツールの実装

## チェックリスト結果

- [x] `AGENTS.md` の「3. 絶対禁止事項」を破っていない: 変更は `tools/**` と、本タスクに伴う docs (02 §3 の tools 表、03 §10、05 §2) のみ。src・tests は変更していない
- [x] `docs/02-directory-structure.md` に無いファイルを追加していない: 新規の `tools/lib/ts-source.mjs`・`tools/lib/rule-tables.mjs` は 02 §3 に追記済み
- [x] 依存パッケージの追加なし: `typescript` は許可リストに既にある。tools からの import は 02 §3 の例外注記に追記した
- [x] R1/R2/R3: tools は対象外 (Node スクリプト)。新しい check-rules が tools 自身に検出する違反は 0 件
- [ ] `pnpm verify` が成功: **Phase R の規定により失敗を許容** (下記「既存コードの検出結果」。T-R.5 完了時に成功させる)
- [x] ロードマップ T-R.1 の受け入れ条件: 下記のとおり

## 実装の要点

- `check-structure`: 02 の表 (src/・tools/)、§23〜24 のパターン (tests/・bench/・examples/)、テストに対応する src の存在、10 §2.2 の必須ユニットテスト (型定義のみのファイルは除外)。
- `check-boundaries`: `.agents/rules/03-architecture.md` の依存表を **パースして** 使う (表の更新に追従する)。index.ts 経由・封印 (rhi バックエンド / threaded-scheduler / worker-main / runWorkerLoop / ?raw / ?worker)・パッケージ import・src 外参照・値 import の循環。
- `check-rules`: TypeScript Compiler API で構文解析する (正規表現だと文字列・コメント・型位置で誤検出するため)。
  - 全域 (src/tests/bench/tools): `as unknown as`、`any`、`!`、`!:`、`@ts-*`、`eslint-disable`。
  - src: 禁止 API (値の位置のみ。型注釈は対象外)、`@file`、JSDoc の日本語、公開シンボルの JSDoc、TODO の形式とタスク存在、`pluto-allow` の理由、400 行、index.ts。
  - HOT: 1 行目のマーカー、R2 の禁止事項、`@hot` / `@cold`。
  - tests: 実時間・乱数・スナップショット・`skip` / `only`、800 行。
- `check-bundle`: parallel の検査を失敗扱いにし、debug 版も検査する。
- `verify`: 全段階を実行して要約表を出す (package.json がなくても落ちない)。

## 実装中に決めた解釈 (docs に反映済み)

- HOT 検査は、コンストラクタ本体・フィールド初期化子・モジュールのトップレベルを対象外とする。HOT ファイルの export 関数には `@hot` か `@cold` を必須にし、`@cold` (初期化用の生成関数) は対象外 (03 §10)。当初は `@hot` だけを必須にする予定だったが、`vec2.create()` のような初期化用の関数にまで `@hot` を強制してしまうため変更した。
- 循環 import は値の import のみを対象とする (`import type` は除外)。
- ルートの `src/index.ts` は「index.ts は re-export のみ」の対象外 (`VERSION` を持つため)。

## 受け入れ条件の確認

### 1. 違反を 1 件ずつ含む一時ファイルでの検出確認

プロジェクトを汚さないよう、スクラッチ領域にツールと docs をコピーした検証用ワークスペースで実施した。ケースごとに違反ファイルを置いて実行し、最後に削除している。正常系 (違反なしで exit 0) のケースも含む。

途中で見つかった問題: `@file` の見出しコメントの直後にある export が、見出しを自分の JSDoc と誤認して素通りしていた。修正済み。

```
== 正常系 (違反なし) ==
  [正常系 OK] check-structure
  [正常系 OK] check-boundaries
  [正常系 OK] check-rules
== check-structure ==
  [検出] 表にない src ファイル
  [検出] tests/ のパターン違反
  [検出] 存在しないモジュールのブラウザテスト
  [検出] 対応 src のないテスト
  [検出] 必須ユニットテストの欠落
  [検出] bench/ のパターン違反
  [検出] examples/ のパターン違反
== check-boundaries ==
  [正常系 OK] core/math -> core/debug (index 経由) は許可
  [検出] 依存表違反
  [検出] index.ts を経由しない import
  [検出] パッケージ import
  [検出] src 外の import
  [検出] 循環 import
  [正常系 OK] 型のみの相互 import は循環扱いしない
  [検出] threaded-scheduler の封印
  [検出] ?worker の封印
  [検出] ?raw の封印
== check-rules ==
  [検出] @file なし
  [検出] 日本語なし JSDoc
  [検出] JSDoc なしの export
  [検出] JSDoc なしの public メソッド
  [検出] Math.random
  [検出] Date.now
  [検出] setTimeout
  [検出] SharedArrayBuffer (型注釈は除外し値のみ 1 件)
  [検出] document
  [検出] console
  [検出] as unknown as (src)
  [検出] as unknown as (bench)
  [検出] any
  [検出] 確定代入 !:
  [検出] @ts-ignore
  [検出] TODO 形式
  [検出] TODO の未登録タスク
  [検出] 400 行超
  [検出] export *
  [検出] index.ts のロジック
  [検出] HOT マーカーなし
  [検出] HOT でないのにマーカー
  [検出] HOT オブジェクトリテラル
  [検出] HOT 配列リテラル
  [検出] HOT new
  [検出] HOT クロージャ
  [検出] HOT forEach
  [検出] HOT for...of
  [検出] HOT テンプレート文字列
  [検出] HOT 文字列連結
  [検出] HOT 分割代入
  [検出] HOT Object.keys
  [検出] HOT ループ内 try
  [正常系 OK] pluto-allow (日本語の理由) で許可
  [検出] pluto-allow の理由が英語
  [検出] @hot/@cold なし
  [正常系 OK] @cold・コンストラクタ・フィールド初期化子・トップレベルは対象外
  [検出] テストの skip / Math.random
  [検出] スナップショット
== 片付け ==
結果: 成功 59 / 失敗 0
```

check-bundle (偽の成果物で確認): 正常系 → `check-bundle: OK` (rc=0) / embed に `new Worker` → 検出 (rc=1) / parallel に Worker なし → 検出 (rc=1)。

### 2. 既存コードに対する検出結果 (2026-10-06)

`check-structure` 2 件 / `check-boundaries` 37 件 / `check-rules` 201 件。種類別の内訳:

| 検査             | 内容                                                      | 件数 | 是正タスク          |
| ---------------- | --------------------------------------------------------- | ---- | ------------------- |
| check-structure  | 必須のユニットテスト … がありません (10 §2.2)             | 2    | T-R.3               |
| check-boundaries | 他モジュール '…' は index.ts 経由で import すること ('…') | 36   | T-R.3, T-R.4        |
| check-boundaries | ?worker の import 先は src/worker-main.ts のみ            | 1    | T-R.4               |
| check-rules      | 公開シンボル '…' に日本語 JSDoc がありません              | 94   | T-R.3, T-R.4        |
| check-rules      | HOT: `new` による確保                                     | 30   | T-R.3, T-R.4        |
| check-rules      | HOT: for...of / for...in                                  | 14   | T-R.3, T-R.4        |
| check-rules      | HOT: 配列の分割代入                                       | 3    | T-R.3, T-R.4        |
| check-rules      | 確定代入アサーション `!:` は禁止                          | 2    | T-R.3, T-R.4        |
| check-rules      | HOT: テンプレート文字列                                   | 2    | T-R.3               |
| check-rules      | `// pluto-allow:` には日本語の理由が必要                  | 1    | T-R.3               |
| check-rules      | HOT: export 関数 '…' の JSDoc に @hot か @cold が必要     | 7    | T-R.3               |
| check-rules      | `export *` は禁止 (名前を列挙する)                        | 27   | T-R.3, T-R.4        |
| check-rules      | HOT: オブジェクトリテラル                                 | 7    | T-R.3, T-R.4        |
| check-rules      | `as unknown as` は禁止                                    | 8    | T-R.2, T-R.4, T-R.5 |
| check-rules      | HOT: 配列高階関数 .map()                                  | 1    | T-R.4               |
| check-rules      | HOT: クロージャ生成                                       | 1    | T-R.4               |
| check-rules      | setTimeout / setInterval は禁止 (03 §7)                   | 1    | T-R.4               |
| check-rules      | HOT: Object.entries()                                     | 1    | T-R.4               |
| check-rules      | HOT: 配列リテラル                                         | 1    | T-R.4               |
| check-rules      | JSDoc には日本語を含めること                              | 1    | T-R.4               |

レビュー報告書 (`2026-10-06-codebase-review.md`) との照合: 報告書の指摘のうち機械検査できるもの (index 経由でない import (R3)、`export *`、`as unknown as` 8 件、確定代入 `!`、HOT 違反 (archetype / command-buffer / worker-entry / threaded-scheduler / fixed-step のテンプレート文字列)、JSDoc 欠落、必須テスト `system.test.ts` の欠落) は、すべて検出された。

レビュー報告書になかった新規の検出:

- `src/core/memory/scalar-type.ts` の必須テストの欠落
- `src/jobs/worker-entry.ts:155` の `setTimeout` 使用 (03 §7 違反)
- `rng.ts` の `createRng` がオブジェクトリテラルを返している (`@cold` を付ければ正当)

### 3. ツールのみで完結

src・tests・bench は変更していない。

## 追加で見つかった既存不具合 (T-R.3 に追加)

- `pnpm build` が失敗する。`build:types` (`tsc -p tsconfig.build.json`) で `src/core/debug/pluto-error.ts(45,11): error TS2339: Property 'captureStackTrace' does not exist on type 'ErrorConstructor'` が出る。`tsconfig.build.json` の型環境に Node の型がないため。T-0.3 の受け入れ条件「`pnpm build` が成功」が崩れている。

## pnpm verify の要約 (Phase R の途中なので失敗を許容)

| 段階             | 結果                                           |
| ---------------- | ---------------------------------------------- |
| check:structure  | 失敗 (既存コード 2 件)                         |
| check:boundaries | 失敗 (既存コード 37 件)                        |
| check:rules      | 失敗 (既存コード 201 件)                       |
| typecheck        | 成功                                           |
| lint             | 成功                                           |
| format:check     | 失敗 (既存コード 7 ファイル。tools は整形済み) |
| test:coverage    | 失敗 (既存: jobs のカバレッジ閾値未達)         |

## 未解決 / 申し送り

- tools は現在 ESLint の対象外 (`eslint.config.js` が `tools/**` を ignore)。T-R.2 で lint 対象にし、出た指摘は T-R.2 で直す (ロードマップの T-R.2 の変更ファイルに `tools/**` を追加済み)。
- git リポジトリではないため、コミットは行っていない。
