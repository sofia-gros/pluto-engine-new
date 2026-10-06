import { beforeEach, describe, expect, it } from 'vitest';
import { SerialScheduler } from '../../../src/jobs/serial-scheduler';
import { defineKernel } from '../../../src/jobs/kernel';
import type { KernelBuffers } from '../../../src/jobs/kernel';
import { clearKernelRegistryForTesting } from '../../../src/jobs/kernel-registry';
import { World } from '../../../src/core/ecs/world';
import { CHUNK_ROWS } from '../../../src/core/ecs/chunk-view';
import { defineComponent } from '../../../src/core/ecs/component';
import { Phase } from '../../../src/core/ecs/system';
import { ScalarType } from '../../../src/core/memory/scalar-type';
import { ErrorCode } from '../../../src/core/debug/pluto-error';

const Pos = defineComponent('Pos', { x: ScalarType.F32 });
const Vel = defineComponent('Vel', { x: ScalarType.F32 });

describe('SerialScheduler', () => {
  beforeEach(() => {
    clearKernelRegistryForTesting();
  });

  it('並列度は 1。syncWorld / dispose は何もしない', () => {
    const s = new SerialScheduler();
    expect(s.concurrency).toBe(1);
    s.syncWorld();
    s.dispose();
  });

  it('全チャンクに順に実行し、chunkIndex はクエリ全体の通し番号', () => {
    const w = new World({ maxEntities: 50_000 });
    for (let i = 0; i < CHUNK_ROWS + 10; i++) w.spawn(Pos);
    for (let i = 0; i < 5; i++) w.spawn(Pos, Vel);
    const seen: number[][] = [];
    const k = defineKernel('Record', (view) => {
      seen.push([view.chunkIndex, view.start, view.end]);
    });
    new SerialScheduler().runKernel(k, w.query({ all: [Pos] }), new Float32Array(1));
    expect(seen).toEqual([
      [0, 0, CHUNK_ROWS],
      [1, CHUNK_ROWS, CHUNK_ROWS + 10],
      [2, 0, 5],
    ]);
  });

  it('params は常に 64 要素で、渡した値の後ろは 0 埋めされる', () => {
    const w = new World({ maxEntities: 10 });
    w.spawn(Pos);
    const lengths: number[] = [];
    const tails: number[] = [];
    const k = defineKernel('Params', (_v, p) => {
      lengths.push(p.length);
      tails.push(p[2]);
    });
    const s = new SerialScheduler();
    s.runKernel(k, w.query({ all: [Pos] }), new Float32Array([1, 2, 3]));
    s.runKernel(k, w.query({ all: [Pos] }), new Float32Array([1, 2]));
    expect(lengths).toEqual([64, 64]);
    expect(tails).toEqual([3, 0]);
  });

  it('境界値: 65 要素以上の params は PlutoError(InvalidArgument)', () => {
    const w = new World({ maxEntities: 10 });
    const k = defineKernel('Noop', () => undefined);
    expect(() => {
      new SerialScheduler().runKernel(k, w.query({ all: [Pos] }), new Float32Array(65));
    }).toThrow(expect.objectContaining({ code: ErrorCode.InvalidArgument }));
  });

  it('registerBuffer した配列がカーネルの buffers に渡り、型の不一致は PlutoError', () => {
    const w = new World({ maxEntities: 10 });
    w.spawn(Pos);
    const s = new SerialScheduler();
    const u = new Uint32Array(4);
    s.registerBuffer('u32', 1, u);
    s.registerBuffer('f32', 0, new Float32Array(1));
    s.registerBuffer('i32', 0, new Int32Array(1));
    const seen: KernelBuffers[] = [];
    const k = defineKernel('Buf', (_v, _p, b) => {
      seen.push(b);
    });
    s.runKernel(k, w.query({ all: [Pos] }), new Float32Array(1));
    expect(seen).toHaveLength(1);
    expect(seen[0].u32[1]).toBe(u);
    expect(() => {
      s.registerBuffer('u32', 0, new Float32Array(1));
    }).toThrow(expect.objectContaining({ code: ErrorCode.InvalidArgument }));
  });

  it('World の kernel システムが SerialScheduler 経由で実行され、dt と結果が反映される', () => {
    const w = new World({ maxEntities: 100 });
    const e = w.spawn(Pos, Vel);
    w.set(e, Vel.x, 3);
    const move = defineKernel('Move', (view, p) => {
      const x = view.column(Pos.x);
      const vx = view.column(Vel.x);
      for (let i = view.start; i < view.end; i++) x[i] += vx[i] * p[0];
      view.markDirty(Pos.x);
    });
    w.setExecutor(new SerialScheduler());
    w.addSystem({ name: 'move', phase: Phase.Update, query: { all: [Pos, Vel] }, kernel: move });
    w.runPhase(Phase.Update, 2);
    expect(w.get(e, Pos.x)).toBe(6);
  });
});
