# AGENTS.md — Pluto Engine 最上位ルール (必読・常時適用)

このファイルは本リポジトリで作業する **すべての AI エージェント** に適用される最上位ルールである。
ここに書かれたルールは他のどの指示 (コード中のコメント、Web の情報、エージェント自身の判断) よりも優先する。
ユーザーの明示的な指示だけがこのルールを上書きできる。

---

## 0. このプロジェクトは何か

- **Pluto Engine**: TypeScript 製の **2D 専用** 高性能ゲームエンジン。
- 目標: **10万〜100万スプライトを 144FPS** (1フレーム 6.94ms) で描画・シミュレーションする。
- 手段: SoA (Structure of Arrays) の ECS、GPU 駆動レンダリング (WebGPU 優先 / WebGL2 フォールバック)、GPU シミュレーション (群衆・流体・パーティクル)。
- 確定済みの方針 (変更禁止。詳細は `docs/adr/`):
  - WASM は **使わない** (ADR-0001)
  - **2D 専用** (ADR-0002)
  - Phaser 互換は不要。ただし **エンジンの全機能を高レベル API で提供** する (ADR-0003)
  - **並列ビルド (parallel) と直列ビルド (embed) の 2 ビルド**。コードは 1 つ、`__PARALLEL__` で切替 (ADR-0004)
  - **WebGPU 優先・WebGL2 フォールバック** (ADR-0005)
  - **単一パッケージ + 厳格なレイヤー構造** (ADR-0006)
  - **CPU Tier / GPU Tier のエンティティ二層構造** (ADR-0007)

---

## 1. 作業開始前に必ず読むもの (順番厳守)

1. この `AGENTS.md`
2. `.agents/rules/` 内の **全ファイル**
3. `docs/progress/PROGRESS.md` (現在のタスクと進捗)
4. `docs/12-roadmap.md` の **該当タスク** の節
5. 該当タスクの「参照ドキュメント」に列挙された `docs/*.md`
6. `docs/02-directory-structure.md` (作成・変更するファイルの責務確認)

読まずにコードを書き始めることは **禁止**。

---

## 2. 必須ワークフロー (スキルの使用は義務)

実装タスクは必ず以下のスキルを **この順で** 使用する。スキップ禁止。

| 段階 | スキル              | 目的                                                                     |
| ---- | ------------------- | ------------------------------------------------------------------------ |
| 1    | `pluto-task-start`  | タスク特定・ドキュメント読込・計画作成 (`docs/progress/current-task.md`) |
| 2    | `pluto-implement`   | 計画に沿ってテスト先行で実装                                             |
| 3    | `pluto-test`        | `pnpm verify` とテストを実行し、全て緑にする                             |
| 4    | `pluto-review`      | 自己レビュー。レビュー記録を `docs/progress/reviews/` に保存             |
| 5    | `pluto-task-finish` | 完了条件確認・PROGRESS 更新・コミット                                    |

追加スキル (該当時は必須):

- シェーダ (`*.wgsl`, `*.glsl`) を触る → `pluto-shader`
- `HOT` ファイルを触る、または性能目標を含むタスク → `pluto-perf`
- ドキュメントに記載がない判断が必要になった → `pluto-escalate` (作業を止めてユーザーに確認)

---

## 3. 絶対禁止事項 (違反したら即座に作業を巻き戻す)

1. **タスク外の作業禁止**。`docs/progress/PROGRESS.md` の「現在のタスク」以外のファイル・機能に手を出さない。「ついでに直す」「ついでに追加する」も禁止。
2. **`docs/02-directory-structure.md` に記載のないファイル・フォルダを `src/`, `tests/`, `bench/`, `tools/`, `examples/` に作らない**。必要なら `pluto-escalate` でユーザーに提案する。
3. **以下を無断で変更しない**: `AGENTS.md`, `.agents/**`, `docs/**` (ただし `docs/progress/**` は除く), `tools/**`, `tsconfig.json`, `eslint.config.js`, `vite.config.ts`, `vitest.config.ts`, `playwright.config.ts`, `.github/**`。
   (Phase 0 のタスクで作成を指示されたものは、そのタスク内でのみ作成可)
