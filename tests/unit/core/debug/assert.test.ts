import { describe, it, expect, vi, afterEach } from 'vitest';
import { assert, unreachable } from '../../../../src/core/debug/assert';
import { PlutoError, ErrorCode } from '../../../../src/core/debug/pluto-error';

describe('debug utils', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  describe('assert', () => {
    it('__DEBUG__ が true で condition が false の場合は PlutoError を投げる', () => {
      vi.stubGlobal('__DEBUG__', true);
      expect(() => {
        assert(false, 'テストエラー');
      }).toThrow(PlutoError);
      try {
        assert(false, 'テストエラー');
      } catch (e: unknown) {
        if (e instanceof PlutoError) {
          expect(e.code).toBe(ErrorCode.InvalidState);
          expect(e.message).toContain('テストエラー');
        } else {
          expect.fail('Expected PlutoError');
        }
      }
    });

    it('__DEBUG__ が true で condition が true の場合は投げない', () => {
      vi.stubGlobal('__DEBUG__', true);
      expect(() => {
        assert(true, 'テストエラー');
      }).not.toThrow();
    });

    it('__DEBUG__ が false の場合は常に投げない', () => {
      vi.stubGlobal('__DEBUG__', false);
      expect(() => {
        assert(false, 'テストエラー');
      }).not.toThrow();
      expect(() => {
        assert(true, 'テストエラー');
      }).not.toThrow();
    });
  });

  describe('unreachable', () => {
    it('常に PlutoError を投げる', () => {
      expect(() => {
        unreachable('test' as never);
      }).toThrow(PlutoError);
    });
  });
});
