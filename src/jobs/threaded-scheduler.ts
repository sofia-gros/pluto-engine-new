// @pluto-hot
/**
 * @file Worker プール + メインスレッド参加型の並列スケジューラ (docs/05-jobs-and-builds.md §3.2〜3.3)。
 * カラムのバッファは伸長時に作り直されるので、syncWorld で bufferVersion の変わったアーキタイプを送り直す。
 * import してよいのは jobs/create-scheduler.ts のみ。
 */
import { ErrorCode, PlutoError, logger } from '../core/debug';
import { ChunkView, MAX_KERNEL_PARAMS, getComponentLayout } from '../core/ecs';
import type { KernelRef, Query, World } from '../core/ecs';
import type { KernelBuffers, KernelDef } from './kernel';
import { getKernelById } from './kernel-registry';
import type { KernelBufferKind, Scheduler } from './scheduler';
import {
  ARCH_COUNTS_LENGTH,
  CTRL_BLOCK_LENGTH,
  CTRL_DONE_CHUNKS,
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
  JOB_SEQ_MASK,
  MAX_JOB_CHUNKS,
  claimChunk,
  completeChunk,
  doneCount,
  tagged,
} from './sync';
import type { FromWorkerMessage, ToWorkerMessage } from './worker-protocol';
import WorkerCtor from '../worker-main?worker&inline';

/** ThreadedScheduler の設定。 */
export interface ThreadedSchedulerConfig {
  /** Worker 数の上限 (既定 7)。実際は min(hardwareConcurrency - 1, maxWorkers)、最低 1。 */
  readonly maxWorkers?: number;
  /** Worker の生成関数 (テストでテスト用カーネルを含む Worker を使うため。既定は src/worker-main.ts)。 */
  readonly createWorker?: () => Worker;
}

/** `__DEBUG__` でのスピン回数の上限 (ハングの検出用)。 */
const DEBUG_SPIN_LIMIT = 2 ** 31;

/**
 * 並列スケジューラ。Worker とメインスレッドがチャンクを取り合う。
 */
export class ThreadedScheduler implements Scheduler {
  /** 並列度 (Worker 数 + メイン)。 */
  public readonly concurrency: number;
  private readonly workers: Worker[] = [];
  private readonly ctrl: Int32Array;
  private readonly counts: Int32Array;
  private readonly params: Float32Array;
  private readonly u32: Uint32Array[] = [];
  private readonly f32: Float32Array[] = [];
  private readonly i32: Int32Array[] = [];
  private readonly buffers: KernelBuffers = { u32: this.u32, f32: this.f32, i32: this.i32 };
  private readonly view = new ChunkView();
  /** アーキタイプ ID → 送信済みの bufferVersion。 */
  private readonly sentArchetypes = new Map<number, number>();
  private readonly sentQueryLengths = new Map<number, number>();
  private syncVersion = 0;
  private jobCounter = 0;
  private lastWorkerError = '';

  /**
   * @param config 設定
   */
  public constructor(config: ThreadedSchedulerConfig = {}) {
    const hw = typeof navigator === 'undefined' ? 2 : navigator.hardwareConcurrency;
    const count = Math.max(1, Math.min(hw - 1, config.maxWorkers ?? 7));
    this.concurrency = count + 1;
    const ctrlBuffer = new SharedArrayBuffer(CTRL_BLOCK_LENGTH * 4);
    const countsBuffer = new SharedArrayBuffer(ARCH_COUNTS_LENGTH * 4);
    this.ctrl = new Int32Array(ctrlBuffer);
    this.counts = new Int32Array(countsBuffer);
    this.params = new Float32Array(ctrlBuffer, CTRL_PARAMS * 4, CTRL_PARAM_COUNT);
    const create = config.createWorker ?? ((): Worker => new WorkerCtor());
    const init: ToWorkerMessage = {
      type: 'init',
      ctrlBuffer,
      countsBuffer,
      componentLayout: getComponentLayout(),
    };
    for (let i = 0; i < count; i++) {
      const worker = create();
      worker.addEventListener('message', (e: MessageEvent<FromWorkerMessage>) => {
        this.onWorkerMessage(e.data);
      });
      worker.postMessage(init);
      this.workers.push(worker);
    }
  }