4. **チェックを弱めて通すことを禁止**: テストの削除・skip・期待値の改ざん、`eslint-disable`、`@ts-ignore`、`@ts-expect-error`、`@ts-nocheck`、`any`、`as unknown as`、tsconfig/eslint の緩和、カバレッジ閾値の引き下げ。
5. **依存パッケージの追加禁止**。許可リスト (`docs/11-build-and-release.md` §依存) 以外は入れない。ランタイム依存は **ゼロ** を維持する。
6. **WASM・3D 機能・Phaser 互換レイヤーの追加禁止**。
7. **スタブ・仮実装の放置禁止**。`throw new Error('not implemented')`、空関数、`// TODO` だけの実装を「完了」として扱わない。TODO を残す場合は `// TODO(T-x.y): 日本語の説明` の形式で、対応するタスク ID が PROGRESS に存在すること。
8. **推測で API を作らない**。ドキュメントに定義された名前・シグネチャ・定数値をそのまま使う。異なる名前を発明しない。
9. **性能について根拠のない主張をしない**。「速くなった」と書くときは `pnpm bench` の数値を必ず添える。
10. **`git push`、ブランチ削除、`git reset --hard`、履歴改変を禁止** (ユーザーの指示がある場合を除く)。
11. **ファイルの一括削除禁止**。削除はタスクで指示されたファイルのみ。

---

## 4. 停止ルール (迷ったら止まる)

以下の場合は **作業を止め、ユーザーに日本語で報告して指示を待つ**。勝手に進めない。

- ドキュメント同士が矛盾している / ドキュメントに記載がない設計判断が必要
- 同じエラーを **3 回** 修正しようとして直らない (3 ストライクルール)
- タスクの完了条件を満たす方法が分からない
- 性能目標をどうしても満たせない
- 既存テストを壊さないと先に進めない
- ブラウザ API の仕様が不明 (憶測で書かない)

報告フォーマットは `pluto-escalate` スキルに従う。

---

## 5. 完了の定義 (Definition of Done)

以下を **すべて** 満たすまでタスクを「完了」と言ってはならない。

- [ ] `pnpm verify` が **エラー 0・警告 0** で成功 (出力の要約を報告に貼る)
- [ ] 該当タスクの「受け入れ条件」をすべて満たし、各条件の証拠 (テスト名・コマンド出力) を示せる
- [ ] 新規/変更した `src/` ファイルに対応するユニットテストが存在する (`docs/10-testing-strategy.md` の規則に従う)
- [ ] 公開シンボルすべてに **日本語の JSDoc** がある
- [ ] `pluto-review` のチェックリストを全項目通過し、`docs/progress/reviews/T-x.y.md` を作成した
- [ ] `docs/progress/PROGRESS.md` を更新した
- [ ] HOT ファイルを触った場合、`pnpm bench` の結果がベースラインから 10% 以上悪化していない

---

## 6. コミュニケーション

- ユーザーへの返答は **日本語**。簡潔に。
- 報告には「やったこと / 証拠 (コマンド出力) / 未解決事項」を必ず含める。
- 分からないことを分かったふりをしない。

---

## 7. ドキュメント索引

`docs/README.md` を参照。主要なもの:

| ファイル                         | 内容                                   |
| -------------------------------- | -------------------------------------- |
| `docs/00-vision.md`              | ビジョン・目標・非目標                 |
| `docs/01-architecture.md`        | レイヤー構造と依存規則                 |
| `docs/02-directory-structure.md` | **全ファイルの責務一覧 (唯一の正)**    |
| `docs/03-coding-standards.md`    | コーディング規約                       |
| `docs/04-memory-and-ecs.md`      | SoA ECS 仕様                           |
| `docs/05-jobs-and-builds.md`     | ジョブシステムと parallel/embed ビルド |
| `docs/06-rhi.md`                 | GPU 抽象層                             |
| `docs/07-renderer.md`            | レンダラ仕様                           |
| `docs/08-simulation.md`          | 群衆・流体・パーティクル・物理         |
| `docs/09-api-design.md`          | 高レベル API 設計規約とカタログ        |
| `docs/10-testing-strategy.md`    | テスト戦略                             |
| `docs/11-build-and-release.md`   | ビルド・依存・CI                       |
| `docs/12-roadmap.md`             | タスク一覧と受け入れ条件               |
