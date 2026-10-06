/**
 * @file SerialScheduler と ThreadedScheduler のパリティ検証 (docs/05-jobs-and-builds.md §3.4、docs/10-testing-strategy.md §4)。
 * 100 万エンティティを実際に動かして、ビット一致・ジョブ競合・例外伝播を検証する。
 * テスト用 Worker は createWorker の注入で差し替える (docs/05-jobs-and-builds.md §3.3)。
 */
import { expect, test } from '../helpers/harness-test';
import type { FieldToken, Query, World } from '../../../src/core/ecs';
import type { Scheduler } from '../../../src/jobs';

/** カーネル 1 の計算結果を合計した値 (float32 の加算なので順序が違えば差が出る)。 */
interface ParityTotals {
  /** 直列スケジュラの合計。 */
  readonly serialTotal: number;
  /** 並列スケジュラの合計。 */
  readonly threadedTotal: number;
}

test.describe('スケジューラ選択とパリティ (T-2.3)', () => {
  test('並列と直列が 100 万エンティティでビット一致する', async ({ page, plutoBackend }) => {
    await page.goto(`/tests/browser/fixtures/harness.html?backend=${plutoBackend}&build=src`);

    const outcome = (await page.evaluate(async () => {
      const ecs = await import('../../../src/core/ecs');
      const { SerialScheduler } = await import('../../../src/jobs/serial-scheduler');
      const { ThreadedScheduler } = await import('../../../src/jobs/threaded-scheduler');
      const fixtures = await import('../fixtures/parity-kernels');

      const COUNT = 1_000_000;
      const createWorker = (): Worker =>
        new Worker('/tests/browser/fixtures/parity-worker.ts', { type: 'module' });

      const buildWorld = (scheduler: Scheduler): World => {
        const world = new ecs.World();
        world.setExecutor(scheduler);
        world.addSystem({
          name: 'ParityMove',
          phase: ecs.Phase.Update,
          query: { all: [fixtures.ComponentA, fixtures.ComponentB] },
          kernel: fixtures.parityKernel1,
          writes: [fixtures.ComponentB],
        });
        for (let i = 0; i < COUNT; i++) {
          const e = world.spawn(fixtures.ComponentA, fixtures.ComponentB);
          world.set(e, fixtures.ComponentA.value1, i);
          world.set(e, fixtures.ComponentA.value2, i);
          world.flush();
        }
        return world;
      };

      const readTotal = (query: Query, field: FieldToken): number => {
        let sum = 0;
        query.forEachChunk((view) => {
          const column = view.column(field);
          for (let i = view.start; i < view.end; i++) sum += column[i];
        });
        return sum;
      };

      const serial = new SerialScheduler();
      const serialWorld = buildWorld(serial);
      const threaded = new ThreadedScheduler({ maxWorkers: 3, createWorker });
      const threadedWorld = buildWorld(threaded);

      serialWorld.runPhase(ecs.Phase.Update, 0.5);
      threadedWorld.runPhase(ecs.Phase.Update, 0.5);

      const result: ParityTotals = {
        serialTotal: readTotal(
          serialWorld.query({ all: [fixtures.ComponentB] }),
          fixtures.ComponentB.result,
        ),
        threadedTotal: readTotal(
          threadedWorld.query({ all: [fixtures.ComponentB] }),
          fixtures.ComponentB.result,
        ),
      };
      threaded.dispose();
      return result;
    })) satisfies ParityTotals;

    expect(outcome.threadedTotal).toBe(outcome.serialTotal);
  });

  test('2 つのカーネルを交互に 1000 回回しても Serial と一致する', async ({
    page,
    plutoBackend,
  }) => {
    await page.goto(`/tests/browser/fixtures/harness.html?backend=${plutoBackend}&build=src`);

    const outcome = (await page.evaluate(async () => {
      const ecs = await import('../../../src/core/ecs');
      const { SerialScheduler } = await import('../../../src/jobs/serial-scheduler');
      const { ThreadedScheduler } = await import('../../../src/jobs/threaded-scheduler');
      const fixtures = await import('../fixtures/parity-kernels');

      const COUNT = 500_000;
      const ITERATIONS = 1000;
      const createWorker = (): Worker =>
        new Worker('/tests/browser/fixtures/parity-worker.ts', { type: 'module' });

      const buildWorld = (scheduler: Scheduler): World => {
        const world = new ecs.World();
        world.setExecutor(scheduler);
        world.addSystem({
          name: 'Accumulate',
          phase: ecs.Phase.Update,
          query: { all: [fixtures.ComponentB, fixtures.ComponentC] },
          kernel: fixtures.parityKernel2,
          writes: [fixtures.ComponentC],
        });
        for (let i = 0; i < COUNT; i++) {
          const e = world.spawn(fixtures.ComponentB, fixtures.ComponentC);
          world.set(e, fixtures.ComponentB.result, 1);
          world.flush();
        }
        return world;
      };

      const readTotal = (world: World): number => {
        const query = world.query({ all: [fixtures.ComponentC] });
        let sum = 0;
        query.forEachChunk((view) => {
          const column = view.column(fixtures.ComponentC.accumulator);
          for (let i = view.start; i < view.end; i++) sum += column[i];
        });
        return sum;
      };

      const serial = new SerialScheduler();
      const serialWorld = buildWorld(serial);
      const threaded = new ThreadedScheduler({ maxWorkers: 3, createWorker });
      const threadedWorld = buildWorld(threaded);

      for (let i = 0; i < ITERATIONS; i++) {
        serialWorld.runPhase(ecs.Phase.Update, 0);
        threadedWorld.runPhase(ecs.Phase.Update, 0);
      }

      const result: ParityTotals = {
        serialTotal: readTotal(serialWorld),
        threadedTotal: readTotal(threadedWorld),
      };
      threaded.dispose();
      return result;
    })) satisfies ParityTotals;

    expect(outcome.threadedTotal).toBe(outcome.serialTotal);
  });

  test('Worker 内で例外を投げると PlutoError(InvalidState) になりハングしない', async ({
    page,
    plutoBackend,
  }) => {
    await page.goto(`/tests/browser/fixtures/harness.html?backend=${plutoBackend}&build=src`);

    const caught = await page.evaluate(async () => {
      const ecs = await import('../../../src/core/ecs');
      const { PlutoError } = await import('../../../src/core/debug');
      const { ThreadedScheduler } = await import('../../../src/jobs/threaded-scheduler');
      const fixtures = await import('../fixtures/parity-kernels');

      const createWorker = (): Worker =>
        new Worker('/tests/browser/fixtures/parity-worker.ts', { type: 'module' });
      const threaded = new ThreadedScheduler({ maxWorkers: 3, createWorker });

      const world = new ecs.World();
      world.setExecutor(threaded);
      world.addSystem({
        name: 'FailingKernel',
        phase: ecs.Phase.Update,
        query: { all: [fixtures.ComponentA, fixtures.ComponentB] },
        kernel: fixtures.failingKernel,
      });
      for (let i = 0; i < 200_000; i++) {
        const e = world.spawn(fixtures.ComponentA, fixtures.ComponentB);
        world.set(e, fixtures.ComponentA.value1, i);
        world.flush();
      }

      const startedAt = performance.now();
      let name = '';
      let code = '';
      try {
        world.runPhase(ecs.Phase.Update, 0.016);
      } catch (err) {
        if (err instanceof PlutoError) {
          name = err.name;
          code = err.code;
        }
      }
      const elapsedMs = performance.now() - startedAt;
      threaded.dispose();
      return { name, code, elapsedMs };
    });

    expect(caught.name).toBe('PlutoError');
    expect(caught.code).toBe('E_INVALID_STATE');
    expect(caught.elapsedMs).toBeLessThan(30_000);
  });
});
