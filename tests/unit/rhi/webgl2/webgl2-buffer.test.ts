import { describe, expect, it } from 'vitest';
import { ErrorCode, PlutoError } from '../../../../src/core/debug';
import { BufferUsage } from '../../../../src/rhi/types';
import { WebGlBuffer } from '../../../../src/rhi/webgl2/webgl2-buffer';

/** 記録された GL 呼び出し。 */
const calls: string[] = [];

/**
 * `WebGL2RenderingContext` の偽物。バッファ系だけ持つ。
 * @returns 偽物のコンテキスト
 */
function fakeGl(): WebGL2RenderingContext {
  let nextId = 1;
  const stub: Pick<
    WebGL2RenderingContext,
    | 'createBuffer'
    | 'bindBuffer'
    | 'bufferData'
    | 'bufferSubData'
    | 'getBufferSubData'
    | 'deleteBuffer'
    | 'createTexture'
    | 'bindTexture'
    | 'texImage2D'
    | 'texSubImage2D'
    | 'deleteTexture'
  > = {
    createBuffer: (): WebGLBuffer => {
      calls.push('createBuffer');
      return { id: nextId++ };
    },
    bindBuffer: (): undefined => {
      calls.push('bindBuffer');
      return undefined;
    },
    bufferData: (...args: unknown[]): undefined => {
      calls.push(`bufferData:${String(args[1])}`);
      return undefined;
    },
    bufferSubData: (...args: unknown[]): undefined => {
      calls.push(`bufferSubData:${String(args[1])}`);
      return undefined;
    },
    getBufferSubData: (...args: unknown[]): undefined => {
      calls.push('getBufferSubData');
      const dst = args[2] as ArrayBufferView;
      new Uint8Array(dst.buffer, dst.byteOffset, dst.byteLength).fill(7);
      return undefined;
    },
    deleteBuffer: (): undefined => {
      calls.push('deleteBuffer');
      return undefined;
    },
    createTexture: (): WebGLTexture => {
      calls.push('createTexture');
      return { id: nextId++ };
    },
    bindTexture: (): undefined => {
      calls.push('bindTexture');
      return undefined;
    },
    texImage2D: (...args: unknown[]): undefined => {
      calls.push(`texImage2D:${String(args[3])}x${String(args[4])}`);
      return undefined;
    },
    texSubImage2D: (...args: unknown[]): undefined => {
      const x = args[2] as number;
      const y = args[3] as number;
      const w = args[4] as number;
      const h = args[5] as number;
      calls.push(`texSubImage2D:${String(x)},${String(y)},${String(w)}x${String(h)}`);
      return undefined;
    },
    deleteTexture: (): undefined => {
      calls.push('deleteTexture');
      return undefined;
    },
  };
  return stub as WebGL2RenderingContext;
}

describe('webgl2 バッファ: UBO', () => {
  it('生成時に大きさで確保する', () => {
    calls.length = 0;
    const buf = new WebGlBuffer(fakeGl(), 'u', 64, BufferUsage.Uniform);
    expect(buf.isStorage).toBe(false);
    expect(calls).toContain('bufferData:64');
  });

  it('書き込みは bufferSubData になる', () => {
    calls.length = 0;
    const buf = new WebGlBuffer(fakeGl(), 'u', 64, BufferUsage.Uniform);
    buf.write(16, new Uint8Array(8));
    expect(calls).toContain('bufferSubData:16');
  });

  it('読み出しは getBufferSubData になる', () => {
    const buf = new WebGlBuffer(fakeGl(), 'u', 64, BufferUsage.MapRead | BufferUsage.CopyDst);
    const out = buf.readAsync(0, 8);
    expect(new Uint8Array(out)[0]).toBe(7);
  });

  it('破棄は 2 回呼んでも deleteBuffer は 1 回だけ', () => {
    calls.length = 0;
    const buf = new WebGlBuffer(fakeGl(), 'u', 64, BufferUsage.Uniform);
    buf.destroy();
    buf.destroy();
    expect(calls.filter((c) => c === 'deleteBuffer')).toHaveLength(1);
  });
});

describe('webgl2 バッファ: データテクスチャ', () => {
  it('生成時に 2048 幅で確保する', () => {
    calls.length = 0;
    const buf = new WebGlBuffer(fakeGl(), 's', 64, BufferUsage.Storage);
    expect(buf.isStorage).toBe(true);
    expect(calls).toContain('texImage2D:2048x1');
  });

  it('32 バイトの書き込みは 2 texel になる', () => {
    calls.length = 0;
    const buf = new WebGlBuffer(fakeGl(), 's', 65536, BufferUsage.Storage);
    buf.write(0, new Uint8Array(32));
    expect(calls).toContain('texSubImage2D:0,0,2x1');
  });

  it('行をまたぐ書き込みは分ける', () => {
    calls.length = 0;
    const buf = new WebGlBuffer(fakeGl(), 's', 65536, BufferUsage.Storage);
    buf.write(32760, new Uint8Array(32));
    expect(calls).toContain('texSubImage2D:2047,0,1x1');
    expect(calls).toContain('texSubImage2D:0,1,2x1');
  });

  it('読み出しは UnsupportedFeature になる', () => {
    const buf = new WebGlBuffer(fakeGl(), 's', 64, BufferUsage.Storage);
    let caught: unknown;
    try {
      buf.readAsync(0, 8);
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(PlutoError);
    expect((caught as PlutoError).code).toBe(ErrorCode.UnsupportedFeature);
  });
});
