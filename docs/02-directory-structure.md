# 02. ディレクトリ構造とファイル責務 (唯一の正)

> [!IMPORTANT]
> このドキュメントは **リポジトリに存在してよいファイルの唯一の正 (Single Source of Truth)** である。
>
> - `src/` のファイルは **この表に記載されたものだけ** 作成してよい。`tools/check-structure.mjs` が検査する。
> - 表にないファイルが必要になったら作業を止め、`pluto-escalate` スキルでユーザーに提案する。勝手に追加しない。
> - 表の書式 (`| \`パス\` | 責務 | HOT | タスク |`) を崩さないこと。ツールがパースしている。

## 凡例

- **HOT**: `HOT` = 毎フレーム/エンティティ毎に実行されるコードを含む。1 行目に `// @pluto-hot` が必須で、`.agents/rules/02-performance.md` の禁止事項が機械的に検査される。`-` = コールドパス。
- **タスク**: そのファイルを最初に作成するタスク ID (`docs/12-roadmap.md`)。それより前のタスクで作成してはならない。
- **index.ts**: 各モジュールの公開窓口。**re-export (`export ... from`) とコメントのみ** を書く。ロジックを書いてはならない。

---

## 1. トップレベル

```
pluto-engine/
├── AGENTS.md                 # エージェント最上位ルール (変更禁止)
├── .agents/                  # ルール・スキル (変更禁止)
├── .github/workflows/        # CI
├── docs/                     # 設計ドキュメント (progress/ 以外変更禁止。api/ は gen-api-docs の生成物で手編集禁止)
├── src/                      # エンジン本体
├── tests/                    # テスト (unit: Node / browser: Playwright)
├── bench/                    # ベンチマーク
├── examples/                 # サンプル
├── tools/                    # 検査・補助スクリプト (Node, 依存なし)
└── (設定ファイル群)
```

## 2. ルート設定ファイル

| パス                       | 責務                                                                                  | HOT | タスク |
| -------------------------- | ------------------------------------------------------------------------------------- | --- | ------ |
| `package.json`             | パッケージ定義・scripts (内容は `docs/11-build-and-release.md` §scripts に厳密に従う) | -   | T-0.1  |
| `.mise.toml`               | miseによるツールチェイン（Node, pnpm）のバージョン固定                                | -   | T-0.1  |
| `pnpm-lock.yaml`           | ロックファイル (pnpm が生成。手で編集しない)                                          | -   | T-0.1  |
| `tsconfig.json`            | TypeScript 設定 (`docs/11-build-and-release.md` §tsconfig)                            | -   | T-0.1  |
| `tsconfig.build.json`      | 型定義出力専用 (`src/` のみ, `dist/types` へ)                                         | -   | T-0.3  |
| `.gitignore`               | Git 除外設定                                                                          | -   | T-0.1  |
| `.editorconfig`            | エディタ設定 (LF, UTF-8, 2 スペース)                                                  | -   | T-0.1  |
| `.prettierrc.json`         | Prettier 設定                                                                         | -   | T-0.1  |
| `.prettierignore`          | Prettier 除外                                                                         | -   | T-0.1  |
| `eslint.config.js`         | ESLint flat config (`docs/03-coding-standards.md` §ESLint)                            | -   | T-0.2  |
| `vite.config.ts`           | ビルド設定。`--mode parallel` / `--mode embed` で `__PARALLEL__` を切替               | -   | T-0.3  |
| `vitest.config.ts`         | ユニットテスト設定 (カバレッジ閾値含む)                                               | -   | T-0.4  |
| `playwright.config.ts`     | ブラウザテスト設定 (Firefox、WebGPU 有効プレフ)                                       | -   | T-0.5  |
| `.github/workflows/ci.yml` | CI (verify, unit test, build, browser test(WebGL2))                                   | -   | T-0.6  |
| `README.md`                | パッケージ概要・導入方法・最小コード例 (`docs/09-api-design.md` §3)                   | -   | T-10.4 |
| `CHANGELOG.md`             | 変更履歴 (`docs/11-build-and-release.md` §8)                                          | -   | T-10.4 |

## 3. tools/ (Node スクリプト。外部依存禁止。`node:` 組込モジュールのみ)

> [!NOTE]
> 例外: `tools/run-bench.mjs` は `@playwright/test` と `vite`、`tools/gen-api-docs.mjs`・`tools/check-structure.mjs`・`tools/check-boundaries.mjs`・`tools/check-rules.mjs`・`tools/lib/ts-source.mjs` は `typescript` (構文解析のため) を import してよい (いずれも許可リストの devDependencies)。それ以外の tools は `node:` 組込モジュールのみ。

| パス                         | 責務                                                                                 | HOT | タスク |
| ---------------------------- | ------------------------------------------------------------------------------------ | --- | ------ |
| `tools/verify.mjs`           | 全静的検査を順に実行し要約を表示 (`pnpm verify`)                                     | -   | 既存   |
| `tools/check-structure.mjs`  | ファイルが本ドキュメントに記載されているか検査                                       | -   | 既存   |
| `tools/check-boundaries.mjs` | モジュール依存境界を検査                                                             | -   | 既存   |
| `tools/check-rules.mjs`      | 禁止パターン・JSDoc 日本語・HOT 規則・行数を検査                                     | -   | 既存   |
| `tools/lib/doc-table.mjs`    | 本ドキュメントの表をパースする共通関数                                               | -   | 既存   |
| `tools/lib/source-files.mjs` | ソースファイル列挙の共通関数                                                         | -   | 既存   |
| `tools/lib/ts-source.mjs`    | TypeScript Compiler API による構文解析の共通関数 (import 抽出・JSDoc 取得・AST 走査) | -   | T-R.1  |
| `tools/lib/rule-tables.mjs`  | 検査規則の表 (禁止 API と例外ファイル・必須ユニットテスト・依存表のパース)           | -   | T-R.1  |
| `tools/lib/hot-rules.mjs`    | HOT ファイル規則の構文木による検査 (check-rules から使う)                            | -   | T-R.1  |
| `tools/run-bench.mjs`        | Playwright でベンチページを開き結果 JSON を保存                                      | -   | T-0.7  |
| `tools/compare-bench.mjs`    | 結果とベースラインを比較し 10% 超の悪化で失敗                                        | -   | T-0.7  |
| `tools/check-bundle.mjs`     | embed ビルドに Worker/SharedArrayBuffer が含まれないことを検査                       | -   | T-0.3  |
| `tools/gen-api-docs.mjs`     | TypeScript Compiler API で公開 API の Markdown を `docs/api/` に生成                 | -   | T-10.3 |

