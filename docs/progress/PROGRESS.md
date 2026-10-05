# PROGRESS — 進捗管理

> エージェントは **タスク開始時・完了時に必ず** このファイルを更新する。
> 状態: `TODO` / `IN_PROGRESS` / `BLOCKED` (ユーザー待ち) / `DONE`
> `IN_PROGRESS` は常に **最大 1 つ**。

## 現在のタスク

**T-0.6** CI (状態: TODO)

## タスク状態表

| ID     | 内容                             | 状態 | レビュー記録                   | コミット                                                                 |
| ------ | -------------------------------- | ---- | ------------------------------ | ------------------------------------------------------------------------ |
| T-0.1  | パッケージと TypeScript 設定     | DONE | [T-0.1.md](./reviews/T-0.1.md) | [90bb219](https://github.com/sofia-gros/pluto-engine-new/commit/90bb219) |
| T-0.2  | ESLint                           | DONE | [T-0.2.md](./reviews/T-0.2.md) | [4652f6c](https://github.com/sofia-gros/pluto-engine-new/commit/4652f6c) |
| T-0.3  | Vite 2 ビルドとエントリ          | DONE | [T-0.3.md](./reviews/T-0.3.md) | [2e2b360](https://github.com/sofia-gros/pluto-engine-new/commit/2e2b360) |
| T-0.4  | Vitest と最初のコード            | DONE | [T-0.4.md](./reviews/T-0.4.md) | [c537423](https://github.com/sofia-gros/pluto-engine-new/commit/c537423) |
| T-0.5  | Playwright ハーネス              | DONE | [T-0.5.md](./reviews/T-0.5.md) | [d4bb4f6](https://github.com/sofia-gros/pluto-engine-new/commit/d4bb4f6) |
| T-0.6  | CI                               | TODO |                                |                                                                          |
| T-0.7  | ベンチ基盤                       | TODO |                                |                                                                          |
| T-1.1  | 数学                             | TODO |                                |                                                                          |
| T-1.2  | エラー・ログ                     | TODO |                                |                                                                          |
| T-1.3  | メモリ                           | TODO |                                |                                                                          |
| T-1.4  | イベント                         | TODO |                                |                                                                          |
| T-1.5  | 時間                             | TODO |                                |                                                                          |
| T-1.6  | エンティティ・コンポーネント     | TODO |                                |                                                                          |
| T-1.7  | アーキタイプ                     | TODO |                                |                                                                          |
| T-1.8  | クエリ・変更追跡                 | TODO |                                |                                                                          |
| T-1.9  | World                            | TODO |                                |                                                                          |
| T-1.10 | ECS ベンチ                       | TODO |                                |                                                                          |
| T-2.1  | カーネル・直列スケジューラ       | TODO |                                |                                                                          |
| T-2.2  | 並列スケジューラ                 | TODO |                                |                                                                          |
| T-2.3  | スケジューラ選択とパリティ       | TODO |                                |                                                                          |
| T-2.4  | Transform                        | TODO |                                |                                                                          |
| T-3.1  | RHI インターフェース             | TODO |                                |                                                                          |
| T-3.2  | RHI WebGPU 実装                  | TODO |                                |                                                                          |
| T-3.3  | RHI WebGL2 実装                  | TODO |                                |                                                                          |
| T-3.4  | デバイス生成とブラウザテスト     | TODO |                                |                                                                          |
| T-4.1  | シェーダ基盤                     | TODO |                                |                                                                          |
| T-4.2  | テクスチャ・アセット             | TODO |                                |                                                                          |
| T-4.3  | スプライトデータ                 | TODO |                                |                                                                          |
| T-4.4  | CPU 補助描画パス                 | TODO |                                |                                                                          |
| T-4.5  | GPU プリミティブ                 | TODO |                                |                                                                          |
| T-4.6  | GPU 駆動描画パス                 | TODO |                                |                                                                          |
| T-4.7  | カメラ・レンダーグラフ・レンダラ | TODO |                                |                                                                          |

Phase 5 以降は詳細未定義 (`docs/12-roadmap.md`)。Phase 4 完了後にユーザーへ詳細化を依頼すること。

## 作業ログ (新しいものを上に追記)

### 2026-10-05 T-0.5
- やったこと: Playwright テスト環境の構築、テストハーネスの作成、画像差分比較 (`golden.ts`) の実装。
- 証拠: `pnpm test:browser --project=webgl2` および `pnpm verify` が全て成功。
- 未解決: なし

### 2026-10-05 T-0.4

- やったこと: Vitestのセットアップ、`assert.ts` および `unreachable` ヘルパーの実装とTDDに基づくユニットテスト作成。
- 証拠: `pnpm verify` (lint, format:check, typecheck, coverage) が全て成功。
- 未解決: なし

### 2026-10-05 T-0.3

- やったこと: `vite.config.ts`, `tsconfig.build.json`, エントリファイルの作成と `check-bundle.mjs` の実装。
- 証拠: `pnpm build` 及び `pnpm typecheck` が成功し、期待されるファイルが出力されたことを確認。
- 未解決: なし

### 2026-10-05 T-0.2

- やったこと: `eslint.config.js` の作成、コーディング規約に沿った厳密なルールの実装とテスト。
- 証拠: ダミーファイルでのルール違反検出、及び削除後の `pnpm lint` 成功。
- 未解決: なし

### 2026-10-05 T-0.1

- やったこと: package.json, tsconfig.json, フォーマッタ設定等の作成。devDependenciesのインストール。検証用ツールの仮実装とテスト。
- 証拠: `pnpm check:structure`, `pnpm check:boundaries`, `pnpm check:rules` のすべてが OK。
- 未解決: なし

<!-- 形式:
### YYYY-MM-DD T-x.y
- やったこと:
- 証拠: pnpm verify の要約 / テスト件数 / ベンチ値
- 未解決:
-->
