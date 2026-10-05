import { describe, expect, it, vi, afterEach } from 'vitest';
import {
  createBackingBuffer,
  growBackingBuffer,
  isSharedMemoryEnabled,
} from '../../../../src/core/memory/buffer-factory';

describe('buffer-factory', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('isSharedMemoryEnabled', () => {
    it('returns true when __PARALLEL__ is true and crossOriginIsolated is true', () => {
      vi.stubGlobal('__PARALLEL__', true);
      vi.stubGlobal('crossOriginIsolated', true);
      expect(isSharedMemoryEnabled()).toBe(true);
    });

    it('returns false when __PARALLEL__ is false', () => {
      vi.stubGlobal('__PARALLEL__', false);
      vi.stubGlobal('crossOriginIsolated', true);
      expect(isSharedMemoryEnabled()).toBe(false);
    });

    it('returns false when crossOriginIsolated is false or undefined', () => {
      vi.stubGlobal('__PARALLEL__', true);
      vi.stubGlobal('crossOriginIsolated', false);
      expect(isSharedMemoryEnabled()).toBe(false);
      vi.stubGlobal('crossOriginIsolated', undefined);
      expect(isSharedMemoryEnabled()).toBe(false);
    });
  });

  describe('createBackingBuffer', () => {
    it('creates ArrayBuffer when shared memory is disabled', () => {
      vi.stubGlobal('__PARALLEL__', false);
      vi.stubGlobal('__DEBUG__', false);
      const buffer = createBackingBuffer(16, 32);
      expect(buffer).toBeInstanceOf(ArrayBuffer);
      expect(buffer.byteLength).toBe(16);
    });

    it('creates SharedArrayBuffer when shared memory is enabled', () => {
      vi.stubGlobal('__PARALLEL__', true);
      vi.stubGlobal('crossOriginIsolated', true);
      vi.stubGlobal('__DEBUG__', false);
      const buffer = createBackingBuffer(16, 32);
      expect(buffer).toBeInstanceOf(SharedArrayBuffer);
      expect(buffer.byteLength).toBe(16);
    });

    it('throws if initialBytes is not a multiple of 8', () => {
      vi.stubGlobal('__PARALLEL__', false);
      vi.stubGlobal('__DEBUG__', true);
      expect(() => {
        createBackingBuffer(4, 32);
      }).toThrow();
    });

    it('throws if maxBytes is not a multiple of 8', () => {
      vi.stubGlobal('__PARALLEL__', false);
      vi.stubGlobal('__DEBUG__', true);
      expect(() => {
        createBackingBuffer(16, 31);
      }).toThrow();
    });

    it('throws if initialBytes > maxBytes', () => {
      vi.stubGlobal('__PARALLEL__', false);
      vi.stubGlobal('__DEBUG__', true);
      expect(() => {
        createBackingBuffer(32, 16);
      }).toThrow();
    });
  });

  describe('growBackingBuffer', () => {
    it('grows ArrayBuffer', () => {
      vi.stubGlobal('__PARALLEL__', false);
      vi.stubGlobal('__DEBUG__', false);
      const buffer = createBackingBuffer(16, 32) as ArrayBuffer;
      growBackingBuffer(buffer, 24);
      expect(buffer.byteLength).toBe(24);
    });

    it('grows SharedArrayBuffer', () => {
      vi.stubGlobal('__PARALLEL__', true);
      vi.stubGlobal('crossOriginIsolated', true);
      vi.stubGlobal('__DEBUG__', false);
      const buffer = createBackingBuffer(16, 32) as SharedArrayBuffer;
      growBackingBuffer(buffer, 24);
      expect(buffer.byteLength).toBe(24);
    });

    it('throws if newBytes is not a multiple of 8', () => {
      vi.stubGlobal('__PARALLEL__', false);
      vi.stubGlobal('__DEBUG__', true);
      const buffer = createBackingBuffer(16, 32);
      expect(() => {
        growBackingBuffer(buffer, 20);
      }).toThrow();
    });

    it('throws if newBytes is not greater than current byteLength', () => {
      vi.stubGlobal('__PARALLEL__', false);
      vi.stubGlobal('__DEBUG__', true);
      const buffer = createBackingBuffer(16, 32);
      expect(() => {
        growBackingBuffer(buffer, 16);
      }).toThrow();
      expect(() => {
        growBackingBuffer(buffer, 8);
      }).toThrow();
    });

    it('throws if buffer does not support grow or resize', () => {
      vi.stubGlobal('__DEBUG__', true);
      const fakeBuffer = new ArrayBuffer(16); // non-resizable
      expect(() => {
        growBackingBuffer(fakeBuffer, 24);
      }).toThrow();
    });
  });
});
