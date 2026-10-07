import { describe, expect, it } from 'vitest';
import { ErrorCode, PlutoError } from '../../../../src/core/debug';
import { BufferUsage } from '../../../../src/rhi/types';
import { WebGpuBuffer } from '../../../../src/rhi/webgpu/webgpu-buffer';

/** 何もしない。スタブは値だけ必要。実定義の戻り値に合わせて `undefined` を返す。 */
function noop(): undefined {
  return undefined;
}

/**
 * `GPUBuffer` の偽物を作る。
 * @param size バイト数
 * @returns 偽物のバッファ
 */
function fakeGpuBuffer(size: number): GPUBuffer {
  const stub: Pick<
    GPUBuffer,
    '__brand' | 'size' | 'usage' | 'mapAsync' | 'getMappedRange' | 'unmap' | 'destroy'
  > = {
    __brand: 'GPUBuffer',
    size,
    usage: 0,
    mapAsync: () => Promise.resolve(undefined),
    getMappedRange: () => new ArrayBuffer(8),
    unmap: noop,
    destroy: noop,
  };
  return stub as GPUBuffer;
}

/**
 * 検証が `PlutoError` を送出することを確認する。
 * @param fn 検証関数
 * @param code 期待するエラーコード
 */
function expectThrows(fn: () => Promise<ArrayBuffer>, code: ErrorCode): Promise<void> {
  return fn().then(
    (): void => {
      expect.unreachable('例外が送出されなかった');
    },
    (e: unknown): void => {
      expect(e).toBeInstanceOf(PlutoError);
      expect((e as PlutoError).code).toBe(code);
    },
  );
}

describe('webgpu バッファ', () => {
  it('ラベルと大きさと用途を持つ', () => {
    const buf = new WebGpuBuffer(fakeGpuBuffer(64), 'b', 64, BufferUsage.Storage);
    expect(buf.label).toBe('b');
    expect(buf.sizeBytes).toBe(64);
    expect(buf.usage).toBe(BufferUsage.Storage);
  });

  it('MapRead が無いと読み出せない', async () => {
    const buf = new WebGpuBuffer(fakeGpuBuffer(64), 'b', 64, BufferUsage.Storage);
    await expectThrows(() => buf.readAsync(0, 8), ErrorCode.InvalidState);
  });

  it('範囲を超えると InvalidArgument になる', async () => {
    const buf = new WebGpuBuffer(
      fakeGpuBuffer(64),
      'b',
      64,
      BufferUsage.MapRead | BufferUsage.CopyDst,
    );
    await expectThrows(() => buf.readAsync(60, 8), ErrorCode.InvalidArgument);
    await expectThrows(() => buf.readAsync(0, 65), ErrorCode.InvalidArgument);
  });

  it('MapRead があれば読み出せる', async () => {
    const buf = new WebGpuBuffer(
      fakeGpuBuffer(64),
      'b',
      64,
      BufferUsage.MapRead | BufferUsage.CopyDst,
    );
    const out = await buf.readAsync(0, 8);
    expect(out.byteLength).toBe(8);
  });

  it('破棄は 2 回呼んでも安全で、破棄後は使えない', () => {
    const buf = new WebGpuBuffer(fakeGpuBuffer(64), 'b', 64, BufferUsage.Storage);
    buf.destroy();
    buf.destroy();
    expect((): GPUBuffer => buf.gpu).toThrow(PlutoError);
  });
});
