// @pluto-hot
/**
 * @file Worker エントリポイント。メインスレッドからのジョブを並列実行する。
 */

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
} from './sync';
import type { WorkerMessage } from './worker-protocol';
import { getKernelById } from './kernel-registry';
import { ChunkView } from '../core/ecs/chunk-view';
import { ScalarType } from '../core/memory/scalar-type';
import type { KernelBuffers, KernelId } from './kernel';
import type { Archetype } from '../core/ecs/archetype';

// Worker local state
let ctrl: Int32Array;
let paramsFloat: Float32Array;
let counts: Uint32Array;
let localEpoch = 0;

// Dummy classes for worker
class WorkerArchetype {
  public id = 0;
  public entities!: Uint32Array;
  public columns = new Map<number, ArrayBufferLike>();
  // ChunkView calls this, but it expects a Column or typed array?
  // No, ChunkView uses archetype.getColumn(fieldId, type).
  // Wait, chunk-view uses archetype.columns? No, getColumn.
  public getColumn(fieldId: number, type: ScalarType): ArrayBufferView | null {
    const buf = this.columns.get(fieldId);
    if (!buf) return null;
    switch (type) {
      case ScalarType.F32:
        return new Float32Array(buf);
      case ScalarType.I32:
        return new Int32Array(buf);
      case ScalarType.U32:
        return new Uint32Array(buf);
      case ScalarType.I16:
        return new Int16Array(buf);
      case ScalarType.U16:
        return new Uint16Array(buf);
      case ScalarType.I8:
        return new Int8Array(buf);
      case ScalarType.U8:
        return new Uint8Array(buf);
      default:
        return new Uint8Array(buf);
    }
  }
}

class WorkerQuery {
  public id = 0;
  public archetypes: WorkerArchetype[] = [];
  public chunkCount = 0;
}

const archetypes = new Map<number, WorkerArchetype>();
const queries = new Map<number, WorkerQuery>();
const buffers: KernelBuffers = { u32: [], f32: [], i32: [] };
const chunkView = new ChunkView();
const CHUNK_ROWS = 16384;

self.onmessage = (e: MessageEvent<WorkerMessage>) => {
  const msg = e.data;
  switch (msg.type) {
    case 'init': {
      ctrl = new Int32Array(msg.ctrlBuffer);
      paramsFloat = new Float32Array(msg.ctrlBuffer, CTRL_PARAMS_OFFSET * 4, CTRL_MAX_PARAMS);
      counts = new Uint32Array(msg.countsBuffer);
      self.postMessage({ type: 'ready' });
      pump();
      break;
    }
    case 'archetype': {
      let arch = archetypes.get(msg.id);
      if (!arch) {
        arch = new WorkerArchetype();
        arch.id = msg.id;
        archetypes.set(msg.id, arch);
      }
      arch.entities = new Uint32Array(msg.entitiesBuffer);
      for (const [fieldIdStr, buffer] of Object.entries(msg.columns)) {
        const fieldId = parseInt(fieldIdStr, 10);
        // We don't know the exact ScalarType here, but in ChunkView we just need the buffer.
        // Wait, ChunkView uses field.type to create the typed array.
        // So we should store the buffer itself, and create the typed array when requested.
        arch.columns.set(fieldId, buffer);
      }
      break;
    }
    case 'query': {
      let q = queries.get(msg.queryId);
      if (!q) {
        q = new WorkerQuery();
        q.id = msg.queryId;
        queries.set(msg.queryId, q);
      }
      q.archetypes = [];
      for (const id of msg.archetypeIds) {
        const arch = archetypes.get(id);
        if (arch) q.archetypes.push(arch);
      }
      break;
    }
    case 'buffer': {
      const arr = new (
        msg.kind === 'u32' ? Uint32Array : msg.kind === 'f32' ? Float32Array : Int32Array
      )(msg.buffer as ArrayBuffer & SharedArrayBuffer, msg.byteOffset, msg.length);

      if (msg.kind === 'u32') {
        (buffers.u32 as Uint32Array[])[msg.slot] = arr as Uint32Array;
      } else if (msg.kind === 'f32') {
        (buffers.f32 as Float32Array[])[msg.slot] = arr as Float32Array;
      } else {
        (buffers.i32 as Int32Array[])[msg.slot] = arr as Int32Array;
      }
      break;
    }
  }
};

function pump() {
  for (;;) {
    if (Atomics.load(ctrl, CTRL_SHUTDOWN) !== 0) {
      self.close();
      return;
    }

    if (Atomics.load(ctrl, CTRL_EPOCH) === localEpoch) {
      Atomics.wait(ctrl, CTRL_EPOCH, localEpoch);
    }
    localEpoch = Atomics.load(ctrl, CTRL_EPOCH);

    if (Atomics.load(ctrl, CTRL_SHUTDOWN) !== 0) {
      self.close();
      return;
    }

    const total = Atomics.load(ctrl, CTRL_TOTAL_CHUNKS);
    if (total === 0) continue; // Dummy wakeup

    const kernelId = Atomics.load(ctrl, CTRL_KERNEL_ID) as unknown as KernelId;
    const queryId = Atomics.load(ctrl, CTRL_QUERY_ID);

    const kernel = getKernelById(kernelId);
    const query = queries.get(queryId);

    if (query === undefined) {
      // Required data not yet arrived via postMessage. Yield to event loop.
      setTimeout(pump, 0);
      return;
    }

    for (;;) {
      const chunk = Atomics.add(ctrl, CTRL_NEXT_CHUNK, 1);
      if (chunk >= total) break;

      // Extract chunk boundaries using shared counts
      let offset = 0;
      for (const arch of query.archetypes) {
        const c = counts[arch.id];
        const chunksInArch = Math.ceil(c / CHUNK_ROWS);
        if (chunk < offset + chunksInArch) {
          const localChunk = chunk - offset;
          // Construct view manually
          chunkView.archetype = arch as unknown as Archetype; // WorkerArchetype is structurally compatible for getColumn
          chunkView.start = localChunk * CHUNK_ROWS;
          chunkView.end = Math.min((localChunk + 1) * CHUNK_ROWS, c);
          chunkView.chunkIndex = chunk;

          kernel.fn(chunkView, paramsFloat, buffers);
          break;
        }
        offset += chunksInArch;
      }

      Atomics.add(ctrl, CTRL_DONE_CHUNKS, 1);
    }
  }
}
