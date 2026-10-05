import { describe, expect, it, vi } from 'vitest';
import { EventEmitter } from '../../../../src/core/events/event-emitter';

interface TestEventMap extends Record<string, unknown> {
  test1: { value: number };
  test2: { str: string };
  empty: Record<string, never>;
}

describe('EventEmitter', () => {
  it('registers and emits events', () => {
    const emitter = new EventEmitter<TestEventMap>();
    const handler = vi.fn();

    emitter.on('test1', handler);
    emitter.emit('test1', { value: 42 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ value: 42 });
  });

  it('registers and emits once events', () => {
    const emitter = new EventEmitter<TestEventMap>();
    const handler = vi.fn();

    emitter.once('test1', handler);
    emitter.emit('test1', { value: 42 });
    emitter.emit('test1', { value: 100 });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith({ value: 42 });
  });

  it('removes listeners', () => {
    const emitter = new EventEmitter<TestEventMap>();
    const handler = vi.fn();

    emitter.on('test2', handler);
    emitter.off('test2', handler);
    emitter.emit('test2', { str: 'hello' });

    expect(handler).not.toHaveBeenCalled();
  });

  it('does not fail when removing unknown listener', () => {
    const emitter = new EventEmitter<TestEventMap>();
    const handler = vi.fn();

    // イベントが一度も登録されていない状態
    emitter.off('test1', handler);

    emitter.on('test1', handler);
    const handler2 = vi.fn();
    // 登録されていないハンドラ
    emitter.off('test1', handler2);

    emitter.emit('test1', { value: 1 });
    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('handles multiple listeners', () => {
    const emitter = new EventEmitter<TestEventMap>();
    const handler1 = vi.fn();
    const handler2 = vi.fn();

    emitter.on('test1', handler1);
    emitter.on('test1', handler2);
    emitter.emit('test1', { value: 10 });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('handles removing a listener during emit without skipping others', () => {
    const emitter = new EventEmitter<TestEventMap>();
    const handler1 = vi.fn(() => {
      emitter.off('test1', handler1); // 自身を削除
    });
    const handler2 = vi.fn();

    emitter.on('test1', handler1);
    emitter.on('test1', handler2);
    emitter.emit('test1', { value: 10 });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1); // handler1が自身を削除してもhandler2は呼ばれる

    emitter.emit('test1', { value: 20 });
    expect(handler1).toHaveBeenCalledTimes(1); // もう呼ばれない
    expect(handler2).toHaveBeenCalledTimes(2); // handler2は呼ばれる
  });

  it('handles adding a listener during emit', () => {
    const emitter = new EventEmitter<TestEventMap>();
    const handler2 = vi.fn();
    const handler1 = vi.fn(() => {
      emitter.on('test1', handler2);
    });

    emitter.on('test1', handler1);
    emitter.emit('test1', { value: 10 });

    expect(handler1).toHaveBeenCalledTimes(1);
    // 同じ発火ループ中に新しく追加されたハンドラも呼ばれる
    expect(handler2).toHaveBeenCalledTimes(1);
  });

  it('handles nested emit correctly', () => {
    const emitter = new EventEmitter<TestEventMap>();
    const handler1 = vi.fn(() => {
      emitter.emit('test2', { str: 'nested' });
    });
    const handler2 = vi.fn();

    emitter.on('test1', handler1);
    emitter.on('test2', handler2);

    emitter.emit('test1', { value: 10 });

    expect(handler1).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledTimes(1);
    expect(handler2).toHaveBeenCalledWith({ str: 'nested' });
  });
});
