import { beforeEach, describe, expect, it } from 'vitest';
import { KernelBufferSlot, MAX_KERNEL_PARAMS, defineKernel } from '../../../src/jobs/kernel';
import {
  clearKernelRegistryForTesting,
  fnv1a32,
  getKernelById,
} from '../../../src/jobs/kernel-registry';
import { ErrorCode } from '../../../src/core/debug/pluto-error';

describe('kernel', () => {
  beforeEach(() => {
    clearKernelRegistryForTesting();
  });

  it('defineKernel は名前の FNV-1a ハッシュを ID にして登録する', () => {
    const fn = (): void => undefined;
    const def = defineKernel('Move', fn);
    expect(def.id).toBe(fnv1a32('Move'));
    expect(def.fn).toBe(fn);
    expect(getKernelById(def.id)).toBe(def);
  });

  it('ID は登録順に依存しない (メインと Worker で一致する)', () => {
    const a1 = defineKernel('A', () => undefined).id;
    const b1 = defineKernel('B', () => undefined).id;
    clearKernelRegistryForTesting();
    const b2 = defineKernel('B', () => undefined).id;
    const a2 = defineKernel('A', () => undefined).id;
    expect([a2, b2]).toEqual([a1, b1]);
  });

  it('同じ名前の再定義は PlutoError(InvalidArgument)', () => {
    defineKernel('Dup', () => undefined);
    expect(() => defineKernel('Dup', () => undefined)).toThrow(
      expect.objectContaining({ code: ErrorCode.InvalidArgument }),
    );
  });

  it('MAX_KERNEL_PARAMS は 64、KernelBufferSlot は 05 §2 の値', () => {
    expect(MAX_KERNEL_PARAMS).toBe(64);
    expect(KernelBufferSlot).toEqual({
      SpriteStagingU32: 0,
      SpriteStagingF32: 0,
      SpriteDirtyBits: 0,
      CullOutput: 1,
      CullCounters: 1,
    });
  });
});
