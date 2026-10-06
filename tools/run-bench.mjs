/**
 * @file ベンチマークの実行 (docs/10-testing-strategy.md §5)。
 * 使い方: node tools/run-bench.mjs [--scene <name|all>] [--count <n>] [--backend webgpu|webgl2] [--build parallel|embed] [--headless] [--no-compare]
 * 保存後に tools/compare-bench.mjs でベースラインと比較する (`--no-compare` で省略)。
 * プロジェクトの vite.config.ts で Vite サーバーを起動し、`--build` に合わせて define を上書きする (__DEBUG__ = false)。
 * Chromium は headed・vsync 解除・WebGPU 有効で起動する。`--headless` は機能確認用で、その数値は性能判断に使わない。
 */
import { chromium } from '@playwright/test';
import { createServer } from 'vite';
import { mkdirSync, readdirSync, writeFileSync } from 'node:fs';
import { spawnSync } from 'node:child_process';

/** 計測 1 シーンあたりの待ち時間の上限 (ms)。 */
const SCENE_TIMEOUT_MS = 180_000;

/**
 * 引数を読む。
 * @param {string[]} argv
 * @returns {{ scene: string, count: number | null, backend: string, build: string, headless: boolean }}
 */
function parseArgs(argv) {
  const get = (name, fallback) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && i + 1 < argv.length ? argv[i + 1] : fallback;
  };
  const opts = {
    scene: get('scene', 'all'),
    count: get('count', null) === null ? null : Number(get('count', '0')),
    backend: get('backend', 'webgpu'),
    build: get('build', 'embed'),
    headless: argv.includes('--headless'),
  };
  if (!['webgpu', 'webgl2'].includes(opts.backend))
    throw new Error(`--backend は webgpu | webgl2: ${opts.backend}`);
  if (!['parallel', 'embed'].includes(opts.build))
    throw new Error(`--build は parallel | embed: ${opts.build}`);
  if (opts.count !== null && !(Number.isInteger(opts.count) && opts.count >= 0))
    throw new Error('--count は 0 以上の整数');
  return opts;
}

/**
 * 計測するシーン名の一覧。
 * @param {string} scene
 * @returns {string[]}
 */
function sceneNames(scene) {
  if (scene !== 'all') return [scene];
  return readdirSync('bench/scenes')
    .filter((f) => f.endsWith('.ts'))
    .map((f) => f.slice(0, -3))
    .sort();
}

/**
 * メイン処理。
 */
async function main() {
  const opts = parseArgs(process.argv.slice(2));
  const isParallel = opts.build === 'parallel';
  const server = await createServer({
    configFile: 'vite.config.ts',
    mode: opts.build,
    logLevel: 'warn',
    server: { port: 5174, strictPort: true },
    define: {
      __PARALLEL__: JSON.stringify(isParallel),
      __DEBUG__: 'false',
    },
  });
  await server.listen();
  const browser = await chromium.launch({
    headless: opts.headless,
    args: [
      '--enable-unsafe-webgpu',
      '--enable-features=Vulkan',
      '--disable-gpu-vsync',
      '--disable-frame-rate-limit',
    ],
  });
  const results = [];
  let hasError = false;
  try {
    for (const name of sceneNames(opts.scene)) {
      const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });
      const query = new URLSearchParams({ scene: name, backend: opts.backend });
      if (opts.count !== null) query.set('count', String(opts.count));
      await page.goto(`http://localhost:5174/bench/runner.html?${query.toString()}`);
      const handle = await page.waitForFunction(
        () =>
          globalThis.__benchResult ??
          (globalThis.__benchError === undefined ? null : { error: globalThis.__benchError }),
        undefined,
        { timeout: SCENE_TIMEOUT_MS },
      );
      const result = await handle.jsonValue();
      await page.close();
      if (result.error !== undefined) {
        console.error(`[ERROR] ${name}: ${result.error}`);
        hasError = true;
        continue;
      }
      if (result.build !== opts.build) {
        console.error(
          `[ERROR] ${name}: ビルドが一致しません (要求 ${opts.build}, 実際 ${result.build})`,
        );
        hasError = true;
      }
      console.log(
        `${name}: p50 ${result.p50Ms.toFixed(3)}ms / p99 ${result.p99Ms.toFixed(3)}ms / cpu ${result.cpuMs.toFixed(3)}ms ${JSON.stringify(result.metrics)}`,
      );
      results.push(result);
    }
  } finally {
    await browser.close();
    await server.close();
  }
  mkdirSync('bench/results', { recursive: true });
  writeFileSync('bench/results/latest.json', `${JSON.stringify(results, null, 2)}\n`);
  console.log(`bench/results/latest.json に ${results.length} 件を保存しました`);
  if (opts.headless)
    console.log(
      '注意: --headless の数値は機能確認用です。性能判断・ベースラインには使わないでください。',
    );
  if (hasError) process.exit(1);
  // ベースラインとの比較 (pnpm bench の引数はこのスクリプトに渡るので、比較はここから呼ぶ)
  if (!process.argv.includes('--no-compare')) {
    const compare = spawnSync(process.execPath, ['tools/compare-bench.mjs'], { stdio: 'inherit' });
    process.exit(compare.status ?? 1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
