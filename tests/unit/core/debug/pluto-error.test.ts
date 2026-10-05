import { describe, expect, it } from 'vitest';
import { PlutoError, ErrorCode } from '../../../../src/core/debug/pluto-error';

describe('PlutoError', () => {
  it('should create an error with code and message', () => {
    const err = new PlutoError(ErrorCode.CapacityExceeded, 'テストメッセージ');
    expect(err).toBeInstanceOf(Error);
    expect(err.name).toBe('PlutoError');
    expect(err.code).toBe(ErrorCode.CapacityExceeded);
    expect(err.message).toBe(`[${ErrorCode.CapacityExceeded}] テストメッセージ`);
  });
});
