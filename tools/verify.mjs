/**
 * @file 全静的検査を順に実行し、最後に要約表を表示する (docs/11-build-and-release.md §3)。
 * すべての段階を実行し、1 つでも失敗したら非 0 で終了する。
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';

const STEPS = [
  'check:structure',
  'check:boundaries',
  'check:rules',
  'typecheck',
  'lint',
  'format:check',
  'test:coverage',
];

const scripts = existsSync('package.json')
  ? (JSON.parse(readFileSync('package.json', 'utf8')).scripts ?? {})
  : {};
const results = [];
for (const step of STEPS) {
  if (scripts[step] === undefined) {
    results.push([step, 'スキップ (未作成)']);
    continue;
  }
  console.log(`\n--- pnpm ${step} ---`);
  const r = spawnSync('pnpm', [step], { stdio: 'inherit', shell: process.platform === 'win32' });
  results.push([step, r.status === 0 ? '成功' : `失敗 (exit ${r.status ?? 'signal'})`]);
}

console.log('\n## pnpm verify 要約\n');
console.log('| 段階 | 結果 |');
console.log('| ---- | ---- |');
for (const [step, result] of results) console.log(`| ${step} | ${result} |`);
const failed = results.filter(([, r]) => r.startsWith('失敗')).length;
console.log(failed === 0 ? '\nverify: すべて成功' : `\nverify: ${failed} 段階が失敗`);
process.exit(failed === 0 ? 0 : 1);
