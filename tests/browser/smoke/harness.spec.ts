import { test, expect, openHarness, harnessUrl } from '../helpers/harness-test';

test.describe('ハーネス', () => {
  test('プロジェクト設定どおりのバックエンド・ビルドで読み込まれる', async ({
    page,
    plutoBackend,
    plutoBuild,
  }) => {
    const requested: string[] = [];
    page.on('request', (r) => requested.push(new URL(r.url()).pathname));
    const pluto = await openHarness(page, { plutoBackend, plutoBuild });
    // embed は成果物だけを読み、src のエンジンを読まない (05 §4 の NOTE)
    const hasEmbedBundle = requested.includes('/dist/embed/pluto.debug.js');
    const hasSrcEngine = requested.includes('/src/index.ts');
    expect(hasEmbedBundle).toBe(plutoBuild === 'embed');
    expect(hasSrcEngine).toBe(plutoBuild === 'src');
    expect(pluto.backend).toBe(plutoBackend);
    expect(pluto.build).toBe(plutoBuild);
    expect(pluto.crossOriginIsolated).toBe(true);
    expect(pluto.version).toMatch(/^\d+\.\d+\.\d+/);
  });

  test('dev server では __PARALLEL__ と __DEBUG__ が true になる (05 §4)', async ({
    page,
    plutoBackend,
  }) => {
    const pluto = await openHarness(page, { plutoBackend, plutoBuild: 'src' });
    expect(pluto.devParallel).toBe(true);
    expect(pluto.devDebug).toBe(true);
  });

  test('不正な backend / build はハーネスが例外で止まる', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(harnessUrl('canvas2d', 'src'));
    await expect.poll(() => errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('backend=canvas2d は不正');
    errors.length = 0;
    await page.goto(harnessUrl('webgl2', 'cdn'));
    await expect.poll(() => errors.length).toBeGreaterThan(0);
    expect(errors[0]).toContain('build=cdn は不正');
  });
});
