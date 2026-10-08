# 11. ビルド・依存・CI

## 1. ツールチェーン (バージョン固定)

| ツール         | バージョン                               |
| -------------- | ---------------------------------------- |
| Node.js        | 22 LTS 以上 (`engines.node: ">=22"`)     |
| pnpm           | 10.x (`packageManager` フィールドで固定) |
| TypeScript     | 5.x 最新                                 |
| モジュール形式 | ESM のみ (`"type": "module"`)            |

## 2. 依存 (許可リスト)

> [!IMPORTANT]
> **ランタイム依存 (`dependencies`) はゼロ**。下記以外の devDependencies を追加してはならない。追加が必要なら `pluto-escalate`。

| パッケージ               | 用途                      |
| ------------------------ | ------------------------- |
| `typescript`             | 型検査・型定義出力        |
| `vite`                   | ビルド・dev server        |
| `vitest`                 | ユニットテスト            |
| `@vitest/coverage-v8`    | カバレッジ                |
| `eslint`                 | Lint                      |
| `@eslint/js`             | ESLint 推奨設定           |
| `typescript-eslint`      | TS 用 ESLint              |
| `eslint-config-prettier` | Prettier との衝突回避     |
| `prettier`               | 整形                      |
| `@playwright/test`       | ブラウザテスト・ベンチ    |
| `@webgpu/types`          | WebGPU 型定義             |
| `pixelmatch`             | ゴールデン画像比較        |
| `pngjs`                  | PNG 読み書き (ゴールデン) |
| `@types/node`            | tools / 設定ファイル用    |
| `@types/pngjs`           | 同上                      |

## 3. package.json の scripts (この名前と内容で作る)

```json
{
  "scripts": {
    "dev": "vite",
    "typecheck": "tsc --noEmit -p tsconfig.json",
    "lint": "eslint . --max-warnings 0",
    "format": "prettier --write .",
    "format:check": "prettier --check .",
    "check:structure": "node tools/check-structure.mjs",
    "check:boundaries": "node tools/check-boundaries.mjs",
    "check:rules": "node tools/check-rules.mjs",
    "test": "vitest run",
    "test:watch": "vitest",
    "test:coverage": "vitest run --coverage",
    "test:browser": "playwright test",
    "test:browser:embed": "pnpm build:embed && playwright test --project=embed",
    "build:parallel": "vite build --mode parallel && vite build --mode parallel-debug",
    "build:embed": "vite build --mode embed && vite build --mode embed-debug",
    "build:types": "tsc -p tsconfig.build.json",
    "build": "pnpm build:parallel && pnpm build:embed && pnpm build:types && node tools/check-bundle.mjs",
    "bench": "node tools/run-bench.mjs",
    "docs:api": "node tools/gen-api-docs.mjs",
    "verify": "node tools/verify.mjs"
  }
}
```

`pnpm verify` (`tools/verify.mjs`) は以下を順に実行し、1 つでも失敗したら非 0 で終了する:
`check:structure` → `check:boundaries` → `check:rules` → `typecheck` → `lint` → `format:check` → `test:coverage`

(package.json が存在しない段階では、存在するスクリプトのみ実行して残りは「スキップ (未作成)」と表示する)

最後に各段階の成否を表で要約表示する。`docs:api` は T-10.3 で追加する (それまでは scripts に書かない)。`pnpm bench` は引数を `run-bench.mjs` に渡す (`pnpm bench --scene crowd --build parallel`)。run-bench は結果を保存した後に `compare-bench.mjs` を呼ぶ (pnpm は引数をスクリプトの末尾に付けるので、`run-bench && compare-bench` の形にすると引数が compare 側に渡ってしまうため)。

## 4. tsconfig.json (この内容で作る)

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2024", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "types": ["@webgpu/types", "vite/client"],
    "strict": true,
    "noImplicitOverride": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true,
    "noPropertyAccessFromIndexSignature": true,
    "exactOptionalPropertyTypes": true,
    "useUnknownInCatchVariables": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "verbatimModuleSyntax": true,
    "isolatedModules": true,
    "skipLibCheck": true,
    "noEmit": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src", "tests", "bench", "examples", "*.config.ts"]
}
```

> [!NOTE]
> `noUncheckedIndexedAccess` は **意図的に無効**。TypedArray の添字アクセスが `number | undefined` になり、ホットパスで非 null アサーション (禁止) が必要になるため。範囲は `assert` で保証する。

`tsconfig.build.json` (T-0.3):

```json
{
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": false,
    "declaration": true,
    "emitDeclarationOnly": true,
    "rootDir": "src",
    "outDir": "dist/types",
    "types": ["@webgpu/types", "vite/client"]
  },
  "include": ["src"]
}
```

## 5. vite.config.ts の要件

- `mode` に応じて `define` を設定: `__PARALLEL__`, `__DEBUG__`, `__VERSION__` (`docs/05-jobs-and-builds.md` §4 の表)。
- `build.lib`: エントリ `src/index.ts` (`pluto`) と `src/lowlevel.ts` (`pluto-lowlevel`)、形式 `es` のみ。
- 出力先 `dist/<parallel|embed>/`、debug モードはファイル名に `.debug` を付け、minify しない。
- `build.target: 'es2022'`。
- `worker.format: 'es'`。
- dev server: `headers: { 'Cross-Origin-Opener-Policy': 'same-origin', 'Cross-Origin-Embedder-Policy': 'require-corp' }`。`preview.headers` にも同じものを設定する。
- `command === 'serve'` (dev server) のときは mode 名によらず `__PARALLEL__ = true`, `__DEBUG__ = true` (`docs/05-jobs-and-builds.md` §4)。
- `assetsInclude` に `**/*.wgsl`, `**/*.glsl` は入れない (`?raw` で読む)。

## 6. tools/check-bundle.mjs の要件 (T-0.3、T-5.1 で改訂)

- `dist/embed/pluto.js` に文字列 `SharedArrayBuffer`, `new Worker`, `Atomics.wait` が **含まれない** ことを検査。
- `dist/parallel/` 全体 (`pluto.js`, `pluto-lowlevel.js` と共有チャンク) に `new Worker` と `Atomics.wait` (`Atomics.waitAsync` も可) が含まれる (Worker がインライン化されている) ことを検査し、含まれなければ **失敗**。

> [!NOTE]
> T-5.1 より前は検査対象が `pluto-lowlevel.js` だけだった。T-5.1 で `scene` が `jobs` を引くようになり、エントリ間でコード分割された共有チャンクに Worker 実体が入るため、`dist/parallel/` 全体を走査する (D-23)。共有チャンク内の `Atomics.or` / `Atomics.add` はカーネルの dirty マーク用で serial でも同じコードを使うため正常であり、Worker 混入の判定には使わない。embed 側はエントリのみ走査する (`buffer-factory.ts` の実行時分岐に文字列が残るため)。

## 7. CI (`.github/workflows/ci.yml`)

- トリガー: `push`, `pull_request` (ブランチで絞らない)。
- ジョブ `verify`: `ubuntu-latest`, Node 22, `pnpm install --frozen-lockfile` → `pnpm verify` → `pnpm build`。
- ジョブ `browser`: `pnpm exec playwright install --with-deps firefox` → `pnpm test:browser --project=webgl2` (CI では WebGPU は対象外。ブラウザは Firefox に統一: `docs/10-testing-strategy.md` §3)。
- ベンチは CI で実行しない。

## 8. バージョニング

- SemVer。`0.x` の間は破壊的変更を許容するが CHANGELOG に記載 (CHANGELOG はリリースタスクで作成)。
