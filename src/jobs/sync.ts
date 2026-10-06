// @pluto-hot
/**
 * @file 制御ブロックのレイアウトと、ジョブ番号付きカウンタの Atomics 操作 (docs/05-jobs-and-builds.md §3.2)。
 * NEXT / DONE は上位 15 ビットにジョブ番号、下位 16 ビットに番号を持ち、古いジョブの操作を compareExchange で弾く。
 */

/** ジョブ世代。メインが +1 して notify する。 */
export const CTRL_EPOCH = 0;
/** 実行するカーネル ID (u32 を int32 として格納)。 */
export const CTRL_KERNEL_ID = 1;
/** クエリ ID。 */
export const CTRL_QUERY_ID = 2;
/** 次に取るチャンク (ジョブ番号付き)。 */
export const CTRL_NEXT_CHUNK = 3;
/** 総チャンク数。 */
export const CTRL_TOTAL_CHUNKS = 4;
/** 完了チャンク数 (ジョブ番号付き)。 */
export const CTRL_DONE_CHUNKS = 5;
/** 1 で Worker を終了する。 */
export const CTRL_SHUTDOWN = 6;
/** このジョブに必要な同期バージョン。 */
export const CTRL_SYNC_VERSION = 7;
/** パラメータの開始位置 (Float32 として再解釈)。 */
export const CTRL_PARAMS = 8;
/** パラメータの要素数。 */
export const CTRL_PARAM_COUNT = 64;
/** Worker で例外が起きたら 1。 */
export const CTRL_ERROR = 72;
/** 制御ブロックの int32 要素数。 */
export const CTRL_BLOCK_LENGTH = 73;
/** アーキタイプ行数表の要素数 (アーキタイプ ID の上限と同じ)。 */
export const ARCH_COUNTS_LENGTH = 65536;
/** 1 ジョブの最大チャンク数 (下位 16 ビット)。 */
export const MAX_JOB_CHUNKS = 0xffff;
/** ジョブ番号のマスク (15 ビット。印付きの値が正の int32 に収まるように)。 */
export const JOB_SEQ_MASK = 0x7fff;

/**
 * ジョブ番号と番号から印付きの値を作る。
 * @hot
 * @param seq ジョブ番号 (0〜JOB_SEQ_MASK)
 * @param n 番号 (0〜MAX_JOB_CHUNKS)
 * @returns 印付きの値
 */
export function tagged(seq: number, n: number): number {
  return (seq << 16) | n;
}

/**
 * チャンクを 1 つ取る。印がジョブ番号と違う (古いジョブ) か、取り尽くしたら -1。
 * @hot
 * @param ctrl 制御ブロック
 * @param seq ジョブ番号
 * @param total 総チャンク数
 * @returns チャンク番号、または -1
 */
export function claimChunk(ctrl: Int32Array, seq: number, total: number): number {
  for (;;) {
    const v = Atomics.load(ctrl, CTRL_NEXT_CHUNK);
    const n = v & MAX_JOB_CHUNKS;
    if (v >>> 16 !== seq || n >= total) return -1;
    if (Atomics.compareExchange(ctrl, CTRL_NEXT_CHUNK, v, v + 1) === v) return n;
  }
}

/**
 * チャンクの完了を数える。印がジョブ番号と違えば (古いジョブ) 何もしない。
 * @hot
 * @param ctrl 制御ブロック
 * @param seq ジョブ番号
 */
export function completeChunk(ctrl: Int32Array, seq: number): void {
  for (;;) {
    const v = Atomics.load(ctrl, CTRL_DONE_CHUNKS);
    if (v >>> 16 !== seq) return;
    if (Atomics.compareExchange(ctrl, CTRL_DONE_CHUNKS, v, v + 1) === v) return;
  }
}

/**
 * ジョブの完了数を返す。印が違えば -1。
 * @hot
 * @param ctrl 制御ブロック
 * @param seq ジョブ番号
 * @returns 完了数、または -1
 */
export function doneCount(ctrl: Int32Array, seq: number): number {
  const v = Atomics.load(ctrl, CTRL_DONE_CHUNKS);
  return v >>> 16 === seq ? v & MAX_JOB_CHUNKS : -1;
}
