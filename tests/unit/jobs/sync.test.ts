import { describe, expect, it } from 'vitest';
import {
  CTRL_BLOCK_LENGTH,
  CTRL_DONE_CHUNKS,
  CTRL_ERROR,
  CTRL_NEXT_CHUNK,
  CTRL_PARAMS,
  JOB_SEQ_MASK,
  MAX_JOB_CHUNKS,
  claimChunk,
  completeChunk,
  doneCount,
  tagged,
} from '../../../src/jobs/sync';

/**
 * ジョブを開始した状態の制御ブロックを作る (Atomics は非共有の配列でも動く)。
 * @param seq ジョブ番号
 * @returns 制御ブロック
 */
function startedCtrl(seq: number): Int32Array {
  const ctrl = new Int32Array(CTRL_BLOCK_LENGTH);
  ctrl[CTRL_NEXT_CHUNK] = tagged(seq, 0);
  ctrl[CTRL_DONE_CHUNKS] = tagged(seq, 0);
  return ctrl;
}

describe('sync', () => {
  it('制御ブロックのレイアウトが 05 §3.2 の表どおり', () => {
    expect([CTRL_NEXT_CHUNK, CTRL_DONE_CHUNKS, CTRL_PARAMS, CTRL_ERROR, CTRL_BLOCK_LENGTH]).toEqual(
      [3, 5, 8, 72, 73],
    );
  });

  it('claimChunk は 0 から順に番号を返し、取り尽くしたら -1', () => {
    const ctrl = startedCtrl(5);
    expect([claimChunk(ctrl, 5, 3), claimChunk(ctrl, 5, 3), claimChunk(ctrl, 5, 3)]).toEqual([
      0, 1, 2,
    ]);
    expect(claimChunk(ctrl, 5, 3)).toBe(-1);
  });

  it('古いジョブ番号での claim / complete は弾かれる (前ジョブとの競合防止)', () => {
    const ctrl = startedCtrl(6);
    expect(claimChunk(ctrl, 5, 10)).toBe(-1);
    completeChunk(ctrl, 5);
    expect(doneCount(ctrl, 6)).toBe(0);
    expect(doneCount(ctrl, 5)).toBe(-1);
  });

  it('completeChunk は現在のジョブの完了数を数える', () => {
    const ctrl = startedCtrl(1);
    completeChunk(ctrl, 1);
    completeChunk(ctrl, 1);
    expect(doneCount(ctrl, 1)).toBe(2);
  });

  it('境界値: 最大のジョブ番号・最大チャンク数でも正の int32 に収まる', () => {
    const v = tagged(JOB_SEQ_MASK, MAX_JOB_CHUNKS);
    expect(v).toBeGreaterThan(0);
    expect(v >>> 16).toBe(JOB_SEQ_MASK);
    const ctrl = startedCtrl(JOB_SEQ_MASK);
    ctrl[CTRL_NEXT_CHUNK] = tagged(JOB_SEQ_MASK, MAX_JOB_CHUNKS - 1);
    expect(claimChunk(ctrl, JOB_SEQ_MASK, MAX_JOB_CHUNKS)).toBe(MAX_JOB_CHUNKS - 1);
    expect(claimChunk(ctrl, JOB_SEQ_MASK, MAX_JOB_CHUNKS)).toBe(-1);
  });
});
