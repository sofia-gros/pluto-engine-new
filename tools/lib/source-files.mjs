/**
 * @file ソースファイル列挙の共通関数。パスは常に `/` 区切りで返す。
 */
import { readdirSync, existsSync, statSync } from 'node:fs';
import { join } from 'node:path';

/** 列挙で常に無視するディレクトリ名。 */
const IGNORED_DIRS = new Set(['node_modules', 'dist', 'coverage', 'results', '.git']);

/**
 * ディレクトリ以下の全ファイルを再帰的に列挙する。
 * @param {string} dir 起点ディレクトリ
 * @returns {string[]}
 */
export function getAllFiles(dir) {
  if (!existsSync(dir)) return [];
  const results = [];
  for (const name of readdirSync(dir)) {
    const filePath = join(dir, name).replace(/\\/g, '/');
    if (statSync(filePath).isDirectory()) {
      if (!IGNORED_DIRS.has(name)) results.push(...getAllFiles(filePath));
    } else {
      results.push(filePath);
    }
  }
  return results.sort();
}

/**
 * ディレクトリ以下のソースファイルを列挙する。
 * @param {string} [dir] 起点ディレクトリ (既定 `src`)
 * @param {readonly string[]} [exts] 対象拡張子 (既定 `.ts`)
 * @returns {string[]}
 */
export function getSourceFiles(dir = 'src', exts = ['.ts']) {
  return getAllFiles(dir).filter((f) => exts.some((e) => f.endsWith(e)));
}