## 4. src/ ルート

| パス                   | 責務                                                                                 | HOT | タスク |
| ---------------------- | ------------------------------------------------------------------------------------ | --- | ------ |
| `src/index.ts`         | 公開 API エントリ (高レベル API)。`scene` の re-export と `VERSION` 定数のみ         | -   | T-0.3  |
| `src/lowlevel.ts`      | 上級者向け低レベル API エントリ (ECS, RHI, render 等の re-export のみ)               | -   | T-0.3  |
| `src/build-flags.d.ts` | ビルド時定数 `__PARALLEL__`, `__DEBUG__`, `__VERSION__` の型宣言                     | -   | T-0.3  |
| `src/worker-main.ts`   | Worker のエントリ。組込カーネルを持つモジュールを import し `runWorkerLoop()` を呼ぶ | -   | T-R.4  |

## 5. src/core/debug — デバッグ支援 (依存なし)

| パス                            | 責務                                                                               | HOT | タスク |
| ------------------------------- | ---------------------------------------------------------------------------------- | --- | ------ |
| `src/core/debug/index.ts`       | 公開窓口                                                                           | -   | T-0.4  |
| `src/core/debug/assert.ts`      | `assert(cond, msg)` / `unreachable(x: never)`。`__DEBUG__` が false なら何もしない | -   | T-0.4  |
| `src/core/debug/pluto-error.ts` | `PlutoError` クラスと `ErrorCode` 定数                                             | -   | T-1.2  |
| `src/core/debug/logger.ts`      | `logger` (レベル付きログ。唯一 `console` を使ってよいファイル)                     | -   | T-1.2  |

## 6. src/core/math — 数学 (割り当てなしの関数群)

| パス                        | 責務                                                                                           | HOT | タスク |
| --------------------------- | ---------------------------------------------------------------------------------------------- | --- | ------ |
| `src/core/math/index.ts`    | 公開窓口                                                                                       | -   | T-1.1  |
| `src/core/math/scalar.ts`   | `clamp`, `lerp`, `inverseLerp`, `smoothstep`, `wrap`, `approxEqual`, `DEG_TO_RAD` 等           | HOT | T-1.1  |
| `src/core/math/vec2.ts`     | `Float32Array` に out 引数で書き込む 2D ベクトル関数                                           | HOT | T-1.1  |
| `src/core/math/affine2d.ts` | 2x3 アフィン行列 (`Float32Array(6)`) の合成・逆行列・点変換                                    | HOT | T-1.1  |
| `src/core/math/aabb.ts`     | AABB (`minX,minY,maxX,maxY`) の判定関数                                                        | HOT | T-1.1  |
| `src/core/math/bits.ts`     | `nextPow2`, `isPow2`, `popcount32`, `ctz32`, `log2Floor`                                       | HOT | T-1.1  |
| `src/core/math/half.ts`     | f32 ⇔ f16 変換 (`f32ToF16`, `f16ToF32`, 2 値パック `packHalf2x16(lo, hi)`。丸めは最近接偶数)   | HOT | T-1.1  |
| `src/core/math/color.ts`    | RGBA8 パック/アンパック、`0xRRGGBB` → ABGR 変換                                                | HOT | T-1.1  |
| `src/core/math/rng.ts`      | xoshiro128** 乱数 (`createRng(seed)`、シードは splitmix32 で 4 語に展開)。`Math.random` の代替 | HOT | T-1.1  |

## 7. src/core/memory — メモリ管理

| パス                                 | 責務                                                                                                                                 | HOT | タスク |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------ | --- | ------ |
| `src/core/memory/index.ts`           | 公開窓口                                                                                                                             | -   | T-1.3  |
| `src/core/memory/scalar-type.ts`     | `ScalarType` 定数 (`F32,I32,U32,I16,U16,I8,U8`) とバイト長・TypedArray 対応表                                                        | -   | T-1.3  |
| `src/core/memory/buffer-factory.ts`  | `createBackingBuffer(bytes)`。`__PARALLEL__` (かつ crossOriginIsolated) なら固定長 `SharedArrayBuffer`、そうでなければ `ArrayBuffer` | -   | T-1.3  |
| `src/core/memory/bitset.ts`          | `Uint32Array` ベースの固定長ビットセット                                                                                             | HOT | T-1.3  |
| `src/core/memory/free-list.ts`       | u32 インデックスの再利用スタック                                                                                                     | HOT | T-1.3  |
| `src/core/memory/range-allocator.ts` | 連続範囲の確保/解放 (スプライトスロット、GPU バッファ領域用。first-fit + 隣接結合)                                                   | -   | T-1.3  |
| `src/core/memory/ring-buffer.ts`     | 固定長 TypedArray リングバッファ (コマンド・イベント用)                                                                              | HOT | T-1.3  |
| `src/core/memory/object-pool.ts`     | コールドパス用オブジェクトプール (ハンドルオブジェクト等)                                                                            | -   | T-1.3  |

## 8. src/core/events / src/core/time

| パス                               | 責務                                                                                                         | HOT | タスク |
| ---------------------------------- | ------------------------------------------------------------------------------------------------------------ | --- | ------ |
| `src/core/events/index.ts`         | 公開窓口                                                                                                     | -   | T-1.4  |
| `src/core/events/event-emitter.ts` | 型安全な `EventEmitter<EventMap>` (`on/once/off/emit`)。リスナー配列は再利用                                 | -   | T-1.4  |
| `src/core/time/index.ts`           | 公開窓口                                                                                                     | -   | T-1.5  |
| `src/core/time/clock.ts`           | `Clock` インターフェース、`PerformanceClock` (唯一 `performance.now()` を使ってよい)、テスト用 `ManualClock` | -   | T-1.5  |
| `src/core/time/fixed-step.ts`      | 固定タイムステップのアキュムレータ (`FixedStepper`)。最大ステップ数でスパイラル防止                          | HOT | T-1.5  |

## 9. src/core/ecs — SoA ECS (仕様: `docs/04-memory-and-ecs.md`)

