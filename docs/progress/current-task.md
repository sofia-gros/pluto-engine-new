# 現在のタスク: T-4.1 シェーダ基盤

## 1. 目的

`docs/07-renderer.md` §2、`docs/02-directory-structure.md` §15、および `.agents/rules/04-shaders.md` (R4) に従い、Pluto Engine のシェーダ基盤（自前プリプロセッサ、シェーダライブラリ、共通定数・カメラ定数の WGSL/GLSL コード、および Vite 型定義）を実装する。

## 2. 作成・編集するファイル (`docs/02-directory-structure.md` に完全準拠)

| ファイル                                    | 責務                                                                  |
| ------------------------------------------- | --------------------------------------------------------------------- |
| `src/shaders/raw.d.ts`                      | `*.wgsl?raw` / `*.glsl?raw` のモジュール型宣言 (新規)                 |
| `src/shaders/preprocess.ts`                 | `#include "x"` / `#define` 展開の自前プリプロセッサ (新規)            |
| `src/shaders/shader-library.ts`             | 全シェーダを `?raw` で import し、名前 → `ShaderSource` を返す (新規) |
| `src/shaders/common/constants.wgsl`         | 共通定数 (`WORKGROUP_SIZE` 等。TS の値と一致させる) (新規)            |
| `src/shaders/common/constants.glsl`         | 同 GLSL 版 (新規)                                                     |
| `src/shaders/common/camera.wgsl`            | カメラ uniform 構造体 (新規)                                          |
| `src/shaders/common/camera.glsl`            | 同 GLSL 版 (新規)                                                     |
| `src/shaders/index.ts`                      | 公開窓口 (`preprocess`, `ShaderLibrary`, `ShaderSource` 等) (新規)    |
| `tests/unit/shaders/preprocess.test.ts`     | プリプロセッサの単体テスト (新規)                                     |
| `tests/unit/shaders/shader-library.test.ts` | シェーダライブラリと定数整合性の単体テスト (新規)                     |
| `tests/unit/shaders/index.test.ts`          | 公開窓口の単体テスト (新規)                                           |
| `docs/progress/PROGRESS.md`                 | T-4.1 を IN_PROGRESS に更新                                           |

## 3. 実装ステップ

1. **Step 1: 計画作成と PROGRESS 更新 (`pluto-task-start`)**
   - 本ファイルを `docs/progress/current-task.md` に保存。
   - `docs/progress/PROGRESS.md` を更新。
2. **Step 2: 型定義と共通シェーダファイルの実装 (`pluto-shader` / `pluto-implement`)**
   - `src/shaders/raw.d.ts` を作成。
   - `src/shaders/common/constants.wgsl` / `constants.glsl` を実装 (`docs/07` §2 の全 18 定数)。
   - `src/shaders/common/camera.wgsl` / `camera.glsl` を実装 (`docs/07` §6 の 64 バイト std140 構造体)。
3. **Step 3: プリプロセッサの実装とテスト (`pluto-implement`)**
   - `src/shaders/preprocess.ts` を実装。
     - `#include "path"` の解決と再帰展開
     - 循環参照検出 (`PlutoError(InvalidArgument)`)
     - 重複インクルード抑止 (include once)
     - `#define` / 条件分岐 (`#ifdef`, `#ifndef`, `#if`, `#else`, `#endif`) の処理
   - `tests/unit/shaders/preprocess.test.ts` を作成し TDD で検証。
4. **Step 4: シェーダライブラリと公開窓口の実装 (`pluto-implement`)**
   - `src/shaders/shader-library.ts` を実装。
   - `src/shaders/index.ts` を実装。
   - `tests/unit/shaders/shader-library.test.ts`, `tests/unit/shaders/index.test.ts` を作成。
5. **Step 5: テスト・静的解析の実行 (`pluto-test`)**
   - `pnpm verify` を実行し、エラー 0・警告 0 を確認。
6. **Step 6: レビューと完了処理 (`pluto-review` / `pluto-task-finish`)**
   - レビュー記録 `docs/progress/reviews/T-4.1.md` を作成。
   - `docs/progress/PROGRESS.md` を DONE に更新。
   - 変更をコミットし、リモートへプッシュ。

## 4. 受け入れ条件 (ロードマップより)

- `shaders/index.ts`, `raw.d.ts`, `preprocess.ts`, `shader-library.ts`, `common/constants.*`, `common/camera.*` が作成されている。
- `docs/07-renderer.md` §2 の定数と `constants.wgsl` / `constants.glsl` が完全に一致している。
- `common/camera.*` が `docs/07-renderer.md` §6 のカメラ uniform 構造体と一致している。
- プリプロセッサが `#include` および `#define` を正しく処理し、循環インクルードを検出できる。
- `pnpm verify` がエラー 0・警告 0 で成功する。
