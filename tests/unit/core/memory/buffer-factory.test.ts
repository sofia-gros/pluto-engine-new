import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createBackingBuffer,
  isSharedMemoryEnabled,
} from '../../../../src/core/memory/buffer-factory';
import { PlutoError } from '../../../../src/core/debug/pluto-error';

describe('buffer-factory', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('isSharedMemoryEnabled', () => {
    it('__PARALLEL__ かつ crossOriginIsolated のときだけ true', () => {
      vi.stubGlobal('__PARALLEL__', true);
      vi.stubGlobal('crossOriginIsolated', true);
      expect(isSharedMemoryEnabled()).toBe(true);
    });

    it('__PARALLEL__ が false なら false', () => {
      vi.stubGlobal('__PARALLEL__', false);
      vi.stubGlobal('crossOriginIsolated', true);
      expect(isSharedMemoryEnabled()).toBe(false);
    });

    it('crossOriginIsolated が false / undefined なら false', () => {
      vi.stubGlobal('__PARALLEL__', true);
      vi.stubGlobal('crossOriginIsolated', false);
      expect(isSharedMemoryEnabled()).toBe(false);
      vi.stubGlobal('crossOriginIsolated', undefined);
      expect(isSharedMemoryEnabled()).toBe(false);
    });
  });

  describe('createBackingBuffer', () => {
    it('共有メモリが無効なら伸長しない ArrayBuffer を作る', () => {
      vi.stubGlobal('__PARALLEL__', false);
      const buffer = createBackingBuffer(16);
      expect(buffer).toBeInstanceOf(ArrayBuffer);
      expect(buffer.byteLength).toBe(16);
      expect(buffer instanceof ArrayBuffer && buffer.resizable).toBe(false);
    });

    it('共有メモリが有効なら伸長しない SharedArrayBuffer を作る', () => {
      vi.stubGlobal('__PARALLEL__', true);
      vi.stubGlobal('crossOriginIsolated', true);
      const buffer = createBackingBuffer(16);
      expect(buffer).toBeInstanceOf(SharedArrayBuffer);
      expect(buffer instanceof SharedArrayBuffer && buffer.growable).toBe(false);
    });

    it('境界値: 0 バイトは作れる', () => {
      expect(createBackingBuffer(0).byteLength).toBe(0);
    });

    it('8 の倍数でない・負のバイト数は assert で失敗する', () => {
      expect(() => createBackingBuffer(4)).toThrow(PlutoError);
      expect(() => createBackingBuffer(-8)).toThrow(PlutoError);
    });
  });
});
