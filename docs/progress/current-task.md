# T-2.4 Transform (変換・階層)

## 目的

`src/transform/` を新規作成し、ローカル `Transform` から親を辿ってワールド行列 `WorldTransform` を計算する変換カーネルと、それを `Phase.PostUpdate` で深さ順にスケジュールするシステムを作る。`src/worker-main.ts` に変換カーネルを登録し、`src/lowlevel.ts` から re-export する。

**階層の親参照はメインスレッド走査とする (ユーザー承認 2026-10-06)。** カーネルには自チャンクの `ChunkView` しか渡らない (`docs/05` §2) ので、親が別のアーキタイプにあると `view.column()` では引けない。実際 `ContainerHandle` は `Transform`/`Parent`/`HierarchyDepth`、`SpriteHandle` は `Transform`/`WorldTransform`/`Sprite`/`SpriteSlot` なので親子でアーキタイプが異なる。そのため:

- **深さ 0 (親なし)**: カーネルで並列計算する (`defineKernel` を使う。並列化が必要な 100 万スプライトはこのケース)
- **深さ 1〜8**: `transform-system.ts` がメインスレッドで `world.get()` を辿って合成する

`KernelBufferSlot` の追加 (`docs/05` §3.2「追加はタスクの指示がある場合のみ」) は行わない。循環参照の検出も T-5.6 (`ContainerHandle`) の責務なので行わない。

## 参照ドキュメント

- `docs/12-roadmap.md` Phase 2 (T-2.4 の行と受け入れ条件)
- `docs/02-directory-structure.md` §11 (ファイル一覧・責務)
- `docs/03-coding-standards.md` §1.2 (HOT ファイルのテンプレート)
- `docs/04-memory-and-ecs.md` §3.1・§5・§9 (コンポーネント定義・ChunkView・World)
- `docs/05-jobs-and-builds.md` §2・§3.3 (カーネル契約・Worker エントリ)
- `docs/01-architecture.md` §3〜4 (フェーズ。transform は `Phase.PostUpdate`)
- `docs/07-renderer.md` §11 (入力カラム `WorldTransform.{a,b,c,d,tx,ty}`)
- `docs/09-api-design.md` §container (最大深さ 8・循環は `PlutoError(InvalidArgument)`)

## 作成・編集するファイル (02 §11 と完全一致)

| パス                                    | 責務                                                         |
| --------------------------------------- | ------------------------------------------------------------ |
| `src/transform/index.ts`                | 公開窓口 (re-export のみ)                                    |
| `src/transform/transform-components.ts` | `Transform` / `WorldTransform` / `Parent` / `HierarchyDepth` |
| `src/transform/transform-kernels.ts`    | ローカル→ワールド行列計算カーネル (深さ順、HOT)              |
| `src/transform/transform-system.ts`     | カーネルを深さ順にスケジュールするシステム                   |
| `src/worker-main.ts`                    | 変換カーネルのモジュールを import に追加 (変更)              |
| `src/lowlevel.ts`                       | transform を re-export (変更)                                |
| `tests/unit/transform/*.test.ts`        | ユニットテスト (新規)                                        |

## 実装ステップ

1. **コンポーネント定義** (`transform-components.ts`)
   - `Transform`: `x, y, rotation, scaleX, scaleY` (F32)。`docs/04` §3.1 の例どおり
   - `WorldTransform`: `a, b, c, d, tx, ty` (F32)。`docs/07` §11 が入力に使う 6 フィールド
   - `Parent`: `parent: U32` (Entity ハンドル)。`NULL_ENTITY` は親なし
   - `HierarchyDepth`: `depth: U32`。`MAX_HIERARCHY_DEPTH = 8`
2. **カーネル** (`transform-kernels.ts`, HOT)
   - 深さ 0 (親なし) のワールド行列 = ローカル行列 を計算するカーネル
   - `view.column()` をループ前にローカルへキャッシュする (R2 §5)
   - `WorldTransform` の 6 フィールドをすべて書き、`view.markDirty()` で dirty を立てる
3. **システム** (`transform-system.ts`)
   - `Phase.PostUpdate` のシステム 1 個。深さ 0 はカーネルに委譲する
   - 深さ 1〜8 はメインスレッドで `world.get()` を辿って合成する
   - クエリは `{ all: [Transform, WorldTransform, HierarchyDepth] }`
4. **公開** (`index.ts` / `lowlevel.ts` / `worker-main.ts`)
   - `lowlevel.ts` に `Transform` / `WorldTransform` / `Parent` / `HierarchyDepth` / `MAX_HIERARCHY_DEPTH` / カーネル / システムを re-export
   - `worker-main.ts` に `import './transform'` を追加し、Worker 側でもカーネル表が一致するようにする
5. **テスト** (`tests/unit/transform/`)
   - コンポーネント定義のフィールド名と型
   - 根 (親なし) のワールド行列がローカルと一致
   - 参照実装 (`affine2dMultiply` の逐次乗算) と一致
   - 回転・スケールの合成

## 完了条件 (受け入れ条件のコピー)

1. 変換カーネルを `src/worker-main.ts` に登録する。`src/lowlevel.ts` に transform を re-export
2. 深さ 8 の階層でワールド行列が参照実装 (`affine2d` の逐次乗算) と 1e-5 以内で一致

## 決定事項 (2026-10-06 ユーザー承認済み)

- **階層の親参照はメインスレッド走査。** 深さ 0 のみカーネル、深さ 1〜8 は `world.get()` で合成する。理由は上「目的」を参照
- **循環参照の検出はしない。** 循環を作る API が T-5.6 (`ContainerHandle`) の責務なので、そこで検出する
- `WorldTransform` のフィールド名は `a, b, c, d, tx, ty` に固定する (`docs/07` §11 が入力カラムとして要求している)
