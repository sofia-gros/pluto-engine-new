import type { BenchResult, BenchScene } from './bench-types';
import { scene as emptyScene } from './scenes/empty';
import { scene as ecsMoveScene } from './scenes/ecs-move';

const scenes: Record<string, BenchScene> = {
  empty: emptyScene,
  'ecs-move': ecsMoveScene,
};

const params = new URLSearchParams(window.location.search);
const sceneName = params.get('scene') ?? 'empty';
const count = parseInt(params.get('count') ?? '0', 10);
const backend = params.get('backend') ?? 'webgl2';
const build = params.get('build') ?? 'embed';

declare global {
  interface Window {
    __benchResult?: BenchResult;
  }
}

async function run(): Promise<void> {
  const scene = scenes[sceneName] as BenchScene | undefined;
  if (!scene) {
    throw new Error(`Scene not found: ${sceneName}`);
  }

  const activeScene: BenchScene = scene;

  // mock game object for now
  await activeScene.setup({}, count);

  const WARMUP = 120;
  const MEASURE = 600;
  let frame = 0;
  const times: number[] = [];

  let lastTime = performance.now();

  function loop(): void {
    const now = performance.now();
    const dt = now - lastTime;
    lastTime = now;

    if (activeScene.step) {
      activeScene.step(frame);
    }

    if (frame >= WARMUP) {
      times.push(dt);
    }

    frame++;

    if (frame < WARMUP + MEASURE) {
      requestAnimationFrame(loop);
    } else {
      finish(times);
    }
  }

  requestAnimationFrame(loop);
}

function finish(times: number[]): void {
  times.sort((a, b) => a - b);
  const sum = times.reduce((a, b) => a + b, 0);
  const meanMs = sum / times.length;
  const p50Ms = times[Math.floor(times.length * 0.5)] ?? 0;
  const p99Ms = times[Math.floor(times.length * 0.99)] ?? 0;

  window.__benchResult = {
    scene: sceneName,
    backend,
    build,
    count,
    meanMs,
    p50Ms,
    p99Ms,
  };
}

void run();
