# 現在のタスク: T-4.4 CPU 補助描画パス

## 1. 目的

`docs/07-renderer.md` §7, §9、`docs/02-directory-structure.md` §15, §17、および `docs/12-roadmap.md` に基づき、スプライト描画シェーダ (`sprite.wgsl`, `sprite.vert.glsl`, `sprite.frag.glsl`)、CPU カリングカーネル (`sprite-cpu-cull-kernel.ts`)、CPU 補助描画パス (`sprite-path-cpu-assisted.ts`)、スプライトレンダラ統括クラス (`sprite-renderer.ts`) を実装し、Worker へのカーネル登録と、両バックエンドでのゴールデン画像検証を行う。

## 2. 作成・編集するファイル (`docs/02-directory-structure.md` に完全準拠)

| ファイル                                                    | 責務                                                                                           | HOT |
| ----------------------------------------------------------- | ---------------------------------------------------------------------------------------------- | --- |
| `src/shaders/sprite/sprite.wgsl`                            | スプライト描画 WGSL (vertex pulling, RGBA8/圧縮配列サンプリング, Opaque/Alpha/Additive)        | -   |
| `src/shaders/sprite/sprite.vert.glsl`                       | 同 GLSL 頂点シェーダ (データテクスチャ vertex pulling)                                         | -   |
| `src/shaders/sprite/sprite.frag.glsl`                       | 同 GLSL フラグメントシェーダ (RGBA8/圧縮配列サンプリング, ティント乗算)                        | -   |
| `src/shaders/shader-library.ts`                             | スプライトシェーダの登録                                                                       | -   |
| `src/render/sprite/sprite-cpu-cull-kernel.ts`               | CPU チャンクカリングカーネル (外接円とカメラ矩形の交差判定、3 ビン別スロット配列構築)          | HOT |
| `src/render/sprite/sprite-path-cpu-assisted.ts`             | compute 非対応環境向け描画パス (CPU カリング + LSD 基数ソート + 可視列転送 + インスタンス描画) | HOT |
| `src/render/sprite/sprite-renderer.ts`                      | 能力 (`caps.compute`) に応じて描画パスを選択し、スプライト描画全体を統括                       | -   |
| `src/render/index.ts`                                       | 公開シンボルの更新 (`SpriteRenderer`, `SpritePathCpuAssisted` 等)                              | -   |
| `src/lowlevel.ts`                                           | 低レベル公開シンボルの更新 (`spriteCpuCullKernel` 等)                                          | -   |
| `src/worker-main.ts`                                        | `sprite-cpu-cull-kernel` の登録                                                                | -   |
| `tests/unit/render/sprite/sprite-cpu-cull-kernel.test.ts`   | CPU カリングカーネルの単体テスト                                                               | -   |
| `tests/unit/render/sprite/sprite-path-cpu-assisted.test.ts` | CPU 補助パスの単体テスト                                                                       | -   |
| `tests/unit/render/sprite/sprite-renderer.test.ts`          | スプライトレンダラの単体テスト                                                                 | -   |
| `tests/browser/render/sprite-cpu-assisted.spec.ts`          | ブラウザゴールデン画像テスト (64 スプライトシーン, WebGPU & WebGL2)                            | -   |
| `docs/progress/PROGRESS.md`                                 | T-4.4 を IN_PROGRESS に更新                                                                    | -   |

## 3. 実装ステップ

1. **Step 1: 計画作成と PROGRESS 更新 (`pluto-task-start`)**
   - 本ファイルを保存し、`PROGRESS.md` の T-4.4 を `IN_PROGRESS` に更新。
2. **Step 2: スプライトシェーダの実装 (`pluto-shader` / `pluto-implement`)**
   - `src/shaders/sprite/sprite.wgsl`
   - `src/shaders/sprite/sprite.vert.glsl`
   - `src/shaders/sprite/sprite.frag.glsl`
   - `src/shaders/shader-library.ts` への登録
   - シェーダ単体コンパイル/前処理テスト。
3. **Step 3: CPU カリングカーネルの実装 (`pluto-implement` / `pluto-perf`)**
   - `src/render/sprite/sprite-cpu-cull-kernel.ts` (HOT)
   - 外接円判定: 中心 `pos`, 半径 `length(vec2(width * scaleX, height * scaleY))`
   - 3 ビン分類: Opaque (bit 3), Additive (bit 4), Alpha (それ以外)
   - `src/worker-main.ts` への登録
   - 単体テスト `sprite-cpu-cull-kernel.test.ts`
4. **Step 4: CPU 補助描画パスの実装 (`pluto-implement` / `pluto-perf`)**
   - `src/render/sprite/sprite-path-cpu-assisted.ts` (HOT)
   - LSD 基数ソート (Alpha ビン: 8bit × 4 パス, key = `(layer << 20) | (sortKey * 1048576)`)
   - 可視インデックスのデータテクスチャ転送 (`writeTexture`)
   - パイプライン状態作成 (Opaque: Less + 深度書込, Alpha: PremultipliedAlpha + Less, Additive: Additive + Less)
   - 単体テスト `sprite-path-cpu-assisted.test.ts`
5. **Step 5: SpriteRenderer クラスの実装 (`pluto-implement`)**
   - `src/render/sprite/sprite-renderer.ts`
   - `caps.compute` によるパス選択 (v1 では CPU 補助パスへルーティング)
   - 単体テスト `sprite-renderer.test.ts`
6. **Step 6: ゴールデン画像テストの作成と検証 (`pluto-test`)**
   - `tests/browser/render/sprite-cpu-assisted.spec.ts`
   - 64 スプライト (layer/sortKey/flip/tint/opaque/additive) シーン
   - WebGPU と WebGL2 での描画結果を検証・ゴールデン保存
7. **Step 7: 検証・レビュー・コミット・プッシュ (`pluto-test` / `pluto-review` / `pluto-task-finish`)**
   - `pnpm verify` (エラー 0・警告 0)
   - `pnpm bench`
   - `docs/progress/reviews/T-4.4.md`
   - `PROGRESS.md` 更新
   - git commit & git push

## 4. 完了条件 (受け入れ条件)

- [ ] スプライトシェーダは RGBA8 配列と圧縮配列の両方をバインドし `textureSampleLevel` / `textureLod` で読む (07 §5)
- [ ] `sprite-cpu-cull-kernel` を `src/worker-main.ts` に登録する
- [ ] 両バックエンドでゴールデン画像 (layer/sortKey/flip/tint/opaque/additive を含む 64 スプライトのシーン) が一致
- [ ] `pnpm verify` がエラー 0・警告 0 で成功
- [ ] レビュー記録 `docs/progress/reviews/T-4.4.md` が作成されている
