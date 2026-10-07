# 00. ビジョン

## 1. 一言で

**「100 万スプライトを 144FPS で動かせる、全部入りの 2D エンジン」**

## 2. 目標 (Goals)

| ID  | 目標                                                                    | 測定方法                                          |
| --- | ----------------------------------------------------------------------- | ------------------------------------------------- |
| G1  | WebGPU で **100 万静止スプライト @144FPS** (フレーム時間 p99 ≤ 6.94ms)  | `bench/scenes/static-sprites.ts` count=1000000    |
| G2  | WebGPU で **100 万移動エージェント (群衆) @144FPS**                     | `bench/scenes/crowd.ts` count=1000000             |
| G3  | WebGL2 で **10 万スプライト @144FPS / 100 万 @60FPS**                   | `bench/scenes/static-sprites.ts` backend=webgl2   |
| G4  | CPU Tier エンティティ **10 万体のロジック更新 ≤ 2ms** (parallel ビルド) | `bench/scenes/cpu-entities.ts`                    |
| G5  | 高レベル API で「数行で大きな機能が動く」こと                           | `examples/` の各サンプルの `main.ts` が 30 行以下 |
| G6  | ランタイム依存ゼロ                                                      | `package.json` の `dependencies` が空             |

> [!NOTE]
> 性能の基準機は「デスクトップ dGPU (RTX 3060 相当以上)、**Firefox 安定版、1920×1080、143.98Hz**」。数値はベンチで継続的に計測する。ブラウザテストもベンチも同じ Firefox を使う (docs/10 §3)。

## 3. 非目標 (Non-Goals) — 実装してはならない

- 3D レンダリング、3D 物理、3D 数学 (mat4 等)
- WASM (AssemblyScript, Rust, Emscripten, Basis Universal トランスコーダ含む)
- Phaser との API 互換、Phaser からの移植レイヤー
- Canvas 2D レンダラ (WebGL2 すら使えない環境は非対応)
- ネットワーク/マルチプレイ機能
- ビジュアルエディタ

## 4. 設計原則

| #   | 原則                | 具体的に何をするか                                                                |
| --- | ------------------- | --------------------------------------------------------------------------------- |
| P1  | Data-Oriented / SoA | エンティティは TypedArray の列。1 スプライト 1 オブジェクトを作らない             |
| P2  | GPU-Resident First  | 大量エンティティは GPU 上で生成・更新・描画。CPU→GPU 転送は dirty range のみ      |
| P3  | Zero-GC Hot Path    | フレームループでのアロケーション 0                                                |
| P4  | Backend 透過        | 上位層は `RhiDevice` だけを見る。WebGPU/WebGL2 の差は `rhi/` と「描画パス」で吸収 |
| P5  | 1 コード 2 ビルド   | `__PARALLEL__` で parallel / embed を切替。ロジックは同一                         |
| P6  | 全部入り API        | エンジンの全機能を `scene.*` から数行で使える。上級者には `lowlevel` を公開       |

## 5. エンティティ二層構造 (ADR-0007)

|                | CPU Tier                                           | GPU Tier                                         |
| -------------- | -------------------------------------------------- | ------------------------------------------------ |
| 想定数         | 〜10 万                                            | 〜数百万                                         |
| 例             | プレイヤー、敵、UI、弾 (少数)                      | 群衆、パーティクル、流体粒子、弾幕               |
| データの居場所 | CPU の ECS (SoA) が正。GPU には dirty 分だけコピー | GPU バッファが正。CPU はパラメータとコマンドのみ |
| ロジック       | TypeScript のシステム/ユーザーコード               | コンピュートシェーダ (WebGL2 は GPGPU)           |
| 個別操作       | 可能 (`SpriteHandle`)                              | 不可 (グループ単位: `CrowdHandle` 等)            |
| 描画           | 同一の Unified Sprite Buffer → 同一の描画パス      | 同左                                             |

## 6. ビルド (ADR-0004)

| ビルド     | `__PARALLEL__` | 用途                                 | 要件                                              |
| ---------- | -------------- | ------------------------------------ | ------------------------------------------------- |
| `parallel` | `true`         | 自サイト配信・最高性能               | COOP/COEP ヘッダ (`crossOriginIsolated === true`) |
| `embed`    | `false`        | iframe 埋め込み・CDN・ゲームポータル | なし                                              |

parallel ビルドでも実行時に `crossOriginIsolated` が `false` なら自動で直列実行に縮退する。