| パス                              | 責務                                                                                  | HOT | タスク |
| --------------------------------- | ------------------------------------------------------------------------------------- | --- | ------ |
| `src/core/ecs/index.ts`           | 公開窓口                                                                              | -   | T-1.6  |
| `src/core/ecs/schema.ts`          | コンポーネントスキーマ型 (`ComponentSchema`, `FieldToken<T>`)                         | -   | T-1.6  |
| `src/core/ecs/component.ts`       | `defineComponent(name, schema)`。コンポーネント ID とフィールドトークンを発行         | -   | T-1.6  |
| `src/core/ecs/entity.ts`          | エンティティハンドル (index 22bit + generation 10bit) の pack/unpack                  | HOT | T-1.6  |
| `src/core/ecs/entity-table.ts`    | エンティティ ID → (archetypeId, row, generation) の SoA 表と ID 再利用                | HOT | T-1.6  |
| `src/core/ecs/column.ts`          | 1 フィールド分の可変長 TypedArray カラム (固定長バッファ + 伸長時コピー)              | HOT | T-1.7  |
| `src/core/ecs/archetype.ts`       | 同一コンポーネント構成の行集合。行の追加・swap-remove・行コピー                       | HOT | T-1.7  |
| `src/core/ecs/archetype-graph.ts` | コンポーネント追加/削除によるアーキタイプ遷移のキャッシュ                             | -   | T-1.7  |
| `src/core/ecs/change-tracking.ts` | 64 行ブロック単位の dirty ビット管理                                                  | HOT | T-1.8  |
| `src/core/ecs/chunk-view.ts`      | システムに渡すチャンク (最大 16384 行) のビュー。`column(field)` で TypedArray を返す | HOT | T-1.8  |
| `src/core/ecs/query.ts`           | `Query` (all/none 条件、該当アーキタイプのキャッシュ、チャンク列挙)                   | HOT | T-1.8  |
| `src/core/ecs/command-buffer.ts`  | 構造変更 (spawn/despawn/add/remove) の遅延キュー                                      | HOT | T-1.9  |
| `src/core/ecs/system.ts`          | `defineSystem()` と `Phase` 定数、システム記述子型                                    | -   | T-1.9  |
| `src/core/ecs/world-spawn.ts`     | `World` の spawn 責務 (即時 spawn と一括 spawn の処理本体)                            | HOT | T-R.5  |
| `src/core/ecs/world.ts`           | `World`: 上記をまとめる。spawn/despawn/query/システム実行/同期点                      | -   | T-1.9  |

## 10. src/jobs — ジョブシステム (仕様: `docs/05-jobs-and-builds.md`)

| パス                             | 責務                                                                                                          | HOT | タスク |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------- | --- | ------ |
| `src/jobs/index.ts`              | 公開窓口 (`create-scheduler` と型のみ公開)                                                                    | -   | T-2.1  |
| `src/jobs/kernel.ts`             | `KernelFn` 型 (純粋関数 `(view, params, buffers) => void`)、`KernelId`、`defineKernel()`、`MAX_KERNEL_PARAMS` | -   | T-2.1  |
| `src/jobs/kernel-registry.ts`    | 組込カーネルの登録表 (Worker 側でも同じ表を import する)                                                      | -   | T-2.1  |
| `src/jobs/scheduler.ts`          | `Scheduler` インターフェース                                                                                  | -   | T-2.1  |
| `src/jobs/serial-scheduler.ts`   | メインスレッドで全チャンクを順に実行                                                                          | HOT | T-2.1  |
| `src/jobs/sync.ts`               | `Atomics` によるチャンクカウンタ・完了カウンタ操作                                                            | HOT | T-2.2  |
| `src/jobs/worker-protocol.ts`    | メイン⇔Worker のメッセージ型定義                                                                              | -   | T-2.2  |
| `src/jobs/worker-entry.ts`       | Worker 側ループ `runWorkerLoop()`。共有メモリを受け取りカーネルを実行 (副作用なし)                            | HOT | T-2.2  |
| `src/jobs/threaded-scheduler.ts` | Worker プール + メインスレッド参加型の並列実行                                                                | HOT | T-2.2  |
| `src/jobs/create-scheduler.ts`   | `__PARALLEL__` と `crossOriginIsolated` を見て実装を選ぶ唯一の場所                                            | -   | T-2.3  |

## 11. src/transform — 変換・階層

| パス                                    | 責務                                                                         | HOT | タスク |
| --------------------------------------- | ---------------------------------------------------------------------------- | --- | ------ |
| `src/transform/index.ts`                | 公開窓口                                                                     | -   | T-2.4  |
| `src/transform/transform-components.ts` | `Transform`, `WorldTransform`, `Parent`, `HierarchyDepth` コンポーネント定義 | -   | T-2.4  |
| `src/transform/transform-kernels.ts`    | ローカル→ワールド行列計算カーネル (深さ順)                                   | HOT | T-2.4  |
| `src/transform/transform-system.ts`     | 上記カーネルを深さ順にスケジュールするシステム                               | -   | T-2.4  |

## 12. src/rhi — GPU 抽象層 (仕様: `docs/06-rhi.md`)

