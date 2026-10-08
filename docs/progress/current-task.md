# 現在のタスク: T-4.5 GPU プリミティブ

## 1. 目的

`docs/07-renderer.md` §8・§10、`docs/02-directory-structure.md` §16・§17、および `docs/10-testing-strategy.md` §4 に基づき、GPU 汎用プリミティブである排他的プレフィックスサム (`src/shaders/scan/prefix-sum.wgsl`, `src/compute/gpu-prefix-sum.ts`) および LSD 基数ソート (`src/shaders/sort/radix-sort.wgsl`, `src/compute/gpu-radix-sort.ts`) を実装する。また、CPU 参照実装との結果が完全一致するパリティテスト (ランダム入力 10 種、サイズ 1〜2^20) を作成・検証する。

## 2. 作成・編集するファイル (`docs/02-directory-structure.md` に完全準拠)

| ファイル                                    | 責務                                                                            | HOT |
| ------------------------------------------- | ------------------------------------------------------------------------------- | --- |
| `src/shaders/scan/prefix-sum.wgsl`          | 排他的プレフィックスサム (3 パス方式: ブロック内 scan → ブロック和 scan → 加算) | -   |
| `src/shaders/sort/radix-sort.wgsl`          | 32bit キー/値 LSD 基数ソート (4bit × 8 パス, indirect 対応)                     | -   |
| `src/shaders/shader-library.ts`             | シェーダライブラリへの登録 (`scan/prefix-sum`, `sort/radix-sort`)               | -   |
| `src/compute/gpu-prefix-sum.ts`             | プレフィックスサムのパイプライン管理とディスパッチ                              | HOT |
| `src/compute/gpu-radix-sort.ts`             | 基数ソートのパイプライン管理とディスパッチ (indirect 対応)                      | HOT |
| `src/compute/index.ts`                      | compute モジュールの公開窓口                                                    | -   |
| `src/lowlevel.ts`                           | 低レベル API への `GpuPrefixSum`, `GpuRadixSort` 追加                           | -   |
| `tests/unit/compute/gpu-prefix-sum.test.ts` | プレフィックスサムの単体テスト (初期化・引数検証)                               | -   |
| `tests/unit/compute/gpu-radix-sort.test.ts` | 基数ソートの単体テスト (初期化・引数検証)                                       | -   |
| `tests/browser/compute/parity.spec.ts`      | GPU vs CPU パリティテスト (1〜2^20 要素、完全一致)                              | -   |
| `docs/progress/PROGRESS.md`                 | T-4.5 進捗更新                                                                  | -   |

## 3. 実装ステップ

1. **Step 1: 計画作成と PROGRESS 更新 (`pluto-task-start`)**
   - 本ファイルを保存し、`PROGRESS.md` の T-4.5 を `IN_PROGRESS` に更新。
2. **Step 2: プレフィックスサムシェーダの実装 (`pluto-shader` / `pluto-implement`)**
   - `src/shaders/scan/prefix-sum.wgsl`
   - 3 パス方式 (各スレッド 4 要素、ワークグループ 256 スレッド = 1 ブロック 1024 要素):
     - エントリポイント 1: `block_scan` (ブロック内排他的スキャン + ブロック和出力)
     - エントリポイント 2: `scan_block_sums` (最大 1024 個のブロック和の排他的スキャン)
     - エントリポイント 3: `add_block_sums` (各ブロック要素へブロック和を加算)
3. **Step 3: 基数ソートシェーダの実装 (`pluto-shader` / `pluto-implement`)**
   - `src/shaders/sort/radix-sort.wgsl`
   - 4bit × 8 パス LSD 基数ソート:
     - エントリポイント 1: `histogram` (各ブロックでの 16 バケット度数カウント)
     - エントリポイント 2: `prefix_sum_histogram` (バケット・ブロックオフセットの排他的スキャン)
     - エントリポイント 3: `scatter` (ping-pong バッファへのキー・値の安定再配置)
     - indirect dispatch 対応 (引数バッファからワークグループ数読取)
4. **Step 4: シェーダライブラリへの登録 (`pluto-shader`)**
   - `src/shaders/shader-library.ts`
5. **Step 5: GpuPrefixSum クラスの実装 (`pluto-implement` / `pluto-perf`)**
   - `src/compute/gpu-prefix-sum.ts` (`// @pluto-hot`)
   - バッファ管理、パイプライン初期化、ディスパッチ実行
   - 400 行以下、アロケーションゼロ
6. **Step 6: GpuRadixSort クラスの実装 (`pluto-implement` / `pluto-perf`)**
   - `src/compute/gpu-radix-sort.ts` (`// @pluto-hot`)
   - 8 パスの ping-pong ディスパッチ、indirect 引数サポート
   - 400 行以下、アロケーションゼロ
7. **Step 7: compute/index.ts および lowlevel.ts への公開**
   - `src/compute/index.ts`
   - `src/lowlevel.ts`
8. **Step 8: ユニットテストおよびパリティテストの作成と検証 (`pluto-test`)**
   - `tests/unit/compute/gpu-prefix-sum.test.ts`
   - `tests/unit/compute/gpu-radix-sort.test.ts`
   - `tests/browser/compute/parity.spec.ts` (CPU 参照実装との比較、10 種のランダムシード、サイズ 1〜2^20)
9. **Step 9: 検証・レビュー・コミット・プッシュ (`pluto-test` / `pluto-review` / `pluto-task-finish`)**
   - `pnpm verify`
   - `pnpm bench`
   - `docs/progress/reviews/T-4.5.md` 作成
   - コミット＆リモートプッシュ
