import { describe, expect, it } from 'vitest';
import { SerialScheduler } from '../../../src/jobs/serial-scheduler';
import { defineKernel } from '../../../src/jobs/kernel';
import type { ChunkView } from '../../../src/core/ecs/chunk-view';
import type { KernelBuffers, KernelFn } from '../../../src/jobs/kernel';
import type { Query } from '../../../src/core/ecs/query';

describe('SerialScheduler', () => {
  it('has concurrency 1', () => {
    const scheduler = new SerialScheduler();
    expect(scheduler.concurrency).toBe(1);
  });

  it('syncWorld and dispose do not throw', () => {
    const scheduler = new SerialScheduler();
    expect(() => {
      scheduler.syncWorld();
    }).not.toThrow();
    expect(() => {
      scheduler.dispose();
    }).not.toThrow();
  });

  it('registers buffers correctly', () => {
    const scheduler = new SerialScheduler();
    const u32Buf = new Uint32Array(10);
    const f32Buf = new Float32Array(10);
    const i32Buf = new Int32Array(10);

    scheduler.registerBuffer('u32', 2, u32Buf);
    scheduler.registerBuffer('f32', 1, f32Buf);
    scheduler.registerBuffer('i32', 0, i32Buf);

    let capturedBuffers: KernelBuffers = {
      u32: [],
      f32: [],
      i32: [],
    };
    
    const fn: KernelFn = (_view, _params, buffers) => {
      capturedBuffers = buffers;
    };
    const testKernel = defineKernel('TestBuf', fn);

    const mockQuery = {
      chunkCount: () => 1,
      getChunk: () => {
        // noop
      },
    } as unknown as Query;

    scheduler.runKernel(testKernel, mockQuery, new Float32Array());

    expect(capturedBuffers.u32[2]).toBe(u32Buf);
    expect(capturedBuffers.f32[1]).toBe(f32Buf);
    expect(capturedBuffers.i32[0]).toBe(i32Buf);
  });

  it('iterates over query chunks and calls kernel fn', () => {
    const scheduler = new SerialScheduler();

    const chunksPassed: number[] = [];
    const fn: KernelFn = (view, params) => {
      chunksPassed.push(view.chunkIndex);
      expect(params[0]).toBe(42);
    };
    const testKernel = defineKernel('TestIter', fn);

    const mockQuery = {
      chunkCount: () => 3,
      getChunk: (index: number, out: ChunkView) => {
        out.chunkIndex = index;
      },
    } as unknown as Query;

    const params = new Float32Array([42, 1, 2]);
    scheduler.runKernel(testKernel, mockQuery, params);

    expect(chunksPassed).toEqual([0, 1, 2]);
  });
});
