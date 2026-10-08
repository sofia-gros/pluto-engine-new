# 現在のタスク: T-4.7 カメラ・レンダーグラフ・レンダラ

## 1. 概要

- **タスク ID**: T-4.7
- **タスク名**: カメラ・レンダーグラフ・レンダラ
- **参照仕様**:
  - `docs/07-renderer.md` §6 (カメラ uniform), §12 (レンダーグラフ), §13 (性能基準)
  - `docs/02-directory-structure.md` §17 (レンダラ), §15 (ポストシェーダ)
  - `docs/12-roadmap.md` §Phase 4 (受け入れ条件: 性能基準, baseline.json 登録, 既定パス順序定数)

## 2. 実装計画

### 2.1 シェーダ (`src/shaders/post/`)

1. `fullscreen.wgsl`: フルスクリーン三角形の頂点生成（頂点インデックス 0..2 から `[-1, 1]` クリップ座標および UV 生成）とテクスチャサンプリング・描画フラグメント。
2. `fullscreen.vert.glsl`: WebGL2 用フルスクリーン三角形頂点シェーダ。
3. `blit.frag.glsl`: WebGL2 用テクスチャ blit（コピー）フラグメントシェーダ。
4. `src/shaders/shader-library.ts`: `post/fullscreen` 等の登録。

### 2.2 カメラ (`src/render/camera/`)

1. `camera-store.ts`:
   - カメラの SoA ストア (最大 8 台 `MAX_CAMERAS`)。
   - `x, y, zoomX, zoomY, rotation, vpX, vpY, vpW, vpH, clearColor, isDirty` を保持。
2. `camera-uniforms.ts`:
   - `// @pluto-hot` マーカー、400 行以下、アロケーションゼロ。
   - 64 バイト（std140）Camera Uniforms 構造体の算出。
   - ワールド→クリップ行列 `(a, b, c, d, tx, ty)`、カリング用 AABB `(minX, minY, maxX, maxY)`、画面寸法 `(screenW, screenH, invW, invH)`。
   - GPU バッファへの更新。

### 2.3 レンダーグラフ (`src/render/graph/`)

1. `render-pass-node.ts`: パスノード型定義 (`name`, `reads`, `writes`, `execute(encoder, ctx)` など)。
2. `transient-pool.ts`: 一時レンダーターゲットテクスチャのサイズ・フォーマット別プール。
3. `render-graph.ts`:
   - 既定パス順序（`sim:*` → `sprite:cull` → `tilemap:draw` → `sprite:draw` → `text:draw` → `graphics:draw` → `lighting` → `camera:fx` → `post:*` → `present`）に基づく線形実行。
   - 一時リソースの寿命管理。

### 2.4 レンダラ統括 (`src/render/renderer.ts`)

1. `Renderer`:
   - `RhiDevice`、`CameraStore`、`CameraUniforms`、`RenderGraph`、`SpriteRenderer` を統括。
   - マルチカメラ対応、ビューポート設定、レンダーパス実行、スワップチェーンへの表示。
2. `src/render/index.ts` および `src/lowlevel.ts` での公開。

### 2.5 ベンチマークシーン (`bench/scenes/static-sprites.ts`)

1. 100 万静止スプライトシーンの実装。
2. `bench/baseline.json` への登録。

### 2.6 テストと検証

1. ユニットテスト:
   - `tests/unit/render/camera/camera-store.test.ts`
   - `tests/unit/render/camera/camera-uniforms.test.ts`
   - `tests/unit/render/graph/render-graph.test.ts`
   - `tests/unit/render/renderer.test.ts`
2. ブラウザテスト:
   - `tests/browser/render/renderer.spec.ts` (複数カメラ・画面分割描画検証)
3. `pnpm verify` (エラー 0・警告 0)
4. `pnpm bench` による性能測定
