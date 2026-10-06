import { beforeEach, describe, expect, it } from 'vitest';
import {
  clearKernelRegistryForTesting,
  findKernel,
  fnv1a32,
  getAllKernels,
  getKernelById,
  registerKernel,
} from '../../../src/jobs/kernel-registry';
import { ErrorCode } from '../../../src/core/debug/pluto-error';

describe('kernel-registry', () => {
  beforeEach(() => {
    clearKernelRegistryForTesting();
  });

  it('fnv1a32 は FNV-1a 32 ビットの既知値と一致する', () => {
    // 参照値: FNV-1a 32 ("" = 0x811c9dc5, "a" = 0xe40c292c, "foobar" = 0xbf9cf968)
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
  });

  it('登録・検索・一覧ができる', () => {
    const k = registerKernel('K', () => undefined);
    expect(findKernel(k.id)).toBe(k);
    expect(getKernelById(k.id)).toBe(k);
    expect(getAllKernels()).toEqual([k]);
  });

  it('未登録の ID は findKernel が undefined、getKernelById が PlutoError(InvalidArgument)', () => {
    expect(findKernel(123)).toBeUndefined();
    expect(() => getKernelById(123)).toThrow(
      expect.objectContaining({ code: ErrorCode.InvalidArgument }),
    );
  });

  it('ハッシュが衝突する別名のカーネルは PlutoError(InvalidArgument)', () => {
    // 'costarring' と 'liquid' は FNV-1a 32 で衝突することが知られている
    expect(fnv1a32('costarring')).toBe(fnv1a32('liquid'));
    registerKernel('costarring', () => undefined);
    expect(() => registerKernel('liquid', () => undefined)).toThrow(
      expect.objectContaining({ code: ErrorCode.InvalidArgument }),
    );
  });
});
