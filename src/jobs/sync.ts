// @pluto-hot
/**
 * @file ジョブシステムの並列同期に用いる Atomics 用の制御ブロック（SharedArrayBuffer）レイアウト定数
 */

export const CTRL_EPOCH = 0;
export const CTRL_KERNEL_ID = 1;
export const CTRL_QUERY_ID = 2;
export const CTRL_NEXT_CHUNK = 3;
export const CTRL_TOTAL_CHUNKS = 4;
export const CTRL_DONE_CHUNKS = 5;
export const CTRL_SHUTDOWN = 6;
export const CTRL_PARAMS_OFFSET = 8;
export const CTRL_MAX_PARAMS = 64;

/** 制御ブロックに必要な全体の Int32 要素数 */
export const CTRL_BLOCK_LENGTH = CTRL_PARAMS_OFFSET + CTRL_MAX_PARAMS;
