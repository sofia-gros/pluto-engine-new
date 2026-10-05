# Pluto Engine ドキュメント索引

## 読む順番 (初回)

1. [00-vision.md](./00-vision.md) — 何を作るか / 作らないか
2. [01-architecture.md](./01-architecture.md) — レイヤー構造・データフロー
3. [02-directory-structure.md](./02-directory-structure.md) — **全ファイルの責務 (唯一の正)**
4. [03-coding-standards.md](./03-coding-standards.md) — コーディング規約
5. [12-roadmap.md](./12-roadmap.md) — タスクと受け入れ条件
6. [progress/PROGRESS.md](./progress/PROGRESS.md) — 現在の進捗

## 仕様書 (タスクごとに参照)

| ファイル                                             | 内容                                                     |
| ---------------------------------------------------- | -------------------------------------------------------- |
| [04-memory-and-ecs.md](./04-memory-and-ecs.md)       | メモリモデル・SoA ECS の厳密な仕様                       |
| [05-jobs-and-builds.md](./05-jobs-and-builds.md)     | ジョブシステム・parallel/embed ビルド                    |
| [06-rhi.md](./06-rhi.md)                             | GPU 抽象層 (WebGPU / WebGL2)                             |
| [07-renderer.md](./07-renderer.md)                   | スプライトレイアウト・描画パイプライン・カリング・ソート |
| [08-simulation.md](./08-simulation.md)               | パーティクル・群衆・流体・物理のアルゴリズム             |
| [09-api-design.md](./09-api-design.md)               | 高レベル API の設計規約と API カタログ                   |
| [10-testing-strategy.md](./10-testing-strategy.md)   | テストの種類・配置・閾値                                 |
| [11-build-and-release.md](./11-build-and-release.md) | ツールチェーン・依存許可リスト・scripts・CI              |
| [13-glossary.md](./13-glossary.md)                   | 用語集                                                   |

## 意思決定記録 (ADR)

[adr/](./adr/) — 確定した設計判断。覆すにはユーザーの承認と新しい ADR が必要。

## 進捗管理 (エージェントが更新してよい唯一の場所)

| パス                        | 内容                                             |
| --------------------------- | ------------------------------------------------ |
| `progress/PROGRESS.md`      | タスク状態表と作業ログ                           |
| `progress/current-task.md`  | 現在のタスクの計画 (`pluto-task-start` で上書き) |
| `progress/reviews/T-x.y.md` | タスクごとの自己レビュー記録                     |
| `progress/escalations.md`   | ユーザーへの確認事項の記録                       |
