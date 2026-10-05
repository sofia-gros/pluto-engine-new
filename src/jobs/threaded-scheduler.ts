// @pluto-hot
/**
 * @file Worker スレッドを用いて ECS カーネルを並列実行するスケジューラ。
 */

import type { Scheduler } from './scheduler';
import type { Query } from '../core/ecs/query';
import type { World } from '../core/ecs/world';
import type { KernelDef, KernelBuffers } from './kernel';

import {
  CTRL_EPOCH,
  CTRL_KERNEL_ID,
  CTRL_QUERY_ID,
  CTRL_NEXT_CHUNK,
  CTRL_TOTAL_CHUNKS,
  CTRL_DONE_CHUNKS,
  CTRL_SHUTDOWN,
  CTRL_PARAMS_OFFSET,
  CTRL_MAX_PARAMS,
  CTRL_BLOCK_LENGTH,
} from './sync';
import type { InitMessage, ArchetypeMessage, QueryMessage, BufferMessage } from './worker-protocol';

// NOTE: Vite's ?worker&inline syntax creates a Worker constructor.
import workerCtor from './worker-entry?worker&inline';
import { ChunkView } from '../core/ecs/chunk-view';

export class ThreadedScheduler implements Scheduler {
  public readonly concurrency: number;
  private readonly workers: Worker[] = [];
  
  private readonly ctrlBuffer: SharedArrayBuffer;
  private readonly ctrl: Int32Array;
  private readonly paramsFloat: Float32Array;
  
  private readonly countsBuffer: SharedArrayBuffer;
  private readonly counts: Uint32Array;

  // Track synced states to avoid resending
  private readonly syncedArchetypes = new Set<number>();
  private readonly syncedQueries = new Set<number>();

  private readonly buffers: KernelBuffers = { u32: [], f32: [], i32: [] };
  private readonly chunkView = new ChunkView();

  public constructor(config: { maxWorkers?: number } = {}) {
    // Determine worker count
    const hardwareWorkers = Math.max(1, (navigator.hardwareConcurrency || 2) - 1);
    const numWorkers = Math.max(1, Math.min(hardwareWorkers, config.maxWorkers ?? 7));
    this.concurrency = numWorkers + 1; // +1 for main thread

    // Allocate control block
    this.ctrlBuffer = new SharedArrayBuffer(CTRL_BLOCK_LENGTH * 4);
    this.ctrl = new Int32Array(this.ctrlBuffer);
    this.paramsFloat = new Float32Array(this.ctrlBuffer, CTRL_PARAMS_OFFSET * 4, CTRL_MAX_PARAMS);

    // Allocate counts buffer (support up to 65536 archetypes)
    this.countsBuffer = new SharedArrayBuffer(65536 * 4);
    this.counts = new Uint32Array(this.countsBuffer);

    const initMsg: InitMessage = {
      type: 'init',
      ctrlBuffer: this.ctrlBuffer,
      countsBuffer: this.countsBuffer,
    };

    for (let i = 0; i < numWorkers; i++) {
      const worker = new workerCtor();
      worker.postMessage(initMsg);
      this.workers.push(worker);
    }
  }

  public syncWorld(world: World): void {
    // Send new archetypes
    for (const arch of world.graph.getArchetypes()) {
      if (this.syncedArchetypes.has(arch.id)) continue;

      const columns: Record<number, SharedArrayBuffer> = {};
      for (const [fieldId, column] of arch.columns as unknown as Map<number, {buffer: ArrayBufferLike}>) {
        columns[fieldId] = column.buffer as SharedArrayBuffer;
      }

      const msg: ArchetypeMessage = {
        type: 'archetype',
        id: arch.id,
        entitiesBuffer: arch.entities.buffer as SharedArrayBuffer,
        columns,
      };

      for (const worker of this.workers) {
        worker.postMessage(msg);
      }
      this.syncedArchetypes.add(arch.id);
    }

    // Send new queries
    for (const q of Array.from(world.queries.values())) {
      if (this.syncedQueries.has(q.id)) continue;
      
      const msg: QueryMessage = {
        type: 'query',
        queryId: q.id,
        archetypeIds: q.archetypes.map((a) => a.id),
      };

      for (const worker of this.workers) {
        worker.postMessage(msg);
      }
      this.syncedQueries.add(q.id);
    }
  }

  public registerBuffer(
    kind: 'u32' | 'f32' | 'i32',
    slot: number,
    array: Uint32Array | Float32Array | Int32Array,
  ): void {
    if (kind === 'u32') {
      (this.buffers.u32 as Uint32Array[])[slot] = array as Uint32Array;
    } else if (kind === 'f32') {
      (this.buffers.f32 as Float32Array[])[slot] = array as Float32Array;
    } else {
      (this.buffers.i32 as Int32Array[])[slot] = array as Int32Array;
    }

    const msg: BufferMessage = {
      type: 'buffer',
      kind,
      slot,
      buffer: array.buffer as SharedArrayBuffer,
      byteOffset: array.byteOffset,
      length: array.length,
    };

    for (const worker of this.workers) {
      worker.postMessage(msg);
    }
  }

  public runKernel(kernel: KernelDef, query: Query, params: Float32Array): void {
    const totalChunks = query.chunkCount();
    if (totalChunks === 0) return;

    // Update counts
    for (const arch of query.archetypes) {
      this.counts[arch.id] = arch.count;
    }

    // If too few chunks, just run on main thread to save wake-up cost
    if (totalChunks < 2) {
      for (let i = 0; i < totalChunks; i++) {
        query.getChunk(i, this.chunkView);
        kernel.fn(this.chunkView, params, this.buffers);
      }
      return;
    }

    // Prepare control block
    this.ctrl[CTRL_KERNEL_ID] = kernel.id;
    this.ctrl[CTRL_QUERY_ID] = query.id;
    this.ctrl[CTRL_NEXT_CHUNK] = 0;
    this.ctrl[CTRL_DONE_CHUNKS] = 0;
    this.ctrl[CTRL_TOTAL_CHUNKS] = totalChunks;

    // Copy params
    for (let i = 0; i < params.length; i++) {
      this.paramsFloat[i] = params[i];
    }

    // Notify workers
    Atomics.add(this.ctrl, CTRL_EPOCH, 1);
    Atomics.notify(this.ctrl, CTRL_EPOCH);

    // Main thread participates
    for (;;) {
      const chunk = Atomics.add(this.ctrl, CTRL_NEXT_CHUNK, 1);
      if (chunk >= totalChunks) break;

      query.getChunk(chunk, this.chunkView);
      kernel.fn(this.chunkView, this.paramsFloat, this.buffers);

      Atomics.add(this.ctrl, CTRL_DONE_CHUNKS, 1);
    }

    // Wait for workers to finish remaining chunks
    for (;;) {
      if (Atomics.load(this.ctrl, CTRL_DONE_CHUNKS) === totalChunks) break;
    }
  }

  public dispose(): void {
    this.ctrl[CTRL_SHUTDOWN] = 1;
    Atomics.add(this.ctrl, CTRL_EPOCH, 1);
    Atomics.notify(this.ctrl, CTRL_EPOCH);

    for (const worker of this.workers) {
      worker.terminate();
    }
    this.workers.length = 0;
  }
}
