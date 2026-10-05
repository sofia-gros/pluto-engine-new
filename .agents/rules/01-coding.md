---
trigger: always_on
---

# R1: コーディング必須ルール (要約版)

詳細と例は `docs/03-coding-standards.md`。ここは「絶対に守る最低限」。

## 言語・型
- TypeScript strict。`any` / `as any` / `as unknown as` / `@ts-ignore` / `@ts-expect-error` / `@ts-nocheck` / 非 null アサーション `!` は **禁止**。
- `enum` / `namespace` / `export default` / `for...in` / `var` / `==` は **禁止**。列挙は `as const` オブジェクト + 型で表す。
- 公開関数・公開メソッドは **戻り値の型を明示**。
- 型だけの import は `import type`。

## 命名
- ファイル名: `kebab-case.ts`。1 ファイル 1 責務。**400 行以下**。
- 型・クラス・インターフェース: `PascalCase` (インターフェースに `I` 接頭辞をつけない)。
- 関数・変数: `camelCase`。定数 (モジュールトップの不変値): `UPPER_SNAKE_CASE`。
- 真偽値は `is` / `has` / `can` / `should` で始める。
- 略語は単語として扱う: `gpuBuffer`, `RhiDevice`, `WebGpuDevice` (`GPUBuffer` は WebGPU の型名なので自作型に使わない)。

## コメント (ユーザー規則: DOC コメントは日本語)
- **すべての `/** */` コメントは日本語** で書く。識別子名は英語。
- すべてのファイルの先頭 (HOT マーカーの次) に `/** @file 日本語でこのファイルの責務 */` を置く。
- すべての `export` されたシンボルに日本語 JSDoc を付ける。引数は `@param`、戻り値は `@returns`。
- HOT 関数には JSDoc に `@hot` タグを付ける。

## import
- 相対パスのみ。拡張子は書かない。パスエイリアス禁止。
- **他モジュールからの import は必ずそのモジュールの `index.ts` 経由** (例: `../../core/ecs`)。他モジュールの内部ファイルを直接 import しない。
- 循環 import 禁止。

## エラー処理
- コールドパス (初期化・ロード・API 呼び出し時) の不正入力: `PlutoError` を throw (`docs/03-coding-standards.md` §エラー)。
- ホットパスの前提条件: `assert()` を使う (`__DEBUG__` ビルドでのみ評価される)。ホットパスで throw / try-catch しない。
- `console.*` 直接使用禁止。`core/debug/logger.ts` の `logger` を使う。

## 決定性
- `Math.random()` 禁止 → `core/math/rng.ts`。
- `Date.now()` / `performance.now()` の直接使用禁止 → `core/time/clock.ts` (clock 自身と devtools のみ例外)。
- `setTimeout` / `setInterval` 禁止 (エンジン内部)。時間はフレームループで管理する。
