import { test, expect } from '@playwright/test';
import type { ChunkView } from '../../../src/core/ecs/chunk-view';

test.describe('Scheduler Parity', () => {
  test('ThreadedScheduler は SerialScheduler と完全に一致する結果を出力する (1M エンティティ)', async ({
    page,
  }) => {
    await page.goto('/tests/browser/fixtures/harness.html');
    test.setTimeout(120000);

    const match = await page.evaluate(async () => {
      const { World } = await import('../../../src/core/ecs/world');
      const { defineComponent } = await import('../../../src/core/ecs/component');
      const { ScalarType } = await import('../../../src/core/memory/scalar-type');
      const { defineKernel } = await import('../../../src/jobs/kernel');
      const { SerialScheduler } = await import('../../../src/jobs/serial-scheduler');
      const { ThreadedScheduler } = await import('../../../src/jobs/threaded-scheduler');

      const Transform = defineComponent('Transform', { x: ScalarType.F32, y: ScalarType.F32 });
      const Velocity = defineComponent('Velocity', { dx: ScalarType.F32, dy: ScalarType.F32 });

      const MoveKernel = defineKernel('Move', (view: ChunkView) => {
        const tX = view.column(Transform.x);
        const tY = view.column(Transform.y);
        const vDx = view.column(Velocity.dx);
        const vDy = view.column(Velocity.dy);

        for (let i = view.start; i < view.end; i++) {
          tX[i] += vDx[i];
          tY[i] += vDy[i];
        }
      });

      const COUNT = 1_000_000;

      // 1. 直列スケジューラでの実行
      const worldSerial = new World();
      const serialScheduler = new SerialScheduler();

      for (let i = 0; i < COUNT; i++) {
        const e = worldSerial.spawn(Transform, Velocity);
        worldSerial.set(e, Velocity.dx, 1.5);
        worldSerial.set(e, Velocity.dy, 2.5);
      }

      serialScheduler.syncWorld(worldSerial);
      const q1 = worldSerial.query({ all: [Transform, Velocity] });
      serialScheduler.runKernel(MoveKernel, q1, new Float32Array(0));

      // 2. 並列スケジューラでの実行
      const worldThreaded = new World();
      const threadedScheduler = new ThreadedScheduler({ maxWorkers: 4 });

      for (let i = 0; i < COUNT; i++) {
        const e = worldThreaded.spawn(Transform, Velocity);
        worldThreaded.set(e, Velocity.dx, 1.5);
        worldThreaded.set(e, Velocity.dy, 2.5);
      }

      threadedScheduler.syncWorld(worldThreaded);
      const q2 = worldThreaded.query({ all: [Transform, Velocity] });
      threadedScheduler.runKernel(MoveKernel, q2, new Float32Array(0));
      threadedScheduler.dispose();

      // 3. 結果の比較
      const archSerial = worldSerial.graph.getArchetypeById(1);
      const archThreaded = worldThreaded.graph.getArchetypeById(1);

      if (!archSerial || !archThreaded) return { match: false, reason: 'Archetype not found' };
      if (archSerial.count !== COUNT || archThreaded.count !== COUNT)
        return { match: false, reason: 'Count mismatch' };

      const bufSx = archSerial.getColumn(Transform.x);
      const bufTx = archThreaded.getColumn(Transform.x);
      const bufSy = archSerial.getColumn(Transform.y);
      const bufTy = archThreaded.getColumn(Transform.y);

      const colSx = new Float32Array(bufSx.buffer).subarray(0, COUNT);
      const colTx = new Float32Array(bufTx.buffer).subarray(0, COUNT);
      const colSy = new Float32Array(bufSy.buffer).subarray(0, COUNT);
      const colTy = new Float32Array(bufTy.buffer).subarray(0, COUNT);

      for (let i = 0; i < COUNT; i++) {
        if (colSx[i] !== colTx[i])
          return {
            match: false,
            reason: `Mismatch X at ${String(i)}: ${String(colSx[i])} vs ${String(colTx[i])}`,
          };
        if (colSy[i] !== colTy[i])
          return {
            match: false,
            reason: `Mismatch Y at ${String(i)}: ${String(colSy[i])} vs ${String(colTy[i])}`,
          };
      }

      return { match: true };
    });

    expect(match.match).toBe(true);
  });
});
