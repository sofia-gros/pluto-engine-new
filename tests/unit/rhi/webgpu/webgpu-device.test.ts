import { describe, expect, it } from 'vitest';
import { ErrorCode, PlutoError } from '../../../../src/core/debug';
import { toTransferSource } from '../../../../src/rhi/webgpu/webgpu-device';

describe('webgpu 転送元', () => {
  it('ArrayBuffer のビューは Uint8Array に包み直される', () => {
    const buf = new ArrayBuffer(16);
    const out = toTransferSource(new Uint8Array(buf, 4, 8));
    expect(out).toBeInstanceOf(Uint8Array);
    expect((out as Uint8Array).byteOffset).toBe(4);
    expect((out as Uint8Array).byteLength).toBe(8);
  });

  it('SharedArrayBuffer の全体はそのまま渡せる', () => {
    const sab = new SharedArrayBuffer(16);
    expect(toTransferSource(new Uint8Array(sab))).toBe(sab);
  });

  it('SharedArrayBuffer の途中からは InvalidArgument になる', () => {
    const sab = new SharedArrayBuffer(16);
    let caught: unknown;
    try {
      toTransferSource(new Uint8Array(sab, 8, 8));
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(PlutoError);
    expect((caught as PlutoError).code).toBe(ErrorCode.InvalidArgument);
  });
});