| パス                                   | 責務                                                                                                                                                                                                                                            | HOT | タスク |
| -------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --- | ------ |
| `src/rhi/index.ts`                     | 公開窓口 (インターフェース・型・`createDevice` のみ。バックエンド実装は非公開)                                                                                                                                                                  | -   | T-3.1  |
| `src/rhi/types.ts`                     | 列振定数 (`BufferUsage`, `TextureUsage`, `TextureFormat`, `BlendMode`, `LoadAction`, `SWAPCHAIN_FORMAT`, `DATA_TEXTURE_*` 等) と記述子型 (`BufferDesc` 〜 `RenderPassDesc`。docs/06 §5・§5.1)                                                   | -   | T-3.1  |
| `src/rhi/device.ts`                    | `RhiDevice`, `RhiCommandEncoder`, `RhiRenderPass`, `RhiComputePass` と GPU リソースのインターフェース (`RhiBuffer`, `RhiTexture`, `RhiSampler`, `RhiBindGroupLayout`, `RhiBindGroup`, `RhiRenderPipeline`, `RhiComputePipeline`, `RhiQuerySet`) | -   | T-3.1  |
| `src/rhi/capabilities.ts`              | `RhiCapabilities` 17 プロパティ (compute, indirectDraw, timestampQuery, maxTextureSize, minUniformBufferOffsetAlignment, maxComputeInvocationsPerWorkgroup 等。docs/06 §3)                                                                      | -   | T-3.1  |
| `src/rhi/shader-source.ts`             | `ShaderSource` 型 (`wgsl` / `glslVertex` / `glslFragment`)                                                                                                                                                                                      | -   | T-3.1  |
| `src/rhi/validate.ts`                  | `docs/06` §5.1.1 の検証規則を全バックエンド共通で実装する。`create*` の前に呼び、選反は `PlutoError` を送出する。バックエンド別には公開しない                                                                                                   | -   | T-3.1  |
| `src/rhi/create-device.ts`             | WebGPU → WebGL2 の順でデバイス生成を試みる唯一の場所                                                                                                                                                                                            | -   | T-3.4  |
| `src/rhi/webgpu/webgpu-device.ts`      | WebGPU 版 `RhiDevice`                                                                                                                                                                                                                           | -   | T-3.2  |
| `src/rhi/webgpu/webgpu-buffer.ts`      | WebGPU 版バッファ                                                                                                                                                                                                                               | -   | T-3.2  |
| `src/rhi/webgpu/webgpu-texture.ts`     | WebGPU 版テクスチャ・サンプラ                                                                                                                                                                                                                   | -   | T-3.2  |
| `src/rhi/webgpu/webgpu-pipeline.ts`    | WebGPU 版 render/compute パイプライン                                                                                                                                                                                                           | -   | T-3.2  |
| `src/rhi/webgpu/webgpu-bind-group.ts`  | WebGPU 版バインドグループ                                                                                                                                                                                                                       | -   | T-3.2  |
| `src/rhi/webgpu/webgpu-encoder.ts`     | WebGPU 版コマンドエンコーダ・パス                                                                                                                                                                                                               | HOT | T-3.2  |
| `src/rhi/webgpu/webgpu-convert.ts`     | RHI 定数 → WebGPU 定数の変換表                                                                                                                                                                                                                  | -   | T-3.2  |
| `src/rhi/webgl2/webgl2-device.ts`      | WebGL2 版 `RhiDevice`                                                                                                                                                                                                                           | -   | T-3.3  |
| `src/rhi/webgl2/webgl2-buffer.ts`      | WebGL2 版バッファ (STORAGE はデータテクスチャでエミュレート)                                                                                                                                                                                    | -   | T-3.3  |
| `src/rhi/webgl2/webgl2-texture.ts`     | WebGL2 版テクスチャ・サンプラ                                                                                                                                                                                                                   | -   | T-3.3  |
| `src/rhi/webgl2/webgl2-pipeline.ts`    | WebGL2 版プログラム生成・リフレクション                                                                                                                                                                                                         | -   | T-3.3  |
| `src/rhi/webgl2/webgl2-bind-group.ts`  | バインドグループ → UBO/テクスチャユニット割当                                                                                                                                                                                                   | -   | T-3.3  |
| `src/rhi/webgl2/webgl2-encoder.ts`     | コマンドを即時 GL 呼び出しに変換                                                                                                                                                                                                                | HOT | T-3.3  |
| `src/rhi/webgl2/webgl2-state-cache.ts` | GL 状態キャッシュ (冗長な状態変更を除去)                                                                                                                                                                                                        | HOT | T-3.3  |
| `src/rhi/webgl2/webgl2-convert.ts`     | RHI 定数 → GL 定数の変換表                                                                                                                                                                                                                      | -   | T-3.3  |

## 13. src/assets — アセット読込 (GPU 非依存。CPU データまでを担当)

| パス                                     | 責務                                                                                          | HOT | タスク |
| ---------------------------------------- | --------------------------------------------------------------------------------------------- | --- | ------ |
| `src/assets/index.ts`                    | 公開窓口                                                                                      | -   | T-4.2  |
| `src/assets/asset-types.ts`              | `AssetKey`, 各アセットの CPU 表現型 (`ImageAsset`, `AtlasAsset` 等)                           | -   | T-4.2  |
| `src/assets/asset-cache.ts`              | キー → アセットのキャッシュ。参照カウント                                                     | -   | T-4.2  |
| `src/assets/loader.ts`                   | `Loader`: キュー・並列フェッチ・進捗イベント                                                  | -   | T-4.2  |
| `src/assets/loaders/image-loader.ts`     | 画像 → `ImageBitmap`                                                                          | -   | T-4.2  |
| `src/assets/loaders/atlas-loader.ts`     | TexturePacker JSON (Hash/Array) のパース                                                      | -   | T-4.2  |
| `src/assets/loaders/json-loader.ts`      | 汎用 JSON                                                                                     | -   | T-5.1  |
| `src/assets/loaders/ktx2-loader.ts`      | KTX2 コンテナ解析 (BC/ETC2/ASTC 事前圧縮のみ。Basis トランスコードは非対応 = WASM 禁止のため) | -   | T-9.1  |
| `src/assets/loaders/audio-loader.ts`     | 音声 → `AudioBuffer`                                                                          | -   | T-9.6  |
| `src/assets/loaders/msdf-font-loader.ts` | MSDF フォント (msdf-atlas-gen JSON + 画像)                                                    | -   | T-9.2  |
| `src/assets/loaders/tiled-loader.ts`     | Tiled JSON マップ                                                                             | -   | T-9.3  |

## 14. src/input / src/audio

| パス                         | 責務                                                            | HOT | タスク |
| ---------------------------- | --------------------------------------------------------------- | --- | ------ |
| `src/input/index.ts`         | 公開窓口                                                        | -   | T-5.2  |
| `src/input/input-manager.ts` | DOM イベント購読とフレーム単位のスナップショット生成            | -   | T-5.2  |
| `src/input/pointer.ts`       | ポインタ状態 (マルチタッチ対応、SoA)                            | -   | T-5.2  |
| `src/input/keyboard.ts`      | キー状態 (`Uint8Array` で down/pressed/released)                | -   | T-5.2  |
| `src/input/gamepad.ts`       | ゲームパッド状態のポーリング                                    | -   | T-5.2  |
| `src/input/key-codes.ts`     | `KeyCode` 定数 (`KeyboardEvent.code` 準拠)                      | -   | T-5.2  |
| `src/audio/index.ts`         | 公開窓口                                                        | -   | T-9.6  |
| `src/audio/audio-manager.ts` | `AudioContext` 管理、マスター音量、ユーザー操作によるアンロック | -   | T-9.6  |
| `src/audio/sound.ts`         | 再生インスタンス (音量・パン・ループ・レート)                   | -   | T-9.6  |

## 15. src/shaders — シェーダソース (仕様: `docs/07-renderer.md`)

