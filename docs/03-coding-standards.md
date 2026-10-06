# 03. コーディング規約 (詳細版)

`.agents/rules/01-coding.md` と `.agents/rules/02-performance.md` の詳細と具体例。
ルールが衝突した場合は `.agents/rules/` が優先する。

---

## 1. ファイルの形

### 1.1 コールドパスファイルのテンプレート

```ts
/**
 * @file コマンドバッファ。構造変更 (spawn/despawn/add/remove) を同期点まで遅延させる。
 */
import type { World } from './world';
import { assert } from '../debug';

/**
 * 構造変更コマンドの種類。
 */
export const CommandKind = {
  Spawn: 0,
  Despawn: 1,
} as const;

/** {@link CommandKind} の値の型。 */
export type CommandKind = (typeof CommandKind)[keyof typeof CommandKind];

/**
 * 遅延コマンドを蓄積するバッファ。
 */
export class CommandBuffer {
  // フィールドはすべてコンストラクタで初期化する (隠れクラスを安定させる)
  private readonly kinds: Uint8Array;
  private count: number;

  /**
   * @param capacity 1 フレームに蓄積できる最大コマンド数
   */
  public constructor(capacity: number) {
    this.kinds = new Uint8Array(capacity);
    this.count = 0;
  }
}
```

### 1.2 HOT ファイルのテンプレート

```ts
// @pluto-hot
/**
 * @file ローカル Transform からワールド行列を計算するカーネル。
 */
import type { ChunkView } from '../core/ecs';
import { Transform, WorldTransform } from './transform-components';

/**
 * ルート (親なし) エンティティのワールド行列を計算する。
 * @hot
 * @param view 対象チャンク
 */
export function computeRootWorldTransforms(view: ChunkView): void {
  // ループ前に TypedArray をローカルへキャッシュする
  const x = view.column(Transform.x);
  const y = view.column(Transform.y);
  const rot = view.column(Transform.rotation);
  const sx = view.column(Transform.scaleX);
  const sy = view.column(Transform.scaleY);
  const a = view.column(WorldTransform.a);
  // ...
  const end = view.end;
  for (let i = view.start; i < end; i++) {
    const c = Math.cos(rot[i]);
    const s = Math.sin(rot[i]);
    a[i] = c * sx[i];
    // ...
  }
}
```

### 1.3 index.ts のテンプレート (re-export のみ)

```ts
/**
 * @file core/ecs モジュールの公開窓口。
 */
export { World } from './world';
export type { WorldConfig } from './world';
export { defineComponent } from './component';
export { defineSystem, Phase } from './system';
```

- `export *` は **禁止** (公開範囲が曖昧になる)。名前を列挙する。
- 型は `export type { ... }`。

---

## 2. 型

| 規則                       | 良い例                                                     | 悪い例                                                |
| -------------------------- | ---------------------------------------------------------- | ----------------------------------------------------- |
| 列挙は `as const` + 同名型 | `export const BlendMode = { Normal: 0, Add: 1 } as const;` | `enum BlendMode { ... }`                              |
| 公開関数の戻り値型を明示   | `export function len(v: Float32Array): number`             | `export function len(v: Float32Array)`                |
| 型 import を分離           | `import type { World } from './world';`                    | `import { World } from './world';` (型としてのみ使用) |
| オプショナルは `?:`        | `interface Cfg { width?: number }`                         | `width: number \| undefined` を省略可能の意味で使う   |
| ユニオン判定は網羅         | `default: unreachable(kind);`                              | `default: break;`                                     |
| unknown を絞り込む         | `if (typeof v === 'number')`                               | `v as number`                                         |

- `object`, `Function`, `{}` 型は禁止。
- クラスは「状態 + 振る舞い」がある場合のみ。状態のない関数群はモジュール関数にする。
- 継承は `Scene` 基底クラス (ユーザーが継承する) と `PlutoError` のみ許可。それ以外は合成。
- `public` / `private` / `protected` 修飾子を **常に明示** する。`#private` は使わない (ホットパスで遅い環境があるため)。
- `readonly` を付けられるフィールドは必ず付ける。

## 3. 命名

| 対象                         | 規則                           | 例                                                   |
| ---------------------------- | ------------------------------ | ---------------------------------------------------- |
| ファイル                     | kebab-case                     | `sprite-buffer.ts`                                   |
| クラス・型・インターフェース | PascalCase                     | `SpriteBuffer`, `RhiDevice`                          |
| 関数・メソッド・変数         | camelCase                      | `allocateSlots`                                      |
| モジュール定数               | UPPER_SNAKE_CASE               | `MAX_SPRITES`                                        |
| `as const` 列挙オブジェクト  | PascalCase (キーも PascalCase) | `Phase.FixedUpdate`                                  |
| 真偽値                       | is/has/can/should 接頭辞       | `isVisible`, `hasCompute`                            |
| TypedArray 変数              | 中身を表す名前                 | `positionsX`, `frameIds` (`arr`, `data` は禁止)      |
| 単位を含む値                 | 単位を接尾辞に                 | `durationMs`, `angleRad`, `sizeBytes`                |
| 自作の GPU 関連型            | `Rhi` 接頭辞                   | `RhiBuffer` (`GPUBuffer` は WebGPU 組込名なので禁止) |

