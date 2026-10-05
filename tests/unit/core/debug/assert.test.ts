import { describe, it, expect } from 'vitest';
import { assert, unreachable } from '../../../../src/core/debug/assert';

describe('assert', () => {
  it('conditionがtrueのときは例外を投げない', () => {
    expect(() => {
      assert(true, 'should not throw');
    }).not.toThrow();
  });

  it('conditionがfalseかつ__DEBUG__がtrueのときは例外を投げる', () => {
    // vitest.config.ts で __DEBUG__ は true に設定されている
    expect(() => {
      assert(false, 'should throw');
    }).toThrow('should throw');
  });
});

describe('unreachable', () => {
  it('常に例外を投げる', () => {
    expect(() => {
      unreachable(42 as never);
    }).toThrow('Unreachable: 42');
  });
});