| パス                                                    | 責務                                                                           | HOT | タスク |
| ------------------------------------------------------- | ------------------------------------------------------------------------------ | --- | ------ |
| `src/shaders/index.ts`                                  | 公開窓口                                                                       | -   | T-4.1  |
| `src/shaders/raw.d.ts`                                  | `*.wgsl?raw` / `*.glsl?raw` のモジュール型宣言                                 | -   | T-4.1  |
| `src/shaders/preprocess.ts`                             | `#include "x"` / `#define` 展開の自前プリプロセッサ                            | -   | T-4.1  |
| `src/shaders/shader-library.ts`                         | 全シェーダを `?raw` で import し、名前 → `ShaderSource` を返す                 | -   | T-4.1  |
| `src/shaders/common/constants.wgsl`                     | 共通定数 (WORKGROUP_SIZE 等。TS の値と一致させる)                              | -   | T-4.1  |
| `src/shaders/common/constants.glsl`                     | 同 GLSL 版                                                                     | -   | T-4.1  |
| `src/shaders/common/camera.wgsl`                        | カメラ uniform 構造体                                                          | -   | T-4.1  |
| `src/shaders/common/camera.glsl`                        | 同 GLSL 版                                                                     | -   | T-4.1  |
| `src/shaders/common/sprite-instance.wgsl`               | スプライトインスタンス構造体とデコード関数                                     | -   | T-4.3  |
| `src/shaders/common/sprite-instance.glsl`               | 同 GLSL 版 (データテクスチャから読む)                                          | -   | T-4.3  |
| `src/shaders/common/frame.wgsl`                         | フレームテーブル構造体                                                         | -   | T-4.3  |
| `src/shaders/common/frame.glsl`                         | 同 GLSL 版                                                                     | -   | T-4.3  |
| `src/shaders/common/storage-emulation.glsl`             | WebGL2 データテクスチャ読取ヘルパ (`pluto_fetch(tex, texelIndex)`。docs/06 §7) | -   | T-4.3  |
| `src/shaders/sprite/sprite.wgsl`                        | スプライト描画 (vertex pulling)                                                | -   | T-4.4  |
| `src/shaders/sprite/sprite.vert.glsl`                   | 同 GLSL 頂点                                                                   | -   | T-4.4  |
| `src/shaders/sprite/sprite.frag.glsl`                   | 同 GLSL フラグメント                                                           | -   | T-4.4  |
| `src/shaders/scan/prefix-sum.wgsl`                      | 排他的プレフィックスサム (decoupled look-back なし、3 パス方式)                | -   | T-4.5  |
| `src/shaders/sort/radix-sort.wgsl`                      | 32bit キー/値 LSD 基数ソート (4bit × 8 パス)                                   | -   | T-4.5  |
| `src/shaders/cull/reset-args.wgsl`                      | indirect 引数のリセット                                                        | -   | T-4.6  |
| `src/shaders/cull/sprite-cull.wgsl`                     | スプライトの視錐台カリングと opaque/transparent への振り分け                   | -   | T-4.6  |
| `src/shaders/cull/sort-keys.wgsl`                       | 半透明スプライトのソートキー生成                                               | -   | T-4.6  |
| `src/shaders/spatial/spatial-hash.wgsl`                 | GPU 空間ハッシュ (セル計算・カウント・スキャッタ)                              | -   | T-6.1  |
| `src/shaders/particles/particle-emit.wgsl`              | パーティクル生成                                                               | -   | T-6.2  |
| `src/shaders/particles/particle-update.wgsl`            | パーティクル更新・スプライトバッファ書込                                       | -   | T-6.2  |
| `src/shaders/particles/particle-update.gpgpu.frag.glsl` | 同 WebGL2 GPGPU 版                                                             | -   | T-6.2  |
| `src/shaders/crowd/flow-field.wgsl`                     | Eikonal 方程式 (Fast Iterative Method) によるフローフィールド計算              | -   | T-6.3  |
| `src/shaders/crowd/flow-field.gpgpu.frag.glsl`          | 同 WebGL2 GPGPU 版 (ヤコビ反復)                                                | -   | T-6.3  |
| `src/shaders/crowd/crowd-steer.wgsl`                    | フローフィールドのサンプリングと速度更新                                       | -   | T-6.3  |
| `src/shaders/crowd/crowd-steer.gpgpu.frag.glsl`         | 同 WebGL2 GPGPU 版                                                             | -   | T-6.3  |
| `src/shaders/crowd/crowd-pbd.wgsl`                      | 位置ベース群衆の衝突回避制約 (ヤコビ)                                          | -   | T-6.4  |
| `src/shaders/fluid/stable-fluids.wgsl`                  | 格子流体 (移流・発散・圧力ヤコビ・投影)                                        | -   | T-7.1  |
| `src/shaders/fluid/stable-fluids.gpgpu.frag.glsl`       | 同 WebGL2 GPGPU 版                                                             | -   | T-7.1  |
| `src/shaders/fluid/pbf.wgsl`                            | Position Based Fluids                                                          | -   | T-7.2  |
| `src/shaders/fluid/mls-mpm.wgsl`                        | MLS-MPM (P2G / グリッド更新 / G2P)                                             | -   | T-7.3  |
| `src/shaders/fluid/fluid-render.wgsl`                   | 粒子流体の深度スプラット・平滑化・合成                                         | -   | T-7.4  |
| `src/shaders/fluid/fluid-render.vert.glsl`              | 同 GLSL 頂点 (格子流体の可視化用)                                              | -   | T-7.4  |
| `src/shaders/fluid/fluid-render.frag.glsl`              | 同 GLSL フラグメント                                                           | -   | T-7.4  |
| `src/shaders/text/msdf.wgsl`                            | MSDF テキスト描画                                                              | -   | T-9.2  |
| `src/shaders/text/msdf.vert.glsl`                       | 同 GLSL 頂点                                                                   | -   | T-9.2  |
| `src/shaders/text/msdf.frag.glsl`                       | 同 GLSL フラグメント                                                           | -   | T-9.2  |
| `src/shaders/tilemap/tilemap.wgsl`                      | タイルマップチャンク描画                                                       | -   | T-9.3  |
| `src/shaders/tilemap/tilemap.vert.glsl`                 | 同 GLSL 頂点                                                                   | -   | T-9.3  |
| `src/shaders/tilemap/tilemap.frag.glsl`                 | 同 GLSL フラグメント                                                           | -   | T-9.3  |
| `src/shaders/graphics/shape.wgsl`                       | ベクタ図形描画                                                                 | -   | T-9.4  |
| `src/shaders/graphics/shape.vert.glsl`                  | 同 GLSL 頂点                                                                   | -   | T-9.4  |
| `src/shaders/graphics/shape.frag.glsl`                  | 同 GLSL フラグメント                                                           | -   | T-9.4  |
| `src/shaders/lighting/light-simple.wgsl`                | 点光源の加算合成 (両バックエンド共通機能)                                      | -   | T-9.5  |
| `src/shaders/lighting/light-simple.frag.glsl`           | 同 GLSL 版                                                                     | -   | T-9.5  |
| `src/shaders/lighting/jfa.wgsl`                         | Jump Flooding による SDF 生成                                                  | -   | T-9.5  |
| `src/shaders/lighting/radiance-cascades.wgsl`           | Radiance Cascades 2D GI (WebGPU のみ)                                          | -   | T-9.5  |
| `src/shaders/post/fullscreen.wgsl`                      | フルスクリーン三角形 + コピー                                                  | -   | T-4.7  |
| `src/shaders/post/fullscreen.vert.glsl`                 | 同 GLSL 頂点                                                                   | -   | T-4.7  |
| `src/shaders/post/blit.frag.glsl`                       | GLSL コピー                                                                    | -   | T-4.7  |
| `src/shaders/post/solid-color.wgsl`                     | ビューポート全面の単色合成 (カメラの fade / flash)                             | -   | T-5.5  |
| `src/shaders/post/solid-color.frag.glsl`                | 同 GLSL 版 (頂点は `fullscreen.vert.glsl` を共用)                              | -   | T-5.5  |
| `src/shaders/post/bloom.wgsl`                           | ブルーム (ダウン/アップサンプル)                                               | -   | T-9.7  |
| `src/shaders/post/bloom.frag.glsl`                      | 同 GLSL 版                                                                     | -   | T-9.7  |
| `src/shaders/post/tonemap.wgsl`                         | トーンマップ + カラーマトリクス                                                | -   | T-9.7  |
| `src/shaders/post/tonemap.frag.glsl`                    | 同 GLSL 版                                                                     | -   | T-9.7  |

