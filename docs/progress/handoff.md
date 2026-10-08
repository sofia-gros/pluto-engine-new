# 引き継ぎ書 (2026-10-06 → 次のエージェント)

> [!NOTE]
> 2026-10-08 追記: この文書の §2〜§4 は T-R.5 BLOCKED 当時の記録であり、現在は古い (T-R.5 DONE、T-4.7 DONE、T-5.1 修正フェーズ F1〜F3 完了)。最新の状態は `docs/progress/PROGRESS.md` (作業ログ 2026-10-08) と `docs/progress/current-task.md` を見ること。ハマりどころ (§6) と仕様変更の経緯 (§5) は引き続き有効。

この文書は、Claude による作業 (2026-10-06) の引き継ぎである。ここに書いた内容は、すべて `docs/` と `docs/progress/` の記録が根拠になっている。食い違いがあれば記録の方を正とする。

---

## 1. 最初に読むもの (順番厳守)

1. `AGENTS.md` (最上位ルール。§3 の禁止事項・§4 の停止ルール・§5 の完了の定義)
2. `.agents/rules/` の全 5 ファイル。`03-architecture.md` は 2026-10-06 に更新している (`src/worker-main.ts` の封印、`bench/` からの内部 import の許可)
3. `docs/progress/PROGRESS.md` (タスク状態表と作業ログ)
4. `docs/12-roadmap.md` の **§0** (実施順序)、**Phase R** (是正フェーズ)、**末尾の「決定事項」D-1〜D-20**
5. `docs/progress/reviews/2026-10-06-codebase-review.md` (既存コードのレビュー。Phase R を挿入した理由)
6. `docs/progress/escalations.md` (E-001、E-002)
7. 着手するタスクの「参照」に書かれた仕様書

> スキル (`.agents/skills/pluto-*`) の手順は、AGENTS.md §2 のとおり必須。task-start → implement → test → review → finish の順に進める。

---

## 2. 現在の状態

### 2.1 タスク

| 範囲                                          | 状態                                                 |
| --------------------------------------------- | ---------------------------------------------------- |
| T-0.1〜T-2.2                                  | DONE (ただし不具合が多かったので Phase R で是正済み) |
| T-R.1 検査ツールの実装                        | DONE                                                 |
| T-R.2 ビルド・テスト設定の是正                | DONE                                                 |
| T-R.3 core の是正                             | DONE                                                 |
| T-R.4 jobs の再実装と World 連携              | DONE                                                 |
| **T-R.5 ベンチ基盤の是正と ECS ベンチ再計測** | **BLOCKED (基準機での計測待ち)**。下記 §3            |
| T-2.3 以降                                    | TODO                                                 |

### 2.2 品質の状態 (2026-10-06 時点)

| コマンド                             | 結果                                                                                                               |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------ |
| `pnpm verify`                        | **全 7 段階が成功** (check:structure / boundaries / rules、typecheck、lint、format:check、test:coverage)           |
| `pnpm test:coverage`                 | 192 件成功。全体 lines 99.51% / branches 95.6%                                                                     |
| `pnpm test:browser --project=webgl2` | 7 件成功                                                                                                           |
| `pnpm test:browser:embed`            | 7 件成功                                                                                                           |
| `pnpm build`                         | parallel / embed / debug / 型定義のビルドはすべて成功。**最後の `check-bundle` だけが失敗する** (想定どおり。§4.1) |

### 2.3 リポジトリ

- **git リポジトリではない** (`git status` は失敗する)。そのため、各タスクの完了処理 (task-finish) でコミットはしていない。PROGRESS の「コミット」欄は「(git 管理外)」と書いている。
- 作業ディレクトリ: `/mnt/c/Users/onoken260714165/Downloads/pluto-engine-new-master/pluto-engine-new-master` (WSL2 / Ubuntu 26.04)

---

## 3. 未完了の作業: T-R.5 (ユーザーの判断待ち)

T-R.5 は、受け入れ条件 1・3・5 を満たしている。**2 と 4 は基準機 (RTX 3060 相当の dGPU、Chrome、1920×1080) でしか確認できない。** WSL には GPU が無く、基準機でもない。

1. **条件 2: vsync の解除の確認**
   - `pnpm bench --scene empty` で、p50 が 1000 / リフレッシュレートより明確に小さくなるか。
   - WSLg では、headed でも headless でも 17.5ms (60Hz) から下がらなかった。
   - 基準機でも下がらない場合は、フレーム時間の測り方 (10 §5) を見直す必要がある。その場合はユーザーに確認すること。
