import { type Page, type TestInfo } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';

export async function expectGolden(page: Page, testInfo: TestInfo, name: string): Promise<void> {
  const screenshot = await page.screenshot();
  const actualPng = PNG.sync.read(screenshot);

  const projectName = testInfo.project.name;
  const goldenDir = join('tests', 'browser', 'golden', projectName);
  const goldenPath = join(goldenDir, `${name}.png`);

  const shouldUpdate = testInfo.config.updateSnapshots === 'all';

  if (!existsSync(goldenPath) || shouldUpdate) {
    mkdirSync(goldenDir, { recursive: true });
    writeFileSync(goldenPath, screenshot);
    return;
  }

  const expectedPng = PNG.sync.read(readFileSync(goldenPath));

  if (actualPng.width !== expectedPng.width || actualPng.height !== expectedPng.height) {
    throw new Error(
      `Size mismatch: expected ${String(expectedPng.width)}x${String(expectedPng.height)}, got ${String(actualPng.width)}x${String(actualPng.height)}`,
    );
  }

  const { width, height } = actualPng;
  const diff = new PNG({ width, height });
  const numDiffPixels = pixelmatch(expectedPng.data, actualPng.data, diff.data, width, height, {
    threshold: 0.1,
  });

  const totalPixels = width * height;
  const diffRatio = numDiffPixels / totalPixels;

  if (diffRatio > 0.005) {
    // 0.5%
    const diffPath = join(testInfo.outputDir, `${name}-diff.png`);
    mkdirSync(testInfo.outputDir, { recursive: true });
    writeFileSync(diffPath, PNG.sync.write(diff));
    throw new Error(
      `Golden mismatch: ${String(numDiffPixels)} pixels differ (${(diffRatio * 100).toFixed(2)}%). Diff saved to ${diffPath}`,
    );
  }
}

/**
 * ユニット的な検証用ヘルパー
 */
export function compareImages(actual: Buffer, expected: Buffer): number {
  const actualPng = PNG.sync.read(actual);
  const expectedPng = PNG.sync.read(expected);
  const { width, height } = actualPng;
  const diff = new PNG({ width, height });
  return pixelmatch(expectedPng.data, actualPng.data, diff.data, width, height, { threshold: 0.1 });
}
