# T-1.1: 数学

## 目的

2Dゲームエンジンの基盤となる高速な数学ライブラリ（スカラー計算、2Dベクトル、アフィン行列、AABB、ビット演算、半精度浮動小数点、カラーパッキング、乱数）を実装する。GC を避けるため、ベクトルや行列の計算結果は常に引数 `out` で受け取る設計（HOTパス最適化）とする。

## 編集・作成するファイル

- `src/core/math/index.ts` (公開窓口)
- `src/core/math/scalar.ts` (`clamp`, `lerp`, `inverseLerp`, `smoothstep`, `wrap`, `approxEqual`, 定数など)
- `src/core/math/vec2.ts` (`Float32Array` ベースの 2D ベクトル演算)
- `src/core/math/affine2d.ts` (2x3 アフィン変換行列 `Float32Array(6)`)
- `src/core/math/aabb.ts` (`minX, minY, maxX, maxY` 形式の境界箱演算)
- `src/core/math/bits.ts` (`nextPow2`, `isPow2`, `popcount32`, `ctz32`, `log2Floor`)
- `src/core/math/half.ts` (f32 → f16 変換 `packHalf2x16` 等)
- `src/core/math/color.ts` (RGBA8 と ABGR パック/アンパック、`0xRRGGBB` 変換)
- `src/core/math/rng.ts` (xoshiro128** アルゴリズムの乱数生成器)
- 対応するテストコード (`tests/unit/core/math/*.test.ts`)

## 実装ステップ

1. **各モジュールの実装とユニットテスト作成 (TDD)**
   - `scalar.ts`: クランプ、線形補間、角度変換などのスカラー関数を実装し、境界値や正常系をテスト。
   - `vec2.ts`: メモリ確保を避けるため、全て `out` パラメータを取る `(out: Float32Array, ...)` の形式で関数群 (`add`, `sub`, `scale`, `dot`, `len`, `normalize` など) を実装。
   - `affine2d.ts`: 2x3 行列用の生成 (`create()`)、積 (`multiply(out, a, b)`)、逆行列 (`invert(out, a)`)、点変換 (`transformVec2(out, m, v)`) を実装。
   - `aabb.ts`: 領域の包含判定や交差判定などを実装。
   - `bits.ts`: 2の冪乗計算やビットカウントなどを実装。
   - `half.ts`: 単精度から半精度への変換 (`packHalf2x16` 相当)。
   - `color.ts`: カラーのパック/アンパック処理。
   - `rng.ts`: xoshiro128** による決定論的乱数生成。
2. **インデックスファイルのエクスポート設定**
   - 実装した関数や定数を `src/core/math/index.ts` で公開。
3. **テスト・型検査の実行**
   - ユニットテストを回し、カバレッジ (lines 95%, branches 90%) を満たすか確認。
   - `pnpm verify` を実行し、Lint/型エラーがないことを確認。

## 完了条件（受け入れ条件）

1. 仕様書のシグネチャ・定数名・値と完全一致すること（レビュー記録に対応表を書く）。
2. 公開関数ごとに正常系・境界値・異常系のユニットテストが存在すること。
3. カバレッジ `core/math/**` が lines 95% / branches 90% 以上であること。
4. HOT ファイルは `pnpm check:rules` の HOT 検査を通過すること。
5. 個別要件: `rng.ts` は同じシードで同じ列が出ること、`half.ts` は既知値表 (0, 1, -2, 65504, 6.1e-5, NaN, Inf) で往復または変換結果が一致すること。
