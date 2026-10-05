# ADR (Architecture Decision Records)

確定した設計判断の記録。**エージェントは ADR を変更・追加してはならない** (ユーザーの指示がある場合を除く)。
新たな判断が必要になったら `pluto-escalate` スキルで提案する。

| ID | タイトル | 状態 |
|----|----------|------|
| [0001](./0001-no-wasm.md) | WASM を使わない | 確定 |
| [0002](./0002-2d-only.md) | 2D 専用 | 確定 |
| [0003](./0003-rich-api-no-phaser-compat.md) | Phaser 互換なし・全機能を高レベル API で提供 | 確定 |
| [0004](./0004-parallel-and-embed-builds.md) | parallel / embed の 2 ビルド | 確定 |
| [0005](./0005-webgpu-first-webgl2-fallback.md) | WebGPU 優先・WebGL2 フォールバック | 確定 |
| [0006](./0006-single-package-strict-layers.md) | 単一パッケージ + 厳格なレイヤー | 確定 |
| [0007](./0007-cpu-gpu-entity-tiers.md) | CPU Tier / GPU Tier のエンティティ二層構造 | 確定 |

## テンプレート

```md
# ADR-XXXX: タイトル
- 状態: 提案 / 確定 / 廃止
- 日付: YYYY-MM-DD
## 背景
## 決定
## 理由
## 影響 (守るべきこと)
## 却下した代替案
```
