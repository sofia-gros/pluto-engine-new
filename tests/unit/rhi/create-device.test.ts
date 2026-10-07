/**
 * @file createDevice のユニットテスト (docs/06-rhi.md §2)。
 * 不正引数の検証とモックによる生成分岐のテストを行う。
 */
import { describe, expect, it } from 'vitest';
import { ErrorCode, PlutoError } from '../../../src/core/debug';
import { createDevice, type CreateDeviceOptions } from '../../../src/rhi/create-device';

/** 描画先キャンバスの偽物。 */
function fakeCanvas(): HTMLCanvasElement {
  const stub: Pick<HTMLCanvasElement, 'width' | 'height' | 'addEventListener' | 'getContext'> = {
    width: 256,
    height: 256,
    addEventListener: (): undefined => undefined,
    getContext: (): null => null,
  };
  return stub as HTMLCanvasElement;
}

describe('createDevice の引数検証', () => {
  it('canvas が未指定の場合は InvalidArgument を投げる', async () => {
    let caught: unknown;
    try {
      const opts: Partial<CreateDeviceOptions> = {};
      await createDevice(opts as CreateDeviceOptions);
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PlutoError);
    expect((caught as PlutoError).code).toBe(ErrorCode.InvalidArgument);
  });

  it('不正な backend の場合は InvalidArgument を投げる', async () => {
    let caught: unknown;
    try {
      await createDevice({
        canvas: fakeCanvas(),
        backend: 'invalid' as 'auto',
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PlutoError);
    expect((caught as PlutoError).code).toBe(ErrorCode.InvalidArgument);
  });

  it('不正な powerPreference の場合は InvalidArgument を投げる', async () => {
    let caught: unknown;
    try {
      await createDevice({
        canvas: fakeCanvas(),
        powerPreference: 'turbo' as 'high-performance',
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PlutoError);
    expect((caught as PlutoError).code).toBe(ErrorCode.InvalidArgument);
  });

  it('Node 環境で GPU が無い場合は GpuUnavailable を投げる', async () => {
    let caught: unknown;
    try {
      await createDevice({ canvas: fakeCanvas(), backend: 'auto' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PlutoError);
    expect((caught as PlutoError).code).toBe(ErrorCode.GpuUnavailable);
  });

  it('webgl2 バックエンド指定でコンテキスト取得失敗時に GpuUnavailable を投げる', async () => {
    let caught: unknown;
    try {
      await createDevice({ canvas: fakeCanvas(), backend: 'webgl2' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PlutoError);
    expect((caught as PlutoError).code).toBe(ErrorCode.GpuUnavailable);
  });

  it('webgpu バックエンド指定で navigator.gpu が無い時に GpuUnavailable を投げる', async () => {
    let caught: unknown;
    try {
      await createDevice({ canvas: fakeCanvas(), backend: 'webgpu' });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeInstanceOf(PlutoError);
    expect((caught as PlutoError).code).toBe(ErrorCode.GpuUnavailable);
  });
});