## 16. src/compute — GPU 汎用プリミティブ

| パス                              | 責務                                                       | HOT | タスク |
| --------------------------------- | ---------------------------------------------------------- | --- | ------ |
| `src/compute/index.ts`            | 公開窓口                                                   | -   | T-4.5  |
| `src/compute/gpu-prefix-sum.ts`   | プレフィックスサムのパイプライン管理とディスパッチ         | HOT | T-4.5  |
| `src/compute/gpu-radix-sort.ts`   | 基数ソートのパイプライン管理とディスパッチ (indirect 対応) | HOT | T-4.5  |
| `src/compute/gpgpu-pass.ts`       | WebGL2 用 ping-pong フルスクリーン GPGPU パスのヘルパ      | HOT | T-6.2  |
| `src/compute/gpu-spatial-hash.ts` | GPU 空間ハッシュ (カウンティングソート方式)                | HOT | T-6.1  |
| `src/compute/cpu-spatial-hash.ts` | CPU 空間ハッシュ (物理・クエリ用)                          | HOT | T-6.1  |

## 17. src/render — レンダラ (仕様: `docs/07-renderer.md`)

| パス                                            | 責務                                                                     | HOT | タスク |
| ----------------------------------------------- | ------------------------------------------------------------------------ | --- | ------ |
| `src/render/index.ts`                           | 公開窓口                                                                 | -   | T-4.3  |
| `src/render/render-constants.ts`                | `WORKGROUP_SIZE`, `MAX_SPRITES`, `MAX_LAYERS` 等の定数 (シェーダと一致)  | -   | T-4.3  |
| `src/render/texture/texture-array-manager.ts`   | 2D テクスチャ配列の層割当とアップロード                                  | -   | T-4.2  |
| `src/render/texture/frame-table.ts`             | フレーム (UV/サイズ/アンカー/層) の CPU 表と GPU バッファ                | -   | T-4.2  |
| `src/render/texture/atlas-packer.ts`            | 個別画像の実行時パッキング (shelf アルゴリズム)                          | -   | T-4.2  |
| `src/render/sprite/sprite-instance-layout.ts`   | **スプライト 32 バイトレイアウトの SSOT** (オフセット定数とパック関数)   | HOT | T-4.3  |
| `src/render/sprite/sprite-components.ts`        | `Sprite`, `SpriteSlot` コンポーネント定義 (`docs/07-renderer.md` §11)    | -   | T-4.3  |
| `src/render/sprite/sprite-buffer.ts`            | GPU スプライトバッファ・スロット割当・dirty range 転送                   | HOT | T-4.3  |
| `src/render/sprite/sprite-pack-kernel.ts`       | CPU Tier の SoA → 32 バイト AoS ステージングへのパックカーネル           | HOT | T-4.3  |
| `src/render/sprite/sprite-pack-system.ts`       | 上記カーネルを dirty チャンクに対してスケジュール                        | -   | T-4.3  |
| `src/render/sprite/sprite-path-cpu-assisted.ts` | compute 非対応環境向け描画パス (CPU チャンクカリング + インスタンス描画) | HOT | T-4.4  |
| `src/render/sprite/sprite-cpu-cull-kernel.ts`   | CPU チャンクカリングカーネル                                             | HOT | T-4.4  |
| `src/render/sprite/sprite-path-gpu-driven.ts`   | compute 対応環境向け描画パス (GPU カリング + ソート + indirect)          | HOT | T-4.6  |
| `src/render/sprite/sprite-renderer.ts`          | 能力に応じてパスを選択し、スプライト描画全体を統括                       | -   | T-4.4  |
| `src/render/camera/camera-store.ts`             | カメラの SoA ストア (位置・ズーム・回転・ビューポート)                   | -   | T-4.7  |
| `src/render/camera/camera-uniforms.ts`          | カメラ → GPU uniform 変換                                                | HOT | T-4.7  |
| `src/render/camera/camera-fx-pass.ts`           | カメラごとの fade / flash 単色合成パス (`camera:fx`)                     | -   | T-5.5  |
| `src/render/graph/render-graph.ts`              | パス登録・実行順序・一時リソースの寿命管理                               | -   | T-4.7  |
| `src/render/graph/render-pass-node.ts`          | パスノード型                                                             | -   | T-4.7  |
| `src/render/graph/transient-pool.ts`            | 一時テクスチャのプール                                                   | -   | T-4.7  |
| `src/render/renderer.ts`                        | フレーム全体の描画オーケストレータ                                       | -   | T-4.7  |
| `src/render/tilemap/tilemap-data.ts`            | タイルマップの SoA データとチャンク分割                                  | -   | T-9.3  |
| `src/render/tilemap/tilemap-renderer.ts`        | タイルマップ描画                                                         | HOT | T-9.3  |
| `src/render/text/msdf-font.ts`                  | フォントメトリクス                                                       | -   | T-9.2  |
| `src/render/text/text-layout.ts`                | 文字列 → グリフ配置 (改行・揃え)                                         | -   | T-9.2  |
| `src/render/text/text-renderer.ts`              | テキスト描画                                                             | HOT | T-9.2  |
| `src/render/graphics/shape-builder.ts`          | 矩形・円・多角形・線のテッセレーション                                   | -   | T-9.4  |
| `src/render/graphics/graphics-renderer.ts`      | 図形描画                                                                 | HOT | T-9.4  |
| `src/render/lighting/light-store.ts`            | 光源の SoA ストア                                                        | -   | T-9.5  |
| `src/render/lighting/lighting-simple.ts`        | 点光源合成パス                                                           | HOT | T-9.5  |
| `src/render/lighting/radiance-cascades.ts`      | Radiance Cascades パス (WebGPU のみ)                                     | HOT | T-9.5  |
| `src/render/post/post-chain.ts`                 | ポストエフェクトの連結                                                   | -   | T-9.7  |
| `src/render/post/bloom.ts`                      | ブルーム                                                                 | HOT | T-9.7  |
| `src/render/post/tonemap.ts`                    | トーンマップ・カラーマトリクス                                           | HOT | T-9.7  |

