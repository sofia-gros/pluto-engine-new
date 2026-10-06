/**
 * @file ビルド成果物の検査 (docs/11-build-and-release.md §6)。
 * embed には Worker / SharedArrayBuffer / Atomics.wait が含まれず、
 * parallel には Worker の待機処理 (Atomics.wait または Atomics.waitAsync) がインライン化されていること。
 * parallel 側の対象は lowlevel エントリである (docs/02 §2: src/index.ts は scene の re-export のみで、
 * scene は T-5.1 まで存在しないため、Worker は lowlevel 経由で bundle に入る)。
 */
import { readFileSync, existsSync } from 'node:fs';

const errors = [];

/**
 * 成果物を読む。無ければエラーを記録する。
 * @param {string} file
 * @returns {string | null}
 */
function read(file) {
  if (!existsSync(file)) {
    errors.push(`${file} がありません (pnpm build を先に実行)`);
    return null;
  }
  return readFileSync(file, 'utf8');
}

for (const file of ['dist/embed/pluto.js', 'dist/embed/pluto.debug.js']) {
  const content = read(file);
  if (content === null) continue;
  for (const word of ['SharedArrayBuffer', 'new Worker', 'Atomics.wait']) {
    if (content.includes(word)) errors.push(`${file}: embed ビルドに '${word}' が含まれています`);
  }
}
for (const file of ['dist/parallel/pluto-lowlevel.js', 'dist/parallel/pluto-lowlevel.debug.js']) {
  const content = read(file);
  if (content === null) continue;
  if (!content.includes('Atomics.wait')) {
    errors.push(
      `${file}: parallel ビルドに Worker (Atomics.wait / Atomics.waitAsync) が含まれていません`,
    );
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`[ERROR] ${e}`);
  process.exit(1);
}
console.log('check-bundle: OK');
