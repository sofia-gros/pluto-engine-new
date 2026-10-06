/**
 * @file モジュール依存境界の検査 (.agents/rules/03-architecture.md)。
 * 1. 依存表にない import を禁止
 * 2. 他モジュールは index.ts 経由でのみ import
 * 3. 封印ルール (rhi バックエンド・threaded-scheduler・worker-main・runWorkerLoop・?raw)
 * 4. src/ から src/ 外 (tests/bench/examples/tools) やパッケージを import しない
 * 5. 値の import の循環を禁止 (import type は除外)
 */
import { existsSync } from 'node:fs';
import { dirname, join, normalize } from 'node:path';
import { getSourceFiles } from './lib/source-files.mjs';
import { getImports, parseFile } from './lib/ts-source.mjs';
import { loadDependencyTable, moduleOf } from './lib/rule-tables.mjs';

const table = loadDependencyTable();
const files = getSourceFiles('src');
const errors = [];
/** @type {Map<string, string[]>} 値 import のグラフ */
const graph = new Map();

/**
 * import 指定子を src 内のファイルパスに解決する。
 * @param {string} from 取り込み元
 * @param {string} spec クエリを除いた指定子
 * @returns {string | null}
 */
function resolve(from, spec) {
  const base = normalize(join(dirname(from), spec)).replace(/\\/g, '/');
  for (const cand of [`${base}.ts`, `${base}/index.ts`, base]) {
    if (existsSync(cand) && cand.endsWith('.ts')) return cand;
  }
  if (/\.(wgsl|glsl)$/.test(base) && existsSync(base)) return base;
  return null;
}

/**
 * モジュールのディレクトリ (index.ts の置き場所) を返す。
 * @param {string} mod
 * @returns {string}
 */
function moduleDir(mod) {
  return `src/${mod}`;
}

for (const file of files) {
  const fromMod = moduleOf(file);
  const { sf } = parseFile(file);
  const edges = [];
  for (const imp of getImports(sf)) {
    const where = `${file}:${imp.line}`;
    const [spec, query] = imp.spec.split('?');
    if (!spec.startsWith('.')) {
      errors.push(`${where}: パッケージ '${imp.spec}' の import は禁止 (ランタイム依存ゼロ)`);
      continue;
    }
    const target = resolve(file, spec);
    if (target === null || !target.startsWith('src/')) {
      errors.push(`${where}: '${imp.spec}' は src/ 内のファイルに解決できません`);
      continue;
    }
    const isWorkerImport = query !== undefined && query.startsWith('worker');
    if (
      query === 'raw' &&
      !(file.startsWith('src/shaders/') && target.startsWith('src/shaders/'))
    ) {
      errors.push(`${where}: ?raw の import は src/shaders/ 内部のみ許可`);
    }
    // 封印ルール
    if (target === 'src/worker-main.ts') {
      if (!(file === 'src/jobs/threaded-scheduler.ts' && isWorkerImport)) {
        errors.push(
          `${where}: worker-main は jobs/threaded-scheduler.ts から ?worker&inline でのみ import できます`,
        );
      }
      continue; // 別バンドルなので依存表・循環の対象外
    }
    if (isWorkerImport) {
      errors.push(`${where}: ?worker の import 先は src/worker-main.ts のみ`);
      continue;
    }
    if (target === 'src/jobs/threaded-scheduler.ts' && file !== 'src/jobs/create-scheduler.ts') {
      errors.push(
        `${where}: threaded-scheduler は jobs/create-scheduler.ts からのみ import できます`,
      );
    }
    if (/^src\/rhi\/(webgpu|webgl2)\//.test(target) && !file.startsWith('src/rhi/')) {
      errors.push(`${where}: rhi のバックエンド実装は rhi/ 内部からのみ import できます`);
    }
    if (
      imp.names.includes('runWorkerLoop') &&
      file !== 'src/worker-main.ts' &&
      !file.startsWith('src/jobs/')
    ) {
      errors.push(`${where}: runWorkerLoop は src/worker-main.ts からのみ使えます`);
    }
    const toMod = moduleOf(target);
    if (toMod !== fromMod) {
      const allowed = table.get(fromMod ?? '');
      if (allowed === undefined) {
        errors.push(`${where}: モジュール '${fromMod}' が依存表にありません`);
      } else if (allowed !== 'all' && !allowed.has(toMod ?? '')) {
        errors.push(`${where}: '${fromMod}' から '${toMod}' への import は依存表で禁止`);
      }
      if (
        toMod !== null &&
        !toMod.startsWith('entry:') &&
        target !== `${moduleDir(toMod)}/index.ts`
      ) {
        errors.push(
          `${where}: 他モジュール '${toMod}' は index.ts 経由で import すること ('${imp.spec}')`,
        );
      }
    }
    if (!imp.isTypeOnly && target.endsWith('.ts')) edges.push(target);
  }
  graph.set(file, edges);
}

// 循環 (値 import のみ)
const state = new Map();
const stack = [];
const reported = new Set();
/**
 * 深さ優先探索で循環を探す。
 * @param {string} node
 */
function dfs(node) {
  state.set(node, 1);
  stack.push(node);
  for (const next of graph.get(node) ?? []) {
    if (state.get(next) === 1) {
      const cycle = [...stack.slice(stack.indexOf(next)), next];
      const key = [...cycle].sort().join('|');
      if (!reported.has(key)) {
        reported.add(key);
        errors.push(`循環 import: ${cycle.join(' -> ')}`);
      }
    } else if (state.get(next) === undefined) {
      dfs(next);
    }
  }
  stack.pop();
  state.set(node, 2);
}
for (const f of graph.keys()) if (state.get(f) === undefined) dfs(f);

if (errors.length > 0) {
  for (const e of errors) console.error(`[ERROR] ${e}`);
  console.error(`check-boundaries: ${errors.length} 件の違反`);
  process.exit(1);
}
console.log('check-boundaries: OK');
