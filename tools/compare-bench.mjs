/**
 * @file 計測結果とベースラインの比較 (docs/10-testing-strategy.md §5)。
 * (scene, backend, build, count) が一致する要素同士で、cpuP50Ms・metrics の `*Ms` を比べ、10% を超える悪化で exit 1。
 * 判定は中央値 (p50) で行う (docs/04 §10)。p99 は GC と OS スケジューラのジッタで ±20% 揺れるため、
 * 参考値として表示するが判定には使わない。
 */
import { existsSync, readFileSync } from 'node:fs';

/** 許容する悪化率。 */
const MAX_REGRESSION = 0.1;

/**
 * JSON の配列を読む。無い・不正・配列でなければ例外。
 * @param {string} path
 * @returns {object[]}
 */
function readArray(path) {
  const value = JSON.parse(readFileSync(path, 'utf8'));
  if (!Array.isArray(value)) throw new Error(`${path} は BenchResult の配列ではありません`);
  return value;
}

/**
 * 比較する値の一覧 (名前 → ms)。判定に使うのは p50 のみ。
 * @param {Record<string, unknown>} r
 * @returns {Map<string, number>}
 */
function comparableValues(r) {
  const out = new Map([['cpuP50Ms', r.cpuP50Ms]]);
  for (const [k, v] of Object.entries(r.metrics ?? {}))
    if (k.endsWith('P50Ms')) out.set(`metrics.${k}`, v);
  return out;
}

/**
 * 参考値として表示するが判定には使わない値の一覧 (名前 → ms)。
 * @param {Record<string, unknown>} r
 * @returns {Map<string, number>}
 */
function referenceValues(r) {
  const out = new Map([
    ['p99Ms', r.p99Ms],
    ['cpuMs', r.cpuMs],
  ]);
  for (const [k, v] of Object.entries(r.metrics ?? {}))
    if (k.endsWith('P99Ms')) out.set(`metrics.${k}`, v);
  return out;
}

/**
 * メイン処理。
 * @returns {number} 終了コード
 */
function main() {
  let baseline;
  let latest;
  try {
    baseline = existsSync('bench/baseline.json') ? readArray('bench/baseline.json') : [];
    latest = readArray('bench/results/latest.json');
  } catch (err) {
    console.error(`[ERROR] ${err instanceof Error ? err.message : String(err)}`);
    return 1;
  }
  if (baseline.length === 0) {
    console.log('ベースラインなし (比較しません)');
    return 0;
  }
  let hasRegression = false;
  for (const r of latest) {
    const key = `${r.scene} / ${r.backend} / ${r.build} / count=${r.count}`;
    const base = baseline.find(
      (b) =>
        b.scene === r.scene &&
        b.backend === r.backend &&
        b.build === r.build &&
        b.count === r.count,
    );
    if (base === undefined) {
      console.log(`${key}: 新規 (ベースラインに未登録)`);
      continue;
    }
    const baseValues = comparableValues(base);
    const baseReference = referenceValues(base);
    for (const [name, value] of comparableValues(r)) {
      const before = baseValues.get(name);
      if (typeof before !== 'number' || typeof value !== 'number' || before <= 0) continue;
      const ratio = (value - before) / before;
      const line = `${key}: ${name} ${before.toFixed(3)}ms -> ${value.toFixed(3)}ms (${(ratio * 100).toFixed(1)}%)`;
      if (ratio > MAX_REGRESSION) {
        console.error(`[悪化] ${line}`);
        hasRegression = true;
      } else {
        console.log(line);
      }
    }
    for (const [name, value] of referenceValues(r)) {
      const before = baseReference.get(name);
      if (typeof before !== 'number' || typeof value !== 'number' || before <= 0) continue;
      const ratio = ((value - before) / before) * 100;
      console.log(
        `${key}: ${name} ${before.toFixed(3)}ms -> ${value.toFixed(3)}ms (${ratio.toFixed(1)}%) [参考値]`,
      );
    }
  }
  if (hasRegression) console.error('10% を超えて悪化した項目があります');
  return hasRegression ? 1 : 0;
}

process.exit(main());