  /**
   * 新しいアーキタイプと、対象が増えたクエリを Worker に送る。
   * @cold World の構造変化時のみ
   * @param world 対象の World
   */
  public syncWorld(world: World): void {
    for (const arch of world.graph.getArchetypes()) {
      // 新規、またはバッファを作り直したアーキタイプを送る (E-002)
      if (this.sentArchetypes.get(arch.id) === arch.bufferVersion) continue;
      this.broadcast({ type: 'archetype', syncVersion: ++this.syncVersion, desc: arch.toShared() });
      this.sentArchetypes.set(arch.id, arch.bufferVersion);
    }
    for (const q of world.queries) {
      if ((this.sentQueryLengths.get(q.id) ?? -1) === q.archetypes.length) continue;
      const archetypeIds = q.archetypes.map((a) => a.id);
      this.broadcast({
        type: 'query',
        syncVersion: ++this.syncVersion,
        queryId: q.id,
        archetypeIds,
      });
      this.sentQueryLengths.set(q.id, q.archetypes.length);
    }
  }

  /**
   * 共有バッファを登録して Worker に送る。SharedArrayBuffer 上でなければ例外。
   * @cold 初期化時のみ
   * @param kind 種類
   * @param slot スロット番号
   * @param array TypedArray
   */
  public registerBuffer(
    kind: KernelBufferKind,
    slot: number,
    array: Uint32Array | Float32Array | Int32Array,
  ): void {
    const buffer = array.buffer;
    if (!(buffer instanceof SharedArrayBuffer)) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        'registerBuffer: parallel では createBackingBuffer 由来 (SharedArrayBuffer) の配列を登録してください。',
      );
    }
    if (kind === 'u32' && array instanceof Uint32Array) this.u32[slot] = array;
    else if (kind === 'f32' && array instanceof Float32Array) this.f32[slot] = array;
    else if (kind === 'i32' && array instanceof Int32Array) this.i32[slot] = array;
    else
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        `registerBuffer: kind '${kind}' と配列の型が一致しません。`,
      );
    this.broadcast({
      type: 'buffer',
      syncVersion: ++this.syncVersion,
      kind,
      slot,
      buffer,
      byteOffset: array.byteOffset,
      length: array.length,
    });
  }

  /**
   * クエリの全チャンクを Worker とメインで分担して実行する。
   * @hot
   * @param kernel カーネル
   * @param query 対象クエリ
   * @param params パラメータ (長さ ≤ 64)
   */
  public runKernel(kernel: KernelRef, query: Query, params: Float32Array): void {
    if (params.length > MAX_KERNEL_PARAMS) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        'runKernel: params は 64 要素以下にしてください。',
      );
    }
    const def = getKernelById(kernel.id);
    const total = query.chunkCount();
    if (total === 0) return;
    if (total > MAX_JOB_CHUNKS) {
      throw new PlutoError(
        ErrorCode.CapacityExceeded,
        'runKernel: 1 回のチャンク数が上限 (65535) を超えました。',
      );
    }
    const ctrl = this.ctrl;
    const p = this.params;
    p.fill(0);
    p.set(params);
    if (total < 2 || this.workers.length === 0) {
      // 起床コストの方が高いのでメインだけで実行する (05 §3.2)。
      // ループ内に throw を置かないため、失敗したらループを抜けてから投げる。
      let isOk = true;
      for (let i = 0; i < total; i++) {
        query.getChunk(i, this.view);
        if (!this.runChunkKernel(def, p)) {
          isOk = false;
          break;
        }
      }
      if (!isOk) {
        throw new PlutoError(
          ErrorCode.InvalidState,
          'カーネルの実行に失敗しました。直前のエラーを確認してください。',
        );
      }
      return;
    }
    const archs = query.archetypes;
    const n = archs.length;
    for (let i = 0; i < n; i++) this.counts[archs[i].id] = archs[i].count;
    const seq = ++this.jobCounter & JOB_SEQ_MASK;
    // フィールドを書いてから DONE、最後に NEXT を書く (05 §3.2 手順 1)
    Atomics.store(ctrl, CTRL_ERROR, 0);
    Atomics.store(ctrl, CTRL_KERNEL_ID, def.id | 0);
    Atomics.store(ctrl, CTRL_QUERY_ID, query.id);
    Atomics.store(ctrl, CTRL_TOTAL_CHUNKS, total);
    Atomics.store(ctrl, CTRL_SYNC_VERSION, this.syncVersion);
    Atomics.store(ctrl, CTRL_DONE_CHUNKS, tagged(seq, 0));
    Atomics.store(ctrl, CTRL_NEXT_CHUNK, tagged(seq, 0));
    Atomics.add(ctrl, CTRL_EPOCH, 1);
    Atomics.notify(ctrl, CTRL_EPOCH);
    for (;;) {
      const chunk = claimChunk(ctrl, seq, total);
      if (chunk < 0) break;
      query.getChunk(chunk, this.view);
      if (!this.runChunkKernel(def, p)) {
        // メインが例外を出したら完了カウンタを進めず、下の判定で PlutoError にする。
        // 進行中の Worker は CTRL_ERROR を見て待機を抜ける (05 §3.2 手順 5)。
        Atomics.store(ctrl, CTRL_ERROR, 1);
        break;
      }
      completeChunk(ctrl, seq);
    }
    let spins = 0;
    while (doneCount(ctrl, seq) < total && Atomics.load(ctrl, CTRL_ERROR) === 0) {
      if (__DEBUG__ && ++spins > DEBUG_SPIN_LIMIT) break;
    }
    if (Atomics.load(ctrl, CTRL_ERROR) !== 0 || doneCount(ctrl, seq) < total) {
      throw new PlutoError(
        ErrorCode.InvalidState,
        'Worker でカーネルが失敗したか、完了しませんでした。直前の Worker のエラーを確認してください。',
      );
    }
  }

  /**
   * 1 チャンク分のカーネルを実行する。例外は内部で捕捉し、呼び出し元には失敗だけを返す。
   * ループ内に try を書かずに済ませるため、失敗は戻り値で伝える (docs/03 §5.2、`.agents/rules/02-performance.md`)。
   * @hot
   * @param def 実行するカーネル
   * @param params 0 埋め済みのパラメータ
   * @returns 成功したら true、例外が発生したら false
   */
  private runChunkKernel(def: KernelDef, params: Float32Array): boolean {
    try {
      def.fn(this.view, params, this.buffers);
      return true;
    } catch (err) {
      const detail = err instanceof Error ? err.message : String(err);
      this.lastWorkerError = detail;
      return false;
    }
  }

  /**
   * Worker を終了する。
   * @cold
   */
  public dispose(): void {
    Atomics.store(this.ctrl, CTRL_SHUTDOWN, 1);
    Atomics.add(this.ctrl, CTRL_EPOCH, 1);
    Atomics.notify(this.ctrl, CTRL_EPOCH);
    for (const w of this.workers) w.terminate();
    this.workers.length = 0;
  }

  /** 最後に Worker から届いたエラー (デバッグ用)。 */
  public get lastError(): string {
    return this.lastWorkerError;
  }

  /**
   * 全 Worker にメッセージを送る。
   * @cold
   * @param msg メッセージ
   */
  private broadcast(msg: ToWorkerMessage): void {
    for (const w of this.workers) w.postMessage(msg);
  }

  /**
   * Worker からのメッセージを処理する。
   * @cold
   * @param msg メッセージ
   */
  private onWorkerMessage(msg: FromWorkerMessage): void {
    if (msg.type === 'error') {
      this.lastWorkerError = msg.message;
      logger.error('Worker:', msg.message);
    }
  }
}
