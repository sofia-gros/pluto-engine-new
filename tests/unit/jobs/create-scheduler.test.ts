import { describe, expect, it, vi } from 'vitest';
import { createScheduler } from '../../../src/jobs/create-scheduler';
import { SerialScheduler } from '../../../src/jobs/serial-scheduler';

/**
 * vitest では `__PARALLEL__` が false に固定されている (docs/05 §4)。
 * そのため Node では Serial に縮退する経路だけを検証する。
 * Threaded を選ぶ経路と `logger.warn` はブラウザテスト (tests/browser/jobs/parity.spec.ts) の責務。
 */
describe('createScheduler', () => {
  it('embed ビルドでは SerialScheduler を返す', () => {
    const scheduler = createScheduler();
    expect(scheduler).toBeInstanceOf(SerialScheduler);
    expect(scheduler.concurrency).toBe(1);
  });

  it('maxWorkers を渡しても embed ビルドでは縮退する', () => {
    const scheduler = createScheduler({ maxWorkers: 4 });
    expect(scheduler).toBeInstanceOf(SerialScheduler);
  });

  it('SerialScheduler には Worker が無いので dispose で何も起きない', () => {
    const scheduler = createScheduler();
    expect(() => {
      scheduler.dispose();
    }).not.toThrow();
  });

  it('縮退時に logger.warn を呼び出さない (embed は __PARALLEL__ が false のため)', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {
      return undefined;
    });
    createScheduler();
    // embed では警告しない。警告の検証はブラウザテストの embed プロジェクトで行う。
    expect(warn).not.toHaveBeenCalled();
    warn.mockRestore();
  });
});
