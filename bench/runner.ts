/**
 * @file ベンチマークページ。URL の `scene` / `count` / `backend` を読み、ウォームアップ 120 フレーム後に 600 フレーム計測する
 * (docs/10-testing-strategy.md §5)。シーンは `import.meta.glob` で動的に読み込む。
 */
import type { BenchBackend, BenchContext, BenchResult, BenchScene } from './bench-types';

/**
 * ウォームアップのフレーム数。GC と JIT の最適化が落ち着くように長めに取る。
 */
const WARMUP_FRAMES = 300;
/** 計測するフレーム数。 */
const MEASURE_FRAMES = 600;

declare global {
  interface Window {
    /** 計測結果 (run-bench.mjs が読む)。 */
    __benchResult?: BenchResult;
    /** 失敗時のメッセージ。 */
    __benchError?: string;
  }
}

/**
 * 昇順ソート済み配列のパーセンタイル (index = ceil(p × n) - 1)。
 * @param sorted ソート済みの値
 * @param p 0〜1
 * @returns 値 (空なら 0)
 */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const index = Math.min(sorted.length - 1, Math.max(0, Math.ceil(p * sorted.length) - 1));
  return sorted[index];
}

/**
 * 未ソートの値のパーセンタイルを返す (index = ceil(p × n) - 1)。
 * @param values 値
 * @param p 0〜1
 * @returns パーセンタイル
 */
function percentileOf(values: readonly number[], p: number): number {
  return percentile(
    [...values].sort((a, b) => a - b),
    p,
  );
}

/**
 * シーンを読み込む。
 * @param name シーン名
 * @returns シーン
 */
async function loadScene(name: string): Promise<BenchScene> {
  const modules = import.meta.glob<{ scene: BenchScene }>('./scenes/*.ts');
  const key = `./scenes/${name}.ts`;
  if (!Object.hasOwn(modules, key)) throw new Error(`シーン '${name}' がありません`);
  return (await modules[key]()).scene;
}

/**
 * 計測を実行して window.__benchResult に結果を置く。
 */
async function run(): Promise<void> {
  const params = new URLSearchParams(window.location.search);
  const sceneName = params.get('scene') ?? 'empty';
  const backend: BenchBackend = params.get('backend') === 'webgl2' ? 'webgl2' : 'webgpu';
  const scene = await loadScene(sceneName);
  const countParam = params.get('count');
  const count = countParam === null ? scene.defaultCount : Number(countParam);
  const canvas = document.createElement('canvas');
  canvas.width = 1920;
  canvas.height = 1080;
  document.body.appendChild(canvas);
  const samples = new Map<string, number[]>();
  const metrics: Record<string, number> = {};
  const ctx: BenchContext = {
    backend,
    build: __PARALLEL__ ? 'parallel' : 'embed',
    canvas,
    metrics,
    sample(name, ms) {
      const list = samples.get(name) ?? [];
      list.push(ms);
      samples.set(name, list);
    },
    now: () => performance.now(),
  };
  await scene.setup(ctx, count);
  const frameTimes: number[] = [];
  const cpuTimes: number[] = [];
  let frame = 0;
  let last = performance.now();
  await new Promise<void>((resolve) => {
    const loop = (now: number): void => {
      const t0 = performance.now();
      scene.step?.(frame);
      const cpu = performance.now() - t0;
      if (frame >= WARMUP_FRAMES) {
        frameTimes.push(now - last);
        cpuTimes.push(cpu);
      }
      last = now;
      frame++;
      if (frame < WARMUP_FRAMES + MEASURE_FRAMES) requestAnimationFrame(loop);
      else resolve();
    };
    requestAnimationFrame(loop);
  });
  for (const [name, values] of samples) {
    metrics[`${name}P50Ms`] = percentileOf(values, 0.5);
    metrics[`${name}P99Ms`] = percentileOf(values, 0.99);
  }
  const sortedFrames = [...frameTimes].sort((a, b) => a - b);
  window.__benchResult = {
    scene: sceneName,
    backend,
    build: ctx.build,
    count,
    crossOriginIsolated: window.crossOriginIsolated,
    meanMs: frameTimes.reduce((a, b) => a + b, 0) / frameTimes.length,
    p50Ms: percentile(sortedFrames, 0.5),
    p99Ms: percentile(sortedFrames, 0.99),
    cpuMs: percentileOf(cpuTimes, 0.99),
    cpuP50Ms: percentileOf(cpuTimes, 0.5),
    metrics,
  };
}

run().catch((err: unknown) => {
  window.__benchError = err instanceof Error ? err.message : String(err);
});