2. **条件 4: ECS ベンチの判定とベースライン登録**
   - `pnpm bench --scene ecs-move --build embed` と `--build parallel` を実行する。
   - 04 §10 の基準 (spawn ≤ 150ms / get・set ≤ 30ms / 移動カーネル ≤ 2.0ms) を満たせば、`pluto-perf` の手順で `bench/baseline.json` に登録する。
   - 参考値 (WSL、E-002 対応後): embed は moveKernelP99Ms 8.47 / spawn 154 / set 27 / get 26.7、parallel は 14.91 / 158 / 29 / 41。
   - 基準を満たせない場合は AGENTS §4 に従ってユーザーに報告する。基準を勝手に下げてはならない。

**ユーザーに確認中の点**: 計測結果を待つか (A)、T-R.5 を保留して T-2.3 に進むか (B)。**回答を得てから** 次に進むこと。AGENTS §0 / 12 §0 は、前のタスクが DONE になるまで次に着手しないと定めている。

---

## 4. 次のタスク T-2.3 (スケジューラの選択とパリティ) の要点

ロードマップの Phase 2 の「T-2.3」に、受け入れ条件 6 項目がある。T-R.4 で作り直した並列実行を、ここで初めてブラウザで検証する。**並列実行はまだブラウザで一度も動かしていない。**

### 4.1 作るもの

- `src/jobs/create-scheduler.ts`: 05 §3.4 のとおり (`__PARALLEL__ && crossOriginIsolated` なら Threaded、そうでなければ Serial。parallel ビルドで縮退したら `logger.warn` を 1 回)。`jobs/index.ts` と `src/lowlevel.ts` から公開する。**これで parallel バンドルに Worker が入り、`check-bundle` が通るようになる。**
- `tests/browser/jobs/parity.spec.ts`
- 必要なら `tests/browser/fixtures/` にテスト用の Worker エントリとカーネル定義を置く (02 §23 のパターンで許可されている)。

### 4.2 実装の前提 (T-R.4 の設計。05 §3 に記載)

- **カーネル ID** は名前の FNV-1a ハッシュ。カーネル名は一意にする。重複・衝突は `PlutoError`。
- **Worker で動くカーネルは、Worker 側でも同じモジュールを import して `defineKernel` されていなければならない。** 本番は `src/worker-main.ts` が import する。T-2.4 / T-4.3 / T-4.4 / T-8.1 でカーネルを追加したら、ここに import を足すこと。
- テストでは `new ThreadedScheduler({ maxWorkers, createWorker })` で Worker の生成を差し替えられる。テスト用 Worker のエントリは、テスト用のカーネルとコンポーネントを定義するモジュールを import し、`runWorkerLoop(port)` を呼ぶ (`src/worker-main.ts` が手本)。`tests/` は src の内部ファイルを import してよい。
- **コンポーネント名も一意にする。** Worker は init で受け取ったメインのコンポーネント表で、ID を名前で合わせ直す (`applyComponentLayout`)。
- チャンクの取得は、ジョブ番号付きカウンタの `compareExchange` で行う (`jobs/sync.ts`)。Worker の例外は `CTRL_ERROR` を通じてメインの `PlutoError(InvalidState)` になる。
- Worker は `Atomics.waitAsync` で待つ。同期メッセージの適用が追いついていないジョブには参加しない (メインが代わりに処理するので、結果は正しい)。テストで「Worker が実際に働いたか」を確かめるには、カーネルの中で `self` の有無を記録するなどの工夫が必要。
- **メモリモデル (D-20)**: バッファは固定長で、伸長時は新しいバッファへコピーする。伸長すると `bufferVersion` → `World.structureVersion` が進み、`syncWorld` が Worker に送り直す。受け入れ条件 3 (伸長後の行が Worker から見える) は、この仕組みの検証である。
- World にスケジューラを渡すには `world.setExecutor(scheduler)` を使う。kernel システムは `addSystem({ kernel })` で登録する (04 §8〜9)。

---

## 5. 2026-10-06 に変更した主な仕様 (詳細は 12 末尾の決定事項)

| 決定           | 内容                                                                                                                                                     |
| -------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase R の挿入 | T-2.3 より前に是正タスク T-R.1〜T-R.5 を実施する                                                                                                         |
| Phase 5〜10    | 詳細化済み (旧未決事項 U-1〜U-10 は D-1〜D-10 で決定済み)                                                                                                |
| D-11〜D-14     | Kernel は 3 引数、ID は FNV-1a、Worker エントリは `src/worker-main.ts`、World と KernelExecutor の接続、`chunkIndex` はクエリ全体の通し番号              |
| D-15〜D-17     | `MAX_ENTITIES = 4,194,303`、half の API と最近接偶数丸め、`commandCapacity` は u32 語数                                                                  |
| D-18〜D-19     | ゴールデン画像は canvas を撮影し `--update-snapshots` で更新、embed のテスト方法、ESLint の例外                                                          |
| D-20 (E-002)   | **伸長可能なバッファ (resizable / growable) は使わない。** V8 では要素アクセスが 3〜47 倍遅いため。固定長バッファ + 伸長時コピー + Worker への再送とする |
| 03 §10         | 機械検査の範囲 (HOT 検査の対象外、`@hot` / `@cold`、`throw new` の扱い)                                                                                  |

