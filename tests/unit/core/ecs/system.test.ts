import { describe, expect, it } from 'vitest';
import { MAX_KERNEL_PARAMS, Phase, defineSystem } from '../../../../src/core/ecs/system';
import type { Phase as PhaseValue } from '../../../../src/core/ecs/system';
import { ErrorCode } from '../../../../src/core/debug/pluto-error';

const KERNEL = { id: 1, name: 'k' };

describe('system', () => {
  it('Phase は 0〜4 の数値 (docs/01-architecture.md §4)', () => {
    expect(Phase).toEqual({ PreUpdate: 0, FixedUpdate: 1, Update: 2, PostUpdate: 3, PreRender: 4 });
  });

  it('defineSystem は kernel か run の一方だけを持つ記述子をそのまま返す', () => {
    const run = defineSystem({ name: 'r', phase: Phase.Update, query: {}, run: () => undefined });
    expect(run.name).toBe('r');
    const params = new Float32Array(MAX_KERNEL_PARAMS);
    expect(
      defineSystem({ name: 'k', phase: Phase.Update, query: {}, kernel: KERNEL, params }).params,
    ).toBe(params);
  });

  it('kernel と run の両方・どちらも無しは PlutoError(InvalidArgument)', () => {
    const both = {
      name: 'b',
      phase: Phase.Update,
      query: {},
      kernel: KERNEL,
      run: () => undefined,
    };
    expect(() => defineSystem(both)).toThrow(
      expect.objectContaining({ code: ErrorCode.InvalidArgument }),
    );
    expect(() => defineSystem({ name: 'n', phase: Phase.Update, query: {} })).toThrow(
      expect.objectContaining({ code: ErrorCode.InvalidArgument }),
    );
  });

  it('境界値: params の長さは 1〜MAX_KERNEL_PARAMS (64)、それ以外は PlutoError', () => {
    const base = { name: 'k', phase: Phase.Update, query: {}, kernel: KERNEL };
    expect(() => defineSystem({ ...base, params: new Float32Array(64) })).not.toThrow();
    expect(() => defineSystem({ ...base, params: new Float32Array(65) })).toThrow(
      expect.objectContaining({ code: ErrorCode.InvalidArgument }),
    );
    expect(() => defineSystem({ ...base, params: new Float32Array(0) })).toThrow(
      expect.objectContaining({ code: ErrorCode.InvalidArgument }),
    );
  });

  it('不正な phase は PlutoError(InvalidArgument)', () => {
    expect(() =>
      defineSystem({ name: 'p', phase: 9 as PhaseValue, query: {}, run: () => undefined }),
    ).toThrow(expect.objectContaining({ code: ErrorCode.InvalidArgument }));
  });
});
