import { describe, expect, it, beforeEach } from 'vitest';
import { defineKernel, KernelBufferSlot } from '../../../src/jobs/kernel';
import { getKernelById, clearKernelRegistryForTesting, getAllKernels } from '../../../src/jobs/kernel-registry';
import type { KernelFn, KernelId } from '../../../src/jobs/kernel';

describe('Kernel and KernelRegistry', () => {
  beforeEach(() => {
    clearKernelRegistryForTesting();
  });

  it('defines and registers a kernel', () => {
    const fn: KernelFn = () => {
      // noop
    };
    const def = defineKernel('TestKernel', fn);

    expect(def.name).toBe('TestKernel');
    expect(def.fn).toBe(fn);
    expect(def.id).toBe(0);

    const kernels = getAllKernels();
    expect(kernels).toHaveLength(1);
    expect(kernels[0]).toBe(def);
  });

  it('retrieves a kernel by ID', () => {
    const fn: KernelFn = () => {
      // noop
    };
    const def = defineKernel('MyKernel', fn);

    const retrieved = getKernelById(def.id);
    expect(retrieved).toBe(def);
  });

  it('throws when retrieving an unregistered ID', () => {
    expect(() => {
      getKernelById(999 as KernelId);
    }).toThrow('KernelRegistry: 未登録のカーネルIDです');
  });

  it('exports fixed buffer slots', () => {
    expect(KernelBufferSlot.SpriteStagingU32).toBe(0);
    expect(KernelBufferSlot.CullOutput).toBe(1);
  });
});
