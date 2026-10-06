// @pluto-hot
/**
 * @file Worker 側のジョブループ `runWorkerLoop` (docs/05-jobs-and-builds.md §3.2〜3.3)。副作用を持たない。
 * `Atomics.waitAsync` で待つのでブロックせず、ジョブの合間に同期メッセージを処理できる。
 */
import { Archetype, ChunkView, Query, applyComponentLayout } from '../core/ecs';
import type { KernelBuffers } from './kernel';
import { findKernel } from './kernel-registry';
import {
  CTRL_EPOCH,
  CTRL_ERROR,
  CTRL_KERNEL_ID,
  CTRL_NEXT_CHUNK,
  CTRL_PARAMS,
  CTRL_PARAM_COUNT,
  CTRL_QUERY_ID,
  CTRL_SHUTDOWN,
  CTRL_SYNC_VERSION,
  CTRL_TOTAL_CHUNKS,
  claimChunk,
  completeChunk,
} from './sync';
import type { ToWorkerMessage, WorkerPort } from './worker-protocol';

/** Worker の状態 (初期化後に確定)。 */
interface WorkerState {
  readonly ctrl: Int32Array;
  readonly counts: Int32Array;
  readonly params: Float32Array;
  readonly mirrors: Map<number, Archetype>;
  readonly queries: Map<number, Query>;
  readonly buffers: { u32: Uint32Array[]; f32: Float32Array[]; i32: Int32Array[] };
  readonly view: ChunkView;
  appliedVersion: number;
  localEpoch: number;
}

/**
 * 同期メッセージを状態に反映する。
 * @cold メッセージ受信時のみ
 * @param state Worker の状態
 * @param msg メッセージ
 */
function applyMessage(state: WorkerState, msg: Exclude<ToWorkerMessage, { type: 'init' }>): void {
  if (msg.type === 'archetype') {
    // 既存のミラーはバッファだけ差し替える (クエリが持つ参照を保つ)
    const existing = state.mirrors.get(msg.desc.id);
    if (existing === undefined) state.mirrors.set(msg.desc.id, Archetype.fromShared(msg.desc));
    else existing.rebindShared(msg.desc);
  } else if (msg.type === 'query') {
    let q = state.queries.get(msg.queryId);
    if (q === undefined) {
      q = new Query({});
      state.queries.set(msg.queryId, q);
    }
    for (const id of msg.archetypeIds) {
      const mirror = state.mirrors.get(id);
      if (mirror !== undefined) q.tryRegister(mirror);
    }
  } else if (msg.kind === 'u32') {
    state.buffers.u32[msg.slot] = new Uint32Array(msg.buffer, msg.byteOffset, msg.length);
  } else if (msg.kind === 'f32') {
    state.buffers.f32[msg.slot] = new Float32Array(msg.buffer, msg.byteOffset, msg.length);
  } else {
    state.buffers.i32[msg.slot] = new Int32Array(msg.buffer, msg.byteOffset, msg.length);
  }
  state.appliedVersion = msg.syncVersion;
}

/** runJob の結果: 参加した (または参加不要)。 */
const JOB_OK = 0;
/** runJob の結果: カーネルが Worker に登録されていないので参加しなかった。 */
const JOB_MISSING_KERNEL = 1;

/**
 * 現在のジョブに参加してチャンクを処理する。
 * 参加できるか (同期バージョン・クエリ・カーネル) はチャンクを取る前にすべて確かめる
 * (取った後に処理できないとメインが完了を待ち続けるため)。
 * @hot
 * @param state Worker の状態
 * @returns JOB_OK または JOB_MISSING_KERNEL
 */
function runJob(state: WorkerState): number {
  const ctrl = state.ctrl;
  // 先に NEXT の印 (ジョブ番号) を読み、その後でフィールドを読む (05 §3.2 手順 2)
  const seq = Atomics.load(ctrl, CTRL_NEXT_CHUNK) >>> 16;
  const total = Atomics.load(ctrl, CTRL_TOTAL_CHUNKS);
  if (total === 0 || Atomics.load(ctrl, CTRL_SYNC_VERSION) > state.appliedVersion) return JOB_OK;
  const query = state.queries.get(Atomics.load(ctrl, CTRL_QUERY_ID));
  if (query === undefined) return JOB_OK;
  const kernel = findKernel(Atomics.load(ctrl, CTRL_KERNEL_ID) >>> 0);
  if (kernel === undefined) return JOB_MISSING_KERNEL;
  const archs = query.archetypes;
  const n = archs.length;
  for (let i = 0; i < n; i++) archs[i].count = Atomics.load(state.counts, archs[i].id);
  const view = state.view;
  for (;;) {
    const chunk = claimChunk(ctrl, seq, total);
    if (chunk < 0) break;
    query.getChunk(chunk, view);
    kernel.fn(view, state.params, state.buffers);
    completeChunk(ctrl, seq);
  }
  return JOB_OK;
}

/**
 * Worker のジョブループを開始する。`src/worker-main.ts` からだけ呼ぶ。
 * @cold Worker の起動時に 1 回だけ
 * @param port Worker スコープ
 */
export function runWorkerLoop(port: WorkerPort): void {
  let state: WorkerState | null = null;
  const fail = (err: unknown): void => {
    if (state !== null) Atomics.store(state.ctrl, CTRL_ERROR, 1);
    port.post({ type: 'error', message: err instanceof Error ? err.message : String(err) });
  };
  const wake = (): void => {
    if (state === null) return;
    const s = state;
    if (Atomics.load(s.ctrl, CTRL_SHUTDOWN) !== 0) {
      port.close();
      return;
    }
    s.localEpoch = Atomics.load(s.ctrl, CTRL_EPOCH);
    try {
      if (runJob(s) === JOB_MISSING_KERNEL) {
        // 致命的ではない: この Worker は参加せず、メインが代わりに処理する
        port.post({
          type: 'error',
          message:
            'カーネルが Worker に登録されていません (src/worker-main.ts の import を確認してください)',
        });
      }
    } catch (err) {
      fail(err);
    }
    const w = Atomics.waitAsync(s.ctrl, CTRL_EPOCH, s.localEpoch);
    // 既に世代が進んでいた場合も、スタックを伸ばさないようにマイクロタスクで再開する
    void (w.async ? w.value : Promise.resolve()).then(wake);
  };
  port.listen((msg) => {
    try {
      if (msg.type === 'init') {
        applyComponentLayout(msg.componentLayout);
        const buffers: KernelBuffers & WorkerState['buffers'] = { u32: [], f32: [], i32: [] };
        state = {
          ctrl: new Int32Array(msg.ctrlBuffer),
          counts: new Int32Array(msg.countsBuffer),
          params: new Float32Array(msg.ctrlBuffer, CTRL_PARAMS * 4, CTRL_PARAM_COUNT),
          mirrors: new Map(),
          queries: new Map(),
          buffers,
          view: new ChunkView(),
          appliedVersion: 0,
          localEpoch: 0,
        };
        port.post({ type: 'ready' });
        wake();
      } else if (state !== null) {
        applyMessage(state, msg);
      }
    } catch (err) {
      fail(err);
      port.close();
    }
  });
}