## 18. src/sim — GPU Tier シミュレーション (仕様: `docs/08-simulation.md`)

| パス                                    | 責務                                                                  | HOT | タスク |
| --------------------------------------- | --------------------------------------------------------------------- | --- | ------ |
| `src/sim/index.ts`                      | 公開窓口                                                              | -   | T-6.2  |
| `src/sim/gpu-group.ts`                  | GPU Tier グループ (スプライトスロット範囲の所有・spawn/kill コマンド) | -   | T-6.2  |
| `src/sim/particles/particle-config.ts`  | エミッタ設定型とデフォルト値                                          | -   | T-6.2  |
| `src/sim/particles/particle-buffers.ts` | パーティクル SoA GPU バッファ                                         | -   | T-6.2  |
| `src/sim/particles/particle-system.ts`  | パーティクル更新のディスパッチ                                        | HOT | T-6.2  |
| `src/sim/crowd/crowd-config.ts`         | 群衆設定型とデフォルト値                                              | -   | T-6.3  |
| `src/sim/crowd/crowd-buffers.ts`        | エージェント SoA GPU バッファ                                         | -   | T-6.3  |
| `src/sim/crowd/flow-field.ts`           | フローフィールド (コストグリッド・ゴール・再計算)                     | HOT | T-6.3  |
| `src/sim/crowd/crowd-pbd.ts`            | PBD 衝突回避パス                                                      | HOT | T-6.4  |
| `src/sim/crowd/crowd-system.ts`         | 群衆更新の統括                                                        | HOT | T-6.3  |
| `src/sim/fluid/fluid-config.ts`         | 流体設定型とデフォルト値                                              | -   | T-7.1  |
| `src/sim/fluid/stable-fluids.ts`        | 格子流体                                                              | HOT | T-7.1  |
| `src/sim/fluid/pbf.ts`                  | PBF                                                                   | HOT | T-7.2  |
| `src/sim/fluid/mls-mpm.ts`              | MLS-MPM                                                               | HOT | T-7.3  |
| `src/sim/fluid/fluid-renderer.ts`       | 流体の描画                                                            | HOT | T-7.4  |
| `src/sim/fluid/fluid-system.ts`         | 流体の統括                                                            | -   | T-7.1  |

## 19. src/physics — 物理 (仕様: `docs/08-simulation.md` §物理)

| パス                                      | 責務                                           | HOT | タスク |
| ----------------------------------------- | ---------------------------------------------- | --- | ------ |
| `src/physics/index.ts`                    | 公開窓口                                       | -   | T-8.1  |
| `src/physics/arcade/arcade-components.ts` | `ArcadeBody` (速度・加速度・AABB/円・反発)     | -   | T-8.1  |
| `src/physics/arcade/arcade-kernels.ts`    | 積分・ワールド境界カーネル                     | HOT | T-8.1  |
| `src/physics/arcade/arcade-collide.ts`    | 空間ハッシュによる衝突検出・分離・コールバック | HOT | T-8.1  |
| `src/physics/arcade/arcade-world.ts`      | アーケード物理の統括                           | -   | T-8.1  |
| `src/physics/rigid/rigid-components.ts`   | `RigidBody`, `Collider`                        | -   | T-8.2  |
| `src/physics/rigid/shapes.ts`             | 円・凸多角形・カプセル                         | HOT | T-8.2  |
| `src/physics/rigid/narrowphase.ts`        | SAT / GJK 接触生成                             | HOT | T-8.2  |
| `src/physics/rigid/xpbd-solver.ts`        | XPBD ソルバ (サブステップ)                     | HOT | T-8.2  |
| `src/physics/rigid/rigid-world.ts`        | 剛体物理の統括                                 | -   | T-8.2  |

## 20. src/animation

| パス                                      | 責務                                                                | HOT | タスク |
| ----------------------------------------- | ------------------------------------------------------------------- | --- | ------ |
| `src/animation/index.ts`                  | 公開窓口                                                            | -   | T-5.3  |
| `src/animation/easing.ts`                 | イージング関数 (Penner 系 30 種)                                    | HOT | T-5.3  |
| `src/animation/tween-store.ts`            | トゥイーンの SoA ストア (対象フィールドトークン・開始/終了値・時間) | HOT | T-5.3  |
| `src/animation/tween-system.ts`           | トゥイーン更新                                                      | HOT | T-5.3  |
| `src/animation/timeline.ts`               | トゥイーンの直列/並列の組み合わせ                                   | -   | T-5.3  |
| `src/animation/frame-animation.ts`        | フレームアニメーション定義 (フレーム列・fps・ループ)                | -   | T-5.4  |
| `src/animation/frame-animation-system.ts` | フレームアニメーションの更新 (Sprite.frame を書き換え)              | HOT | T-5.4  |