## 4. コメント (日本語必須)

- `/** */` 内には **必ず日本語** を含める (`tools/check-rules.mjs` が検査)。
- ファイル先頭に `@file` 必須。
- export されたシンボル全てに JSDoc 必須。
- 「何をしているか」ではなく「なぜそうしているか」を書く。
- 論文・アルゴリズム由来のコードには出典を書く: `@see Macklin & Müller, "Position Based Fluids", 2013`。
- 単位・座標系・値域を書く: `@param angleRad 回転角 (ラジアン、反時計回り)`。

## 5. エラー処理

### 5.1 PlutoError (`src/core/debug/pluto-error.ts`)

```ts
export const ErrorCode = {
  InvalidArgument: 'E_INVALID_ARGUMENT',
  CapacityExceeded: 'E_CAPACITY_EXCEEDED',
  NotInitialized: 'E_NOT_INITIALIZED',
  AssetNotFound: 'E_ASSET_NOT_FOUND',
  AssetLoadFailed: 'E_ASSET_LOAD_FAILED',
  GpuUnavailable: 'E_GPU_UNAVAILABLE',
  GpuDeviceLost: 'E_GPU_DEVICE_LOST',
  ShaderCompileFailed: 'E_SHADER_COMPILE_FAILED',
  UnsupportedFeature: 'E_UNSUPPORTED_FEATURE',
  InvalidState: 'E_INVALID_STATE',
} as const;

export class PlutoError extends Error {
  public readonly code: ErrorCode;
  public constructor(code: ErrorCode, message: string) {
    /* ... */
  }
}
```

- エラーメッセージは **日本語** で、原因と対処を含める: `'スプライト容量 (1048576) を超えました。GameConfig.maxSprites を増やしてください。'`
- `ErrorCode` の追加は、タスクでの指示がある場合のみ。

### 5.2 assert (`src/core/debug/assert.ts`)

```ts
export function assert(condition: boolean, message: string): asserts condition {
  if (__DEBUG__ && !condition) {
    throw new PlutoError(ErrorCode.InvalidState, message); // T-1.2 以前は Error を使う
  }
}
```

- ホットパスの前提条件チェックは `assert` のみ。release では本体がなくなる。
- `assert` のメッセージに文字列連結を使わない (release でも評価されてしまう)。固定文字列にする。

## 6. 非同期

- `async` 関数はコールドパス (ロード・初期化) のみ。フレームループ内で `await` しない。
- Promise を投げっぱなしにしない (`no-floating-promises`)。意図的なら `void promise.catch(handleError)`。

## 7. 禁止 API 一覧

| 禁止                                    | 代替                  | 例外ファイル                                                                                  |
| --------------------------------------- | --------------------- | --------------------------------------------------------------------------------------------- |
| `console.*`                             | `logger`              | `src/core/debug/logger.ts`                                                                    |
| `Math.random()`                         | `createRng(seed)`     | なし                                                                                          |
| `Date.now()`, `performance.now()`       | `Clock`               | `src/core/time/clock.ts`, `src/devtools/**`                                                   |
| `setTimeout`, `setInterval`             | `TimerManager`        | なし                                                                                          |
| `requestAnimationFrame`                 | -                     | `src/scene/game.ts`                                                                           |
| `new Worker`                            | -                     | `src/jobs/threaded-scheduler.ts`                                                              |
| `SharedArrayBuffer`                     | `createBackingBuffer` | `src/core/memory/buffer-factory.ts`, `src/jobs/**`                                            |
| `navigator.gpu`, `getContext('webgl2')` | `createDevice`        | `src/rhi/**`                                                                                  |
| `document`, `window`                    | -                     | `src/input/**`, `src/scene/game.ts`, `src/devtools/stats-overlay.ts`, `src/assets/loaders/**` |
| `eval`, `new Function`                  | -                     | なし                                                                                          |

## 8. ESLint 設定 (T-0.2 で `eslint.config.js` にこの内容を実装する)

ベース: `@eslint/js` recommended + `typescript-eslint` の `strictTypeChecked` と `stylisticTypeChecked` + `eslint-config-prettier`。追加ルール:

