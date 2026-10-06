import { defineConfig, devices } from '@playwright/test';
import type { PlutoTestOptions } from './tests/browser/helpers/harness-test';

/**
 * ブラウザテスト設定 (docs/10-testing-strategy.md §3)。
 * プロジェクト: webgpu / webgl2 / embed。CI では `--project=webgl2` で WebGPU を対象から外す。
 * embed は `pnpm test:browser:embed` (embed ビルドを作ってから実行) で使う。
 */
export default defineConfig<PlutoTestOptions>({
  testDir: './tests/browser',
  fullyParallel: true,
  forbidOnly: !!process.env['CI'],
  retries: process.env['CI'] ? 2 : 0,
  ...(process.env['CI'] ? { workers: 1 } : {}),
  reporter: process.env['CI'] ? 'line' : 'html',
  // ゴールデン画像が無いときは失敗させる。作成・更新は --update-snapshots のときだけ
  updateSnapshots: 'none',
  use: {
    baseURL: 'http://localhost:5173',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'webgpu',
      use: {
        ...devices['Desktop Chrome'],
        plutoBackend: 'webgpu',
        plutoBuild: 'src',
        launchOptions: {
          args: ['--enable-unsafe-webgpu', '--enable-features=Vulkan'],
        },
      },
    },
    {
      name: 'webgl2',
      use: { ...devices['Desktop Chrome'], plutoBackend: 'webgl2', plutoBuild: 'src' },
    },
    {
      name: 'embed',
      use: { ...devices['Desktop Chrome'], plutoBackend: 'webgl2', plutoBuild: 'embed' },
    },
  ],
  webServer: {
    command: 'pnpm dev',
    url: 'http://localhost:5173/tests/browser/fixtures/harness.html?backend=webgl2',
    reuseExistingServer: !process.env['CI'],
  },
});