---

## 6. ハマりどころ (必ず読むこと)

1. **検査ツールは本物になった。** T-R.1 より前は `check-*` がほぼ空で、違反が素通りしていた。今は構文木で検査するので、次のどれも検出される。
   - `as unknown as` / `any` / `!` / `!:`
   - JSDoc の欠落と日本語でない JSDoc
   - HOT ファイル内の確保・高階関数・`for...of`
   - 他モジュールを index.ts 経由でなく import すること
   - `export *`
   - 禁止 API

   違反をコメントで抑制する手段は無い (`noInlineConfig`)。

2. **HOT ファイル** (02 の表で HOT 列が `HOT`) の規則:
   - 1 行目は `// @pluto-hot`。
   - トップレベルの `export function` には `@hot` か `@cold` が必要。
   - 初期化専用の関数は `@cold` にすると検査の対象外になる。
   - それ以外で禁止構文がどうしても必要なら、行末に `// pluto-allow: 日本語の理由` を書く。
3. **ESLint の `prefer-for-of` と、HOT 規則の `for...of` 禁止がぶつかる。** 添字ループで書き、長さを先にローカル変数へ入れる (`const n = a.length; for (let i = 0; i < n; i++)`)。これで両方を満たせる。
4. **真偽値の変数** は `is` / `has` / `can` / `should` で始める (ESLint が検査する)。引数とプロパティは対象外。
5. **カラムの配列を保持しない** (D-20)。伸長で古くなるので、使うたびに `archetype.getColumn()` / `view.column()` で取り直す。チャンクを処理している間は伸長が起きないので、その間は保持してよい。
6. **`tsconfig` の `noPropertyAccessFromIndexSignature`**: Record にはブラケット記法でアクセスする (`metrics['spawnMs']`)。
7. **`pnpm bench` への引数**: `pnpm bench --scene x --build parallel` のように渡す。`--` は不要。比較 (compare-bench) は run-bench が保存後に呼ぶ。`--headless` の数値は機能確認用なので、性能判断に使ってはならない。
8. **ファイルを足すときは、先に `docs/02-directory-structure.md` の表に載っているか確認する。** `check-structure` が `src/` と `tools/` を表と照合する。tests / bench / examples はパターンで照合する。
9. **docs の変更**: `docs/progress/**` 以外の docs と `.agents/**` は、ユーザーの指示なしに変更してはならない (AGENTS §3-3)。2026-10-06 の変更は、ユーザーの指示 (「判断して docs を更新して」「1」) に基づく。
10. **CI (`.github/workflows/ci.yml`)** は `pnpm build` を実行するので、T-2.3 で `check-bundle` が通るまでは CI が赤になる。

---

## 7. 開発環境 (詳細は `docs/progress/environment.md`)

```sh
. ~/.pluto-toolchain/env.sh          # シェルごとに 1 回 (pnpm 10.0.0・Chromium・不足ライブラリへのパス)
pnpm install --frozen-lockfile
pnpm verify
CI=1 pnpm test:browser --project=webgl2
CI=1 pnpm test:browser:embed
pnpm build
```

- システムやグローバル設定は変更していない。ツール類はすべて `~/.pluto-toolchain/` に入っている (削除は `rm -rf ~/.pluto-toolchain`)。
- WSL には GPU が無い。WebGPU のテスト (`--project=webgpu`) と性能判断は基準機で行う。
- `/mnt/c` 上なので、`pnpm verify` に数分かかる。

---

## 8. 記録の場所

| 内容                              | 場所                                                                                                |
| --------------------------------- | --------------------------------------------------------------------------------------------------- |
| タスク状態・作業ログ              | `docs/progress/PROGRESS.md`                                                                         |
| 現在のタスクの計画                | `docs/progress/current-task.md` (中身は T-R.4 のまま。次のタスクで task-start を実行して上書きする) |
| 各タスクのレビュー記録            | `docs/progress/reviews/T-R.1.md`〜`T-R.5.md` (仕様との対応表・証拠・verify の要約)                  |
| コードベースレビュー              | `docs/progress/reviews/2026-10-06-codebase-review.md`                                               |
| ユーザーへの確認と回答            | `docs/progress/escalations.md` (E-001、E-002)                                                       |
| 環境                              | `docs/progress/environment.md`                                                                      |
| T-1.10 の旧性能値が無効であること | `docs/progress/reviews/T-1.10.md` の末尾の「訂正」                                                  |
