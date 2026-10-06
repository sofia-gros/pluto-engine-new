import { test, expect } from '../helpers/harness-test';
import { PNG } from 'pngjs';
import { existsSync, mkdirSync, mkdtempSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { compareImages, compareWithGolden } from '../helpers/golden';

/**
 * 単色の PNG を作る。
 * @param size 一辺の長さ
 * @param redAt 赤くするピクセル番号 (-1 なら全面黒)
 * @returns PNG のバイト列
 */
function makePng(size: number, redAt = -1): Buffer {
  const img = new PNG({ width: size, height: size });
  for (let i = 0; i < size * size; i++) {
    img.data[i * 4] = i === redAt ? 255 : 0;
    img.data[i * 4 + 1] = 0;
    img.data[i * 4 + 2] = 0;
    img.data[i * 4 + 3] = 255;
  }
  return PNG.sync.write(img);
}

/**
 * テストごとの一時ディレクトリを作る。
 * @returns ディレクトリのパス
 */
function tempDir(): string {
  const out = test.info().outputDir;
  mkdirSync(out, { recursive: true });
  return mkdtempSync(join(out, 'golden-'));
}

test.describe('ゴールデン画像ヘルパ (10 §3.3)', () => {
  test('同一画像は差分 0、1px の違いを検出できる', () => {
    expect(compareImages(makePng(2), makePng(2))).toBe(0);
    expect(compareImages(makePng(2, 0), makePng(2))).toBe(1);
  });

  test('ゴールデン画像が無いと失敗し、ファイルを作らない', () => {
    const dir = tempDir();
    const path = join(dir, 'webgl2', 'a.png');
    const r = compareWithGolden(makePng(4), path, 'none', join(dir, 'diff.png'));
    expect(r.status).toBe('missing');
    expect(existsSync(path)).toBe(false);
  });

  test('--update-snapshots (changed) でゴールデン画像を作成・更新する', () => {
    const dir = tempDir();
    const path = join(dir, 'webgl2', 'a.png');
    expect(compareWithGolden(makePng(4), path, 'changed', join(dir, 'd.png')).status).toBe(
      'created',
    );
    expect(compareWithGolden(makePng(4), path, 'none', join(dir, 'd.png')).status).toBe('match');
    const changed = makePng(4, 3);
    expect(compareWithGolden(changed, path, 'changed', join(dir, 'd.png')).status).toBe('updated');
    expect(readFileSync(path).equals(changed)).toBe(true);
  });

  test('0.5% を超える差分は失敗し、差分画像を書き出す', () => {
    const dir = tempDir();
    const path = join(dir, 'webgl2', 'a.png');
    compareWithGolden(makePng(4), path, 'changed', join(dir, 'd.png'));
    const r = compareWithGolden(makePng(4, 0), path, 'none', join(dir, 'd.png'));
    expect(r.status).toBe('mismatch');
    expect(r.diffPixels).toBe(1);
    expect(existsSync(join(dir, 'd.png'))).toBe(true);
  });
});
