# T-0.5: Playwright ハーネス

## 目的

ブラウザ環境（WebGL2 / WebGPU）でエンジンの描画や並列処理をテストするための E2E テスト基盤（Playwright）を構築する。特に、描画結果をピクセル単位で比較する「ゴールデン画像テスト」の基盤を準備する。

## 編集・作成するファイル

- `playwright.config.ts`
- `tests/browser/fixtures/harness.html`
- `tests/browser/fixtures/harness.ts`
- `tests/browser/helpers/golden.ts`
- `tests/browser/smoke/harness.spec.ts`

## 実装ステップ

1. **Playwright 設定の作成**
   - `playwright.config.ts` を作成し、プロジェクトとして `webgpu`, `webgl2`, `embed` を定義する。
   - `webServer` を使って Vite 開発サーバー (`pnpm dev`) を起動するよう設定する。
   - WebGPUプロジェクト用に Chromium に引数 `--enable-unsafe-webgpu --enable-features=Vulkan` を渡す。
2. **テストハーネスの作成**
   - `tests/browser/fixtures/harness.html` を作成し、`<script type="module" src="./harness.ts"></script>` を読み込む。
   - `tests/browser/fixtures/harness.ts` を作成し、URLパラメータ `?backend=...` をパースし、Playwright がアクセスできるように `window.__pluto` オブジェクトをエクスポート/公開する。
3. **ゴールデン画像比較ヘルパーの作成**
   - `tests/browser/helpers/golden.ts` を作成し、`expectGolden(page, name)` を実装する。
   - `pngjs` と `pixelmatch` を使って画像を比較し、差分ピクセル率が 0.5% 以下なら合格とする。
4. **スモークテストの作成**
   - `tests/browser/smoke/harness.spec.ts` を作成する。
   - `page.goto` でハーネスを開き、`crossOriginIsolated === true` になっているか確認するテストを書く。
   - `golden.ts` の比較ロジックが正しく動くか検証するユニット的なテスト（同一画像なら差分0、1px変えると検出されるか）を書く。

## 完了条件（受け入れ条件）

1. `pnpm test:browser --project=webgl2` でハーネスが読み込まれ、`crossOriginIsolated === true` を検証するテストが成功すること。
2. `golden.ts` の比較ロジックにユニット的な検証があり、それが成功すること。