## 21. src/devtools

| パス                              | 責務                                                                            | HOT | タスク |
| --------------------------------- | ------------------------------------------------------------------------------- | --- | ------ |
| `src/devtools/index.ts`           | 公開窓口                                                                        | -   | T-10.1 |
| `src/devtools/stats-collector.ts` | フレーム時間・エンティティ数・ドローコール数の集計 (`performance.now()` 使用可) | -   | T-10.1 |
| `src/devtools/gpu-timer.ts`       | `timestamp-query` によるパス別 GPU 時間                                         | -   | T-10.1 |
| `src/devtools/stats-overlay.ts`   | DOM オーバーレイ表示                                                            | -   | T-10.1 |

## 22. src/scene — 高レベル API (仕様: `docs/09-api-design.md`)

| パス                                    | 責務                                                                 | HOT | タスク |
| --------------------------------------- | -------------------------------------------------------------------- | --- | ------ |
| `src/scene/index.ts`                    | 公開窓口                                                             | -   | T-5.1  |
| `src/scene/game-config.ts`              | `GameConfig` 型とデフォルト値・検証                                  | -   | T-5.1  |
| `src/scene/game.ts`                     | `Game`: 初期化・メインループ (`requestAnimationFrame`)・フェーズ実行 | -   | T-5.1  |
| `src/scene/scene.ts`                    | `Scene` 基底クラス (`preload/create/update` ライフサイクル)          | -   | T-5.1  |
| `src/scene/scene-manager.ts`            | シーンの開始/停止/一時停止/重ね合わせ                                | -   | T-5.1  |
| `src/scene/game-object-factory.ts`      | `scene.add.*` の実装                                                 | -   | T-5.1  |
| `src/scene/camera-manager.ts`           | `scene.cameras` の実装                                               | -   | T-5.1  |
| `src/scene/timer-manager.ts`            | `scene.time` (遅延呼び出し・繰り返し、フレーム時間ベース)            | -   | T-5.5  |
| `src/scene/tween-manager.ts`            | `scene.tweens` の実装                                                | -   | T-5.3  |
| `src/scene/anims-manager.ts`            | `scene.anims` (フレームアニメ定義の登録・`frames()` ヘルパ) の実装   | -   | T-5.4  |
| `src/scene/handles/sprite-handle.ts`    | `SpriteHandle` (エンティティ ID を包む薄いハンドル)                  | -   | T-5.1  |
| `src/scene/handles/sprite-batch.ts`     | `SpriteBatch` (大量スプライトの一括操作。個別オブジェクトを作らない) | -   | T-5.1  |
| `src/scene/handles/group-handle.ts`     | `GroupHandle` (エンティティ集合の一括操作)                           | -   | T-5.6  |
| `src/scene/handles/container-handle.ts` | `ContainerHandle` (親子階層)                                         | -   | T-5.6  |
| `src/scene/handles/particles-handle.ts` | `ParticlesHandle`                                                    | -   | T-6.2  |
| `src/scene/handles/crowd-handle.ts`     | `CrowdHandle`                                                        | -   | T-6.3  |
| `src/scene/handles/fluid-handle.ts`     | `FluidHandle`                                                        | -   | T-7.1  |
| `src/scene/handles/body-handle.ts`      | 物理ボディ操作                                                       | -   | T-8.1  |
| `src/scene/handles/text-handle.ts`      | `TextHandle`                                                         | -   | T-9.2  |
| `src/scene/handles/tilemap-handle.ts`   | `TilemapHandle`                                                      | -   | T-9.3  |
| `src/scene/handles/graphics-handle.ts`  | `GraphicsHandle`                                                     | -   | T-9.4  |
| `src/scene/handles/light-handle.ts`     | `LightHandle`                                                        | -   | T-9.5  |
| `src/scene/physics-manager.ts`          | `scene.physics` の実装                                               | -   | T-8.1  |
| `src/scene/sound-manager.ts`            | `scene.sound` の実装                                                 | -   | T-9.6  |
| `src/scene/lights-manager.ts`           | `scene.lights` (ライティングの有効化・環境光・GI モード) の実装      | -   | T-9.5  |
| `src/scene/fx-manager.ts`               | `scene.fx` (ポストエフェクト) の実装                                 | -   | T-9.7  |

---

## 23. tests/ (パターンで許可)

| パターン                                     | 責務                                                                                  |
| -------------------------------------------- | ------------------------------------------------------------------------------------- |
| `tests/unit/<src と同じ相対パス>.test.ts`    | Node 上のユニットテスト。対応する `src/` ファイルが存在しなければならない             |
| `tests/unit/_helpers/*.ts`                   | ユニットテスト共通ヘルパ                                                              |
| `tests/browser/<モジュール名>/*.spec.ts`     | Playwright ブラウザテスト (モジュール名は `src/` のモジュール名、または `smoke`)      |
| `tests/browser/fixtures/*`                   | ブラウザテスト用 HTML/TS ハーネス                                                     |
| `tests/browser/fixtures/assets/<name>/*.png` | ブラウザテスト・ゴールデン画像生成の入力スプライト (64×64、`name` はアニメーション名) |
| `tests/browser/helpers/*.ts`                 | ブラウザテスト共通ヘルパ (ゴールデン画像比較など)                                     |
| `tests/browser/golden/<backend>/*.png`       | ゴールデン画像 (`webgpu` / `webgl2`)                                                  |

## 24. bench/ と examples/ (パターンで許可)

| パターン                                                             | 責務                                                              |
| -------------------------------------------------------------------- | ----------------------------------------------------------------- |
| `bench/runner.html` / `bench/runner.ts`                              | ベンチマークページ (URL クエリでシーン・個数・バックエンドを指定) |
| `bench/bench-types.ts`                                               | 結果 JSON の型                                                    |
| `bench/scenes/*.ts`                                                  | ベンチシーン (1 ファイル 1 シーン)                                |
| `bench/baseline.json`                                                | ベースライン結果 (`pluto-perf` スキルの手順でのみ更新)            |
| `bench/results/`                                                     | 実行結果 (Git 管理外)                                             |
| `examples/<kebab-name>/index.html` / `examples/<kebab-name>/main.ts` | サンプル (1 フォルダ 1 サンプル)                                  |
| `examples/<kebab-name>/assets/*`                                     | そのサンプル専用の画像・JSON・音声                                |
| `examples/shared-assets/*`                                           | 複数サンプルで共有するアセット                                    |
