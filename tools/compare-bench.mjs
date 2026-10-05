import { readFileSync, existsSync } from 'node:fs';

function compareBench() {
  if (!existsSync('bench/baseline.json')) {
    console.log('ベースラインなし');
    process.exit(0);
  }
  const baselineStr = readFileSync('bench/baseline.json', 'utf8');
  let baseline;
  try {
    baseline = JSON.parse(baselineStr);
  } catch {
    console.log('ベースラインが不正です');
    process.exit(0);
  }

  if (!Array.isArray(baseline) || baseline.length === 0) {
    console.log('ベースラインなし');
    process.exit(0);
  }

  if (!existsSync('bench/results/latest.json')) {
    console.error('latest.json がありません');
    process.exit(1);
  }
  const latest = JSON.parse(readFileSync('bench/results/latest.json', 'utf8'));

  const base = baseline.find(
    (b) =>
      b.scene === latest.scene &&
      b.backend === latest.backend &&
      b.build === latest.build &&
      b.count === latest.count,
  );

  if (!base) {
    console.log('一致するベースラインなし');
    process.exit(0);
  }

  const diffRatio = (latest.p99Ms - base.p99Ms) / base.p99Ms;
  console.log(
    `p99: ${base.p99Ms.toFixed(2)}ms -> ${latest.p99Ms.toFixed(2)}ms (${(diffRatio * 100).toFixed(2)}%)`,
  );

  if (diffRatio > 0.1) {
    console.error('10% を超えて悪化しています');
    process.exit(1);
  }
}

compareBench();
