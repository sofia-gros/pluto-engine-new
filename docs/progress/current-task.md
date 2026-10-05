# T-0.3: Vite 2 ビルドとエントリ

## 目的
Pluto Engine のコアとなる2種類のビルド（並列処理を行う `parallel` と直列処理にフォールバックする `embed`）を構築し、ビルドシステム（Vite）と型定義出力（tsc）のパイプラインを確立する。

## 編集・作成するファイル
- `vite.config.ts`
- `tsconfig.build.json`
- `src/build-flags.d.ts`
- `src/index.ts`
- `src/lowlevel.ts` (既に存在しているが、要件に合わせて内容を更新)
- `tools/check-bundle.mjs`
- `package.json` (exports フィールドの追加)

## 実装ステップ
1. **TypeScript 関連ファイルの作成**
   - `tsconfig.build.json` を `docs/11-build-and-release.md` §4 に従って作成する。
   - `src/build-flags.d.ts` を `docs/05-jobs-and-builds.md` §4 に従って作成する。
2. **エントリポイントの作成**
   - `src/index.ts` を作成し、`__VERSION__` の定数エクスポートを記述する。
   - `src/lowlevel.ts` に適切なJSDocと `export {}` を記述する。
3. **Vite 設定の作成**
   - `vite.config.ts` を作成する。
   - `mode` (parallel, embed, parallel-debug, embed-debug) に応じて `__PARALLEL__`, `__DEBUG__`, `__VERSION__` の define を切り替える。
   - `build.lib` で `pluto` と `pluto-lowlevel` のエントリを設定し、出力先やファイル名（`.debug.js`など）、minifyの設定を制御する。
   - dev serverのヘッダ（COOP/COEP）を設定する。
4. **パッケージのエクスポート設定**
   - `package.json` に `exports` フィールドを追加し、`.`, `./parallel`, `./embed`, `./lowlevel` の解決先を指定する（`docs/05-jobs-and-builds.md` §5）。
5. **ビルド検証ツールの作成**
   - `tools/check-bundle.mjs` を作成し、embed ビルドに Worker 関連のAPIが含まれていないことを検査する。
6. **テスト・ビルドの実行**
   - `pnpm build` を実行し、想定通りの成果物が `dist/` に生成されるか確認する。
   - `node tools/check-bundle.mjs` が成功することを確認する。
   - `pnpm typecheck` が成功することを確認する。

## 完了条件（受け入れ条件）
1. `pnpm build` が成功し、`dist/parallel/pluto.js`, `dist/parallel/pluto.debug.js`, `dist/embed/pluto.js`, `dist/embed/pluto.debug.js`, `dist/types/index.d.ts` が生成される。
2. `node tools/check-bundle.mjs` が成功する。
3. `pnpm typecheck` が成功する。
