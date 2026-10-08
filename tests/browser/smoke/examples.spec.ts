/**
 * @file サンプル集のスモークテスト (docs/12-roadmap.md T-5.1)。
 *
 * 全サンプルが webgl2 プロジェクトでコンソールエラーなく 120 フレーム動作する。
 */
import { expect, test } from '../helpers/harness-test';

const EXAMPLES = ['hello-sprite', 'million-sprites'] as const;

test.describe('サンプル集 (T-5.1)', () => {
  for (const name of EXAMPLES) {
    test(`${name} がエラーなく 120 フレーム動作する`, async ({ page }) => {
      const errors: string[] = [];
      page.on('console', (msg) => {
        if (msg.type() === 'error') {
          errors.push(msg.text());
        }
      });
      page.on('pageerror', (error) => {
        errors.push(String(error));
      });

      await page.goto(`/examples/${name}/index.html`);
      await page.waitForSelector('canvas');
      await page.evaluate(
        () =>
          new Promise((resolve) => {
            let frames = 0;
            const tick = (): void => {
              frames += 1;
              if (frames >= 120) {
                resolve(undefined);
              } else {
                requestAnimationFrame(tick);
              }
            };
            requestAnimationFrame(tick);
          }),
      );

      expect(errors).toEqual([]);
    });
  }
});
