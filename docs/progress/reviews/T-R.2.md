# レビュー記録: T-R.2 ビルド・テスト設定の是正

## チェックリスト結果

- [x] `AGENTS.md` §3 の禁止事項を破っていない: 変更は設定ファイル・`tests/browser/**`・`tools/**` (lint 指摘の修正) と docs のみ。新しい src / ユニットテストのファイルはない
- [x] 02 に無いファイルを追加していない: 新規ファイルは `tests/browser/helpers/harness-test.ts`・`tests/browser/smoke/golden.spec.ts` (いずれも 02 §23 のパターン内) と `tools/lib/hot-rules.mjs` (02 §3 に追記)
- [x] チェックを弱めていない: ESLint は仕様外の緩和 (`no-empty-function: off`、config / tools での `no-restricted-syntax` 全面 off、`no-undef: off`) を削除し、設定ファイルでは `export default` の禁止だけを外した。vitest の除外は 10 §2 の表に書いたファイルのみ
- [x] R1〜R3: tools は 0 件 (check-rules / lint)。ハーネス・ヘルパには日本語 JSDoc を付けた
- [ ] `pnpm verify` 成功: Phase R の規定により失敗を許容 (下記)
- [x] ロードマップ T-R.2 の受け入れ条件: 下記

## 変更内容

| ファイル                                       | 内容                                                                                                                                                                                                                   |
| ---------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `vite.config.ts`                               | `command === 'serve'` で `__PARALLEL__` / `__DEBUG__` を true。`preview.headers` に COOP/COEP                                                                                                                          |
| `vitest.config.ts`                             | `jobs/threaded-scheduler.ts`・`jobs/worker-entry.ts` をカバレッジ除外 (10 §2 の表)                                                                                                                                     |
| `playwright.config.ts`                         | プロジェクトごとの `plutoBackend` / `plutoBuild`、`updateSnapshots: 'none'`、CI は line レポーター                                                                                                                     |
| `eslint.config.js`                             | 真偽値の変数の接頭辞、`as const` 列挙キーの PascalCase、logger (とそのテスト) のみ `no-console` off、設定ファイルは `export default` のみ例外、tools を lint 対象に、JS は型検査ルールを外して Node のグローバルを定義 |
| `.github/workflows/ci.yml`                     | トリガーをブランチで絞らない                                                                                                                                                                                           |
| `tests/browser/fixtures/harness.*`             | 256×256 の canvas、`backend` / `build` の検証、embed は `/dist/embed/pluto.debug.js` を読む、`@file` と JSDoc                                                                                                          |
| `tests/browser/helpers/harness-test.ts` (新規) | プロジェクトのオプションを受け取る `test`、`harnessUrl`、`openHarness`                                                                                                                                                 |
| `tests/browser/helpers/golden.ts`              | `expectGolden(page, name)`、canvas 撮影、backend 名で保存、無ければ失敗、`--update-snapshots` で作成・更新。判定は `compareWithGolden` に分離                                                                          |
| `tests/browser/smoke/*.spec.ts`                | ハーネス 3 件 + ゴールデン 4 件 (`as unknown as` を除去)                                                                                                                                                               |
| `tools/check-rules.mjs` ほか                   | lint 対象にしたことで出た指摘 (複雑度・行数・`window`) の修正。HOT 規則を `tools/lib/hot-rules.mjs` に分割。分割前後で check-rules の出力が同一であること、検出テスト 59/59 件を再確認                                 |

## 実装中に決めた解釈 (docs に反映済み)

- 真偽値の接頭辞 (03 §3) の機械検査は **変数のみ**。引数・プロパティは仕様書で決まった API 名 (`caps.compute`, `pixelArt`, WebGL のコンテキスト属性) と衝突するため対象外 (03 §8)。
- `logger.test.ts` は console をスパイして logger を検証するため `no-console` の例外に含める (03 §8)。`no-empty-function` は緩めない (テスト側を直すのは T-R.3)。
- embed プロジェクトは dev server 上のハーネスから embed 成果物を読む方式 (10 §3.6)。

## 受け入れ条件の確認

1. **dev server の定数**: `tests/browser/smoke/harness.spec.ts`「dev server では **PARALLEL** と **DEBUG** が true になる」が webgl2 / embed の両プロジェクトで成功。
2. **embed の成果物**: 同「プロジェクト設定どおりのバックエンド・ビルドで読み込まれる」で、ネットワーク記録から embed プロジェクトでは `/dist/embed/pluto.debug.js` を読み `/src/index.ts` を読まないこと、webgl2 プロジェクトではその逆であることを検証した (成功)。`__PARALLEL__ === false` の直接の確認は、エンジンが公開する手段がまだないため T-2.3 の受け入れ条件 5 (embed で `SerialScheduler` が選ばれる) で行う。
3. **golden.ts の 4 点**: `tests/browser/smoke/golden.spec.ts` の 4 件 (差分 0 / 1px 検出、無ければ失敗しファイルを作らない、`changed` で作成・更新、0.5% 超で失敗し差分画像を出す) がすべて成功。
4. **ESLint**: 一時ファイル (`src/core/debug/tmp-lint-check.ts` と `tmp-lint.config.ts`。確認後に削除) で次を確認した。
   ```
   6:23  error  as const 列挙オブジェクトのキーは PascalCase (docs/03-coding-standards.md §3)  no-restricted-syntax   ← { fast: 0 } (Slow は通過、UPPER_CASE 名の SIZE_TABLE は対象外)
   13:9  error  Variable name `done` must have one of the following prefixes: is, has, can, should   ← isOk は通過
   1:1   error  enum 禁止。as const オブジェクトを使う  no-restricted-syntax   ← 設定ファイルでも enum は禁止。export default は許可
   ```
5. **ブラウザテスト**:
   ```
   CI=1 pnpm test:browser --project=webgl2  →  7 passed (20.4s)
   CI=1 pnpm test:browser:embed             →  7 passed (15.7s)
   ```

## pnpm verify の要約 (Phase R の途中なので失敗を許容)

| 段階             | 結果 | 内容                                                                                                                                   |
| ---------------- | ---- | -------------------------------------------------------------------------------------------------------------------------------------- |
| check:structure  | 失敗 | 既存 2 件 (T-R.3)                                                                                                                      |
| check:boundaries | 失敗 | 既存 37 件 (T-R.3 / T-R.4)                                                                                                             |
| check:rules      | 失敗 | 既存 200 件 (T-R.3 / T-R.4 / T-R.5)                                                                                                    |
| typecheck        | 成功 |                                                                                                                                        |
| lint             | 失敗 | 新規則で検出した既存の違反 8 件 (`src/core` の真偽値の変数名 3 件、`tests/unit/core` の空関数 4 件と真偽値の変数名 1 件。すべて T-R.3) |
| format:check     | 失敗 | 既存 6 ファイル (T-R.3〜T-R.5)                                                                                                         |
| test:coverage    | 失敗 | 145 件成功。`src/jobs/**` lines 72.97% (Worker 系の除外で 13% から改善。残りは T-R.4)                                                  |

T-R.2 で新たに入れた違反はない。lint の失敗は、新しい規則が既存コードの違反を検出するようになった結果である。

## 未解決 / 申し送り

- git 管理外のため、コミットは行っていない。
