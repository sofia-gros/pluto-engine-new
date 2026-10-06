/**
 * @file プロジェクトごとのハーネス設定 (docs/10-testing-strategy.md §3.6)。
 * spec は URL を直書きせず、この `test` と `openHarness` を使う。
 */
import { test as base, expect, type Page } from '@playwright/test';
import type { HarnessBackend, HarnessBuild, PlutoHarness } from '../fixtures/harness';

/** playwright.config.ts のプロジェクトで設定するオプション。 */
export interface PlutoTestOptions {
  /** ハーネスに渡すバックエンド。 */
  readonly plutoBackend: HarnessBackend;
  /** ハーネスに渡すビルド。 */
  readonly plutoBuild: HarnessBuild;
}

/** プロジェクトのオプションを受け取れる test。 */
export const test = base.extend<PlutoTestOptions>({
  plutoBackend: ['webgl2', { option: true }],
  plutoBuild: ['src', { option: true }],
});

export { expect };

/**
 * ハーネスの URL を作る。
 * @param backend バックエンド
 * @param build ビルド
 * @returns dev server 上のパス
 */
export function harnessUrl(backend: string, build: string): string {
  return `/tests/browser/fixtures/harness.html?backend=${backend}&build=${build}`;
}

/**
 * ハーネスを開き、読み込み完了を待って状態を返す。
 * @param page Playwright のページ
 * @param options プロジェクトのオプション
 * @returns ハーネスの状態
 */
export async function openHarness(page: Page, options: PlutoTestOptions): Promise<PlutoHarness> {
  await page.goto(harnessUrl(options.plutoBackend, options.plutoBuild));
  const handle = await page.waitForFunction(() => window.__pluto);
  return (await handle.jsonValue()) ?? Promise.reject(new Error('ハーネスの状態を取得できません'));
}
