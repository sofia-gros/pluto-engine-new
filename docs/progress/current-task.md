# T-0.6: CI

## 目的

GitHub Actions を用いて、プッシュおよびプルリクエスト時に自動で検証 (`pnpm verify`) とビルド (`pnpm build`)、およびブラウザテスト (`pnpm test:browser`) が走る CI 環境を構築する。

## 編集・作成するファイル

- `.github/workflows/ci.yml`

## 実装ステップ

1. **GitHub Actions ワークフローファイルの作成**
   - `.github/workflows/ci.yml` を作成する。
   - トリガーは `push` と `pull_request`。
   - **Job 1: verify**
     - 環境: `ubuntu-latest`, Node.js 22。
     - pnpm のセットアップ（`corepack enable pnpm` を使用するか、pnpm/action-setup を使う）。
     - 依存解決: `pnpm install --frozen-lockfile`。
     - 実行: `pnpm verify` その後 `pnpm build`。
   - **Job 2: browser**
     - 環境: `ubuntu-latest`, Node.js 22。
     - 依存解決: `pnpm install --frozen-lockfile`。
     - Playwright と依存ライブラリのインストール: `pnpm exec playwright install --with-deps chromium`。
     - 実行: `pnpm test:browser --project=webgl2` (CI 環境では WebGPU は対象外とする)。

2. **ローカル検証**
   - 同じコマンド列 (`pnpm verify`, `pnpm build`, `pnpm test:browser --project=webgl2`) が成功することを確認する。

## 完了条件（受け入れ条件）

1. YAML が §7 の要件通りに設定されていること。
2. ローカルで同等のコマンド列を実行し、すべて成功すること。
