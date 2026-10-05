# T-1.5: 時間

## 目的

エンジン内の時間を管理する仕組みを構築する。決定的なテストやシミュレーションを可能にするため、生の `performance.now()` 使用を封じ、`Clock` インターフェースを通して時間を取得する。また、物理演算など固定フレームレートで更新が必要なシステム向けに `FixedStepper` を実装する。

## 編集・作成するファイル

- `src/core/time/index.ts`
- `src/core/time/clock.ts`
- `src/core/time/fixed-step.ts`
- 対応するテスト (`tests/unit/core/time/clock.test.ts`, `fixed-step.test.ts`)

## 実装ステップ

1. **clock.ts の実装**
   - `Clock` インターフェース: `now(): number` を定義 (返すのはミリ秒)。
   - `PerformanceClock` クラス: 内部で `globalThis.performance.now()` を呼び出す。
   - `ManualClock` クラス: テスト用に任意の時間を設定できる `advance(ms: number)` メソッドなどを持つ。
2. **fixed-step.ts の実装**
   - `FixedStepper` クラス (HOTファイル):
     - `stepMs`: 1回の固定ステップの時間 (ミリ秒)。
     - `maxSteps`: スパイラル・オブ・デス (Spiral of Death) を防ぐため、1フレームで実行できる最大ステップ数。
     - `accumulator`: 蓄積時間。
     - `update(dtMs: number, callback: (dt: number) => void)` メソッド: `accumulator += dtMs` とし、`accumulator >= stepMs` の間ループして `callback` を実行する。ただし、ループ回数が `maxSteps` を超えた場合は警告ログなどを出し、`accumulator` の残りを捨てる（あるいは `accumulator %= stepMs` するなど適宜）。
3. **テストの作成**
   - `PerformanceClock`: `now()` が数値を返すか確認（`performance.now` をモック）。
   - `ManualClock`: `advance()` によって正しく時間が進むか確認。
   - `FixedStepper`: `update` により正確にステップが踏まれるか、また `maxSteps` を超過した際にループが中断されアキュムレータが適切に処理されるかを確認。
4. カバレッジを満たすことの確認。

## 完了条件（受け入れ条件）

1. `PerformanceClock`、`ManualClock` の実装が正しく行われている。
2. `FixedStepper` が `dt` の蓄積と最大ステップ制約（スパイラル回避）を正しく実装している。
3. ユニットテスト: 各クラスのメソッドにつき正常系・異常系・境界値が存在すること。
4. カバレッジ `core/time/**` が lines 95% / branches 90% 以上であること。
5. HOT ファイル (`fixed-step.ts`) は `pnpm check:rules` を通過すること。
