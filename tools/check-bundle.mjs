/**
 * @file ビルド成果物の検査 (docs/11-build-and-release.md §6)。
 * embed には Worker / SharedArrayBuffer / Atomics.wait が含まれず、
 * parallel には Worker の待機処理 (Atomics.wait または Atomics.waitAsync) がインライン化されていること。
 * parallel 側はエントリ間で共有チャンクに分割されるため、dist/parallel/ 全体を走査する
 * (T-5.1 で scene が jobs を引くようになり、Worker 実体が共有チャンクに入る)。
 */
import { readFileSync, existsSync, readdirSync } from 'node:fs';

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

// parallel はエントリ間でコード分割されるため、ディレクトリ全体を走査する。
// (共有チャンク内の Atomics.or / Atomics.add はカーネルの dirty マーク用で、
// serial でも同じコードを使う設計のため正常。Worker 混入の判定は new Worker で行う)
const parallelFiles = readdirSync('dist/parallel')
  .filter((name) => name.endsWith('.js'))
  .map((name) => `dist/parallel/${name}`);
{
  const hasWorker = parallelFiles.some((file) => {
    const content = read(file);
    return content !== null && content.includes('new Worker');
  });
  const hasWait = parallelFiles.some((file) => {
    const content = read(file);
    return content !== null && content.includes('Atomics.wait');
  });
  if (!hasWorker) {
    errors.push('dist/parallel/: parallel ビルドに Worker (new Worker) が含まれていません');
  }
  if (!hasWait) {
    errors.push(
      'dist/parallel/: parallel ビルドに Worker (Atomics.wait / Atomics.waitAsync) が含まれていません',
    );
  }
}

if (errors.length > 0) {
  for (const e of errors) console.error(`[ERROR] ${e}`);
  process.exit(1);
}
console.log('check-bundle: OK');