```js
{
  '@typescript-eslint/no-explicit-any': 'error',
  '@typescript-eslint/no-non-null-assertion': 'error',
  '@typescript-eslint/explicit-module-boundary-types': 'error',
  '@typescript-eslint/explicit-member-accessibility': ['error', { accessibility: 'explicit' }],
  '@typescript-eslint/consistent-type-imports': 'error',
  '@typescript-eslint/no-floating-promises': 'error',
  '@typescript-eslint/switch-exhaustiveness-check': 'error',
  '@typescript-eslint/ban-ts-comment': ['error', { 'ts-ignore': true, 'ts-expect-error': true, 'ts-nocheck': true }],
  '@typescript-eslint/naming-convention': [/* §3 の表を実装 */],
  'no-restricted-syntax': ['error',
    { selector: 'TSEnumDeclaration', message: 'enum 禁止。as const オブジェクトを使う' },
    { selector: 'TSModuleDeclaration[kind="namespace"]', message: 'namespace 禁止' },
    { selector: 'ExportDefaultDeclaration', message: 'default export 禁止' },
    { selector: 'ForInStatement', message: 'for...in 禁止' },
    { selector: 'PrivateIdentifier', message: '#private 禁止。private 修飾子を使う' },
  ],
  'no-console': 'error',
  'eqeqeq': ['error', 'always'],
  'no-var': 'error',
  'prefer-const': 'error',
  'max-lines': ['error', { max: 400, skipBlankLines: false, skipComments: false }],
  'max-params': ['error', 6],
  'complexity': ['error', 20],
  'no-restricted-globals': ['error', 'event', 'name'],
}
```

- `src/core/debug/logger.ts` と、`console` をスパイして logger を検証する `tests/unit/core/debug/logger.test.ts` のみ `no-console` を off にする (ファイル単位の override。他のルール (`no-empty-function` 等) は緩めない)。
- `tests/**` は `max-lines` を 800 にしてよい。
- 設定ファイル (`*.config.ts`, `*.config.js`) は `export default` が必須のため、`ExportDefaultDeclaration` の禁止だけを外す。それ以外のルールの無効化 (`no-empty-function: off` など仕様外の緩和) は禁止。
- `tools/**/*.mjs` も lint 対象 (ignore しない)。`console` は tools でのみ許可する (`no-console: off` の override)。
- `naming-convention` は §3 の表を次のように実装する: 型系 `PascalCase`、変数・関数・メソッド `camelCase`、モジュールトップの `const` は `camelCase | UPPER_CASE | PascalCase` (`as const` 列挙オブジェクトのため)、import 名は `camelCase | PascalCase` (default import されるコンストラクタ `WorkerCtor` のため)、`as const` 列挙オブジェクトのプロパティは `PascalCase` (`UPPER_CASE` 定数オブジェクトのキーは対象外)、`boolean` 型の **変数** は接頭辞 `is|has|can|should` (引数・プロパティは仕様書で決まった API 名 (`caps.compute`, `pixelArt`, WebGL のコンテキスト属性など) を優先するため機械検査の対象外。新しく名前を付ける場合は接頭辞を付ける)。`as const` 列挙オブジェクトのキーの PascalCase は、PascalCase 名の宣言に付いた `as const` オブジェクトを `no-restricted-syntax` で検査する
- `tests/`・`bench/`・`tools/` にも AGENTS.md §3-4 の禁止事項 (`as unknown as` 等) が適用される (`tools/check-rules.mjs` が検査)。

## 10. 機械検査の範囲 (`tools/check-rules.mjs`)

- HOT 規則 (`.agents/rules/02-performance.md`) の検査は、**クラスのコンストラクタ本体・フィールド初期化子・`@cold` 関数 (とそれらの中のクロージャ)・モジュールのトップレベルの文** を対象外とする (初期化時に 1 回だけ実行されるため)。トップレベルで宣言した関数の本体は対象。`throw new PlutoError(...)` のようなエラー経路の確保も対象外 (毎フレームの経路ではないため。ループ内の throw は従来どおり禁止)。それ以外で禁止事項を使う行は、行末に `// pluto-allow: 日本語の理由` が必要。
- HOT ファイルでは、トップレベルの `export function` の JSDoc に `@hot` か `@cold` のどちらかが必要。`@cold` を付けた関数・メソッド (例: `vec2.create()`, `createRng()` のような初期化用の生成関数) は HOT 規則の検査対象外。`@cold` を毎フレーム呼ぶ経路で使ってはならない (レビューで確認)。
- 「index.ts は re-export のみ」の検査はモジュールの `index.ts` (`src/<module>/index.ts`) が対象。ルートの `src/index.ts` は `VERSION` 定数を持つため対象外。
- 循環 import の検査は値の import のみを対象とする (`import type` は実行時の依存にならないため除外)。
- 公開シンボルの JSDoc 検査対象: トップレベルの export 宣言と、export されたクラスの public なメソッド・プロパティ・アクセサ (コンストラクタとインターフェースのメンバーは対象外)。
- `eslint-disable` コメントは **全面禁止** (`linterOptions.noInlineConfig: true` を設定する)。

## 9. Prettier 設定 (`.prettierrc.json`)

```json
{
  "printWidth": 100,
  "singleQuote": true,
  "trailingComma": "all",
  "semi": true,
  "arrowParens": "always",
  "endOfLine": "lf"
}
```
