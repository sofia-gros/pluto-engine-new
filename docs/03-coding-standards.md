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

- `src/core/debug/logger.ts` のみ `no-console` を off にする (ファイル単位の override)。
- `tests/**` は `max-lines` を 800 にしてよい。
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
