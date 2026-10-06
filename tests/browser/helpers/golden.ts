/**
 * @file ゴールデン画像の比較 (docs/10-testing-strategy.md §3.3)。
 * 256×256 の canvas を撮影し、`tests/browser/golden/<backend>/<name>.png` と pixelmatch で比べる。
 * ゴールデン画像が無いときは失敗し、作成・更新は `--update-snapshots` のときだけ行う。
 */
import { test, type Page } from '@playwright/test';
import { PNG } from 'pngjs';
import pixelmatch from 'pixelmatch';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';

/** ゴールデン画像の幅・高さ (px)。 */
export const GOLDEN_SIZE = 256;
/** pixelmatch の色差しきい値。 */
export const GOLDEN_THRESHOLD = 0.1;
/** 許容する差分ピクセルの割合 (0.5%)。 */
export const GOLDEN_MAX_DIFF_RATIO = 0.005;

/** Playwright の `updateSnapshots` の値。 */
export type GoldenUpdateMode = 'all' | 'changed' | 'missing' | 'none';

/** 比較結果。`missing` と `mismatch` は失敗。 */
export interface GoldenResult {
  /** 結果の種類。 */
  readonly status: 'match' | 'created' | 'updated' | 'missing' | 'mismatch';
  /** 差分ピクセル数 (比較しなかった場合は 0)。 */
  readonly diffPixels: number;
  /** 人が読む説明。 */
  readonly message: string;
}

/**
 * 2 枚の PNG の差分ピクセル数を数える (サイズは同じであること)。
 * @param actual 実際の画像
 * @param expected 期待画像
 * @param diffOut 差分画像の書き出し先 (省略可)
 * @returns 差分ピクセル数
 */
export function compareImages(actual: Buffer, expected: Buffer, diffOut?: PNG): number {
  const actualPng = PNG.sync.read(actual);
  const expectedPng = PNG.sync.read(expected);
  const { width, height } = actualPng;
  const diff = diffOut ?? new PNG({ width, height });
  return pixelmatch(expectedPng.data, actualPng.data, diff.data, width, height, {
    threshold: GOLDEN_THRESHOLD,
  });
}

/**
 * 画像をゴールデン画像と比べ、必要なら作成・更新する。
 * @param actual 撮影した PNG
 * @param goldenPath ゴールデン画像のパス
 * @param mode 更新モード (`none` 以外は作成を許可、`all` / `changed` は差分があれば上書き)
 * @param diffPath 不一致時に差分画像を書き出すパス
 * @returns 比較結果
 */
export function compareWithGolden(
  actual: Buffer,
  goldenPath: string,
  mode: GoldenUpdateMode,
  diffPath: string,
): GoldenResult {
  const write = (path: string, data: Buffer): void => {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, data);
  };
  if (!existsSync(goldenPath)) {
    if (mode === 'none') {
      return {
        status: 'missing',
        diffPixels: 0,
        message: `ゴールデン画像 ${goldenPath} がありません。差分を確認したうえで --update-snapshots で作成してください`,
      };
    }
    write(goldenPath, actual);
    return { status: 'created', diffPixels: 0, message: `${goldenPath} を作成しました` };
  }
  const canUpdate = mode === 'all' || mode === 'changed';
  const expected = readFileSync(goldenPath);
  const a = PNG.sync.read(actual);
  const e = PNG.sync.read(expected);
  if (a.width !== e.width || a.height !== e.height) {
    if (canUpdate) {
      write(goldenPath, actual);
      return {
        status: 'updated',
        diffPixels: 0,
        message: `${goldenPath} を更新しました (サイズ変更)`,
      };
    }
    const size = `${String(e.width)}x${String(e.height)} → ${String(a.width)}x${String(a.height)}`;
    return { status: 'mismatch', diffPixels: 0, message: `サイズが違います (${size})` };
  }
  const diff = new PNG({ width: a.width, height: a.height });
  const diffPixels = compareImages(actual, expected, diff);
  const ratio = diffPixels / (a.width * a.height);
  if (ratio <= GOLDEN_MAX_DIFF_RATIO && mode !== 'all') {
    return { status: 'match', diffPixels, message: '一致' };
  }
  if (canUpdate) {
    write(goldenPath, actual);
    return { status: 'updated', diffPixels, message: `${goldenPath} を更新しました` };
  }
  write(diffPath, PNG.sync.write(diff));
  const percent = (ratio * 100).toFixed(2);
  return {
    status: 'mismatch',
    diffPixels,
    message: `${String(diffPixels)} ピクセル (${percent}%) が異なります。差分画像: ${diffPath}`,
  };
}

/**
 * ハーネスの canvas を撮影し、ゴールデン画像と比べる。不一致・未作成なら例外。
 * @param page ハーネスを開いたページ
 * @param name ゴールデン画像名 (拡張子なし)
 */
export async function expectGolden(page: Page, name: string): Promise<void> {
  const info = test.info();
  const backend = await page.evaluate(() => window.__pluto?.backend);
  if (backend === undefined) throw new Error('ハーネスが読み込まれていません');
  const shot = await page.locator('#pluto-canvas').screenshot();
  const png = PNG.sync.read(shot);
  if (png.width !== GOLDEN_SIZE || png.height !== GOLDEN_SIZE) {
    throw new Error(`canvas は ${String(GOLDEN_SIZE)}x${String(GOLDEN_SIZE)} でなければなりません`);
  }
  const goldenPath = join('tests', 'browser', 'golden', backend, `${name}.png`);
  const result = compareWithGolden(
    shot,
    goldenPath,
    info.config.updateSnapshots,
    join(info.outputDir, `${name}-diff.png`),
  );
  if (result.status === 'missing' || result.status === 'mismatch') throw new Error(result.message);
}
