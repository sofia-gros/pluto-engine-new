import { chromium } from '@playwright/test';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { createServer } from 'vite';

async function runBench() {
  const args = process.argv.slice(2);
  const sceneIdx = args.indexOf('--scene');
  const sceneName = sceneIdx !== -1 ? args[sceneIdx + 1] : 'empty';

  console.log(`Running bench for scene: ${sceneName}`);

  const server = await createServer({
    server: { port: 5174 },
    configFile: false, // avoid picking up our vite.config.ts if it does things that break
    define: {
      __DEBUG__: 'false',
      __PARALLEL__: 'false',
      __VERSION__: '"bench"',
    },
  });
  await server.listen();

  const browser = await chromium.launch({ headless: false });
  const page = await browser.newPage();
  page.on('console', (msg) => console.log('BROWSER:', msg.text()));

  await page.goto(`http://localhost:5174/bench/runner.html?scene=${sceneName}`);

  const resultHandle = await page.waitForFunction(
    () => {
      return window.__benchResult;
    },
    { timeout: 60000 },
  );

  const resultObj = await resultHandle.jsonValue();

  await browser.close();
  await server.close();

  const outDir = 'bench/results';
  if (!existsSync(outDir)) {
    mkdirSync(outDir, { recursive: true });
  }
  writeFileSync(`${outDir}/latest.json`, JSON.stringify(resultObj, null, 2));
  console.log('Saved bench/results/latest.json');
}

runBench().catch((err) => {
  console.error(err);
  process.exit(1);
});
