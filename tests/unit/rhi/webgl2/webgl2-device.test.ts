import { describe, expect, it } from 'vitest';
import { ErrorCode, PlutoError } from '../../../../src/core/debug';
import { BufferUsage } from '../../../../src/rhi/types';
import { WebGlDevice } from '../../../../src/rhi/webgl2/webgl2-device';

/** 記録された GL 呼び出し。 */
const calls: string[] = [];

/** 有効な拡張の名前。 */
let extensions: string[] = [
  'EXT_color_buffer_float',
  'EXT_float_blend',
  'WEBGL_compressed_texture_etc',
];

/**
 * `WebGL2RenderingContext` の偽物。デバイス系の呼び出しを持つ。
 * @returns 偽物のコンテキスト
 */
function fakeGl(): WebGL2RenderingContext {
  let nextId = 1;
  const stub: Pick<
    WebGL2RenderingContext,
    | 'getExtension'
    | 'getParameter'
    | 'createBuffer'
    | 'bindBuffer'
    | 'bufferData'
    | 'bufferSubData'
    | 'createTexture'
    | 'bindTexture'
    | 'texParameteri'
    | 'texImage2D'
    | 'texImage3D'
    | 'compressedTexImage2D'
    | 'texSubImage2D'
    | 'createSampler'
    | 'samplerParameteri'
    | 'createFramebuffer'
    | 'bindFramebuffer'
    | 'framebufferTexture2D'
    | 'drawBuffers'
    | 'checkFramebufferStatus'
    | 'deleteFramebuffer'
    | 'createShader'
    | 'shaderSource'
    | 'compileShader'
    | 'getShaderParameter'
    | 'deleteShader'
    | 'createProgram'
    | 'attachShader'
    | 'linkProgram'
    | 'getProgramParameter'
    | 'deleteProgram'
    | 'getActiveUniform'
    | 'getUniformLocation'
    | 'uniformBlockBinding'
    | 'pixelStorei'
    | 'clearColor'
    | 'clearDepth'
    | 'clear'
    | 'viewport'
    | 'scissor'
    | 'flush'
  > = {
    getExtension: ((name: string): unknown => {
      calls.push(`ext:${name}`);
      return extensions.includes(name) ? {} : null;
    }) as WebGL2RenderingContext['getExtension'],
    getParameter: (...args: unknown[]): unknown => {
      const pname = args[0] as number;
      if (pname === 0x0d33) return 4096;
      if (pname === 0x88ff) return 64;
      if (pname === 0x8a34) return 256;
      return 0;
    },
    createBuffer: (): WebGLBuffer => ({ id: nextId++ }),
    bindBuffer: (): undefined => undefined,
    bufferData: (): undefined => undefined,
    bufferSubData: (...args: unknown[]): undefined => {
      calls.push(`bufferSubData:${String(args[1])}`);
      return undefined;
    },
    createTexture: (): WebGLTexture => ({ id: nextId++ }),
    bindTexture: (): undefined => undefined,
    texParameteri: (): undefined => undefined,
    texImage2D: (): undefined => {
      calls.push('texImage2D');
      return undefined;
    },
    texImage3D: (): undefined => undefined,
    compressedTexImage2D: (): undefined => {
      calls.push('compressedTexImage2D');
      return undefined;
    },
    texSubImage2D: (...args: unknown[]): undefined => {
      calls.push(`texSubImage2D:${String(args[2])},${String(args[3])}`);
      return undefined;
    },
    createSampler: (): WebGLSampler => ({ id: nextId++ }),
    samplerParameteri: (): undefined => undefined,
    createFramebuffer: (): WebGLFramebuffer => ({ id: nextId++ }),
    bindFramebuffer: (): undefined => undefined,
    framebufferTexture2D: (...args: unknown[]): undefined => {
      calls.push(`attach:${String(args[1])}`);
      return undefined;
    },
    drawBuffers: (...args: unknown[]): undefined => {
      calls.push(`drawBuffers:${String((args[0] as number[]).length)}`);
      return undefined;
    },
    checkFramebufferStatus: (): number => 0x8cd5,
    deleteFramebuffer: (): undefined => {
      calls.push('deleteFramebuffer');
      return undefined;
    },
    createShader: (): WebGLShader => ({ id: nextId++ }),
    shaderSource: (): undefined => undefined,
    compileShader: (): undefined => undefined,
    getShaderParameter: (): unknown => true,
    deleteShader: (): undefined => undefined,
    createProgram: (): WebGLProgram => ({ id: nextId++ }),
    attachShader: (): undefined => undefined,
    linkProgram: (): undefined => undefined,
    getProgramParameter: (...args: unknown[]): unknown => {
      const pname = args[1] as number;
      if (pname === 0x8a36) return 0;
      if (pname === 0x8b4c) return 0;
      return true;
    },
    deleteProgram: (): undefined => undefined,
    getActiveUniform: (): null => null,
    getUniformLocation: (): WebGLUniformLocation | null => ({}),
    uniformBlockBinding: (): undefined => undefined,
    pixelStorei: (): undefined => undefined,
    clearColor: (): undefined => undefined,
    clearDepth: (): undefined => undefined,
    clear: (): undefined => undefined,
    viewport: (): undefined => undefined,
    scissor: (): undefined => undefined,
    flush: (): undefined => {
      calls.push('flush');
      return undefined;
    },
  };
  return stub as WebGL2RenderingContext;
}

/** 描画先キャンバスの偽物。 */
function fakeCanvas(): HTMLCanvasElement {
  const stub: Pick<HTMLCanvasElement, 'width' | 'height' | 'addEventListener'> = {
    width: 256,
    height: 256,
    addEventListener: (): undefined => undefined,
  };
  return stub as HTMLCanvasElement;
}

/**
 * 検証が `PlutoError` を送出することを確認する。
 * @param fn 検証関数
 * @param code 期待するエラーコード
 */
function expectThrows(fn: () => void, code: ErrorCode): void {
  let caught: unknown;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(PlutoError);
  expect((caught as PlutoError).code).toBe(code);
}

describe('webgl2 デバイス: 能力', () => {
  it('拡張の有無が caps になる', () => {
    extensions = ['EXT_color_buffer_float', 'EXT_float_blend', 'WEBGL_compressed_texture_etc'];
    const dev = new WebGlDevice({ gl: fakeGl(), canvas: fakeCanvas() });
    expect(dev.caps.backend).toBe('webgl2');
    expect(dev.caps.compute).toBe(false);
    expect(dev.caps.indirectDraw).toBe(false);
    expect(dev.caps.floatRenderTarget).toBe(true);
    expect(dev.caps.floatBlend).toBe(true);
    expect(dev.caps.textureCompressionETC2).toBe(true);
    expect(dev.caps.textureCompressionBC7).toBe(false);
    expect(dev.caps.maxTextureSize).toBe(4096);
    expect(dev.caps.minUniformBufferOffsetAlignment).toBe(256);
    expect(dev.caps.minStorageBufferOffsetAlignment).toBe(16);
  });

  it('必須拡張が無いと GpuUnavailable になる', () => {
    extensions = [];
    expectThrows(() => {
      new WebGlDevice({ gl: fakeGl(), canvas: fakeCanvas() });
    }, ErrorCode.GpuUnavailable);
    extensions = ['EXT_color_buffer_float', 'EXT_float_blend', 'WEBGL_compressed_texture_etc'];
  });

  it('compute のパイプラインは UnsupportedFeature になる', () => {
    const dev = new WebGlDevice({ gl: fakeGl(), canvas: fakeCanvas() });
    expectThrows(() => {
      dev.createComputePipeline({
        computeShader: { name: 'c', glslVertex: 'v', glslFragment: 'f' },
        layouts: [],
        workgroupSize: [64, 1, 1],
      });
    }, ErrorCode.UnsupportedFeature);
  });

  it('タイムスタンプ拡張が無いと querySet は null になる', () => {
    const dev = new WebGlDevice({ gl: fakeGl(), canvas: fakeCanvas() });
    expect(dev.createQuerySet(4)).toBeNull();
  });
});

describe('webgl2 デバイス: 転送', () => {
  it('UBO の部分転送は bufferSubData になる', () => {
    calls.length = 0;
    const dev = new WebGlDevice({ gl: fakeGl(), canvas: fakeCanvas() });
    const buf = dev.createBuffer({ sizeBytes: 64, usage: BufferUsage.Uniform });
    dev.writeBuffer(buf, 8, new Uint8Array([1, 2, 3, 4]), 1, 2);
    expect(calls).toContain('bufferSubData:8');
  });

  it('圧縮テクスチャは生成時に確保する', () => {
    calls.length = 0;
    const dev = new WebGlDevice({ gl: fakeGl(), canvas: fakeCanvas() });
    dev.createTexture({ format: 11, width: 8, height: 8, layers: 1, usage: 4 });
    expect(calls).toContain('compressedTexImage2D');
  });

  it('非圧縮テクスチャは texSubImage2D で書く', () => {
    calls.length = 0;
    const dev = new WebGlDevice({ gl: fakeGl(), canvas: fakeCanvas() });
    const tex = dev.createTexture({ format: 0, width: 64, height: 64, layers: 1, usage: 2 });
    dev.writeTexture(
      tex,
      { offsetX: 4, offsetY: 8, layer: 0, width: 16, height: 16 },
      new Uint8Array(1024),
    );
    expect(calls).toContain('texSubImage2D:4,8');
  });

  it('範囲外の書き込みは InvalidArgument になる', () => {
    const dev = new WebGlDevice({ gl: fakeGl(), canvas: fakeCanvas() });
    const tex = dev.createTexture({ format: 0, width: 64, height: 64, layers: 1, usage: 2 });
    expectThrows(() => {
      dev.writeTexture(
        tex,
        { offsetX: 60, offsetY: 0, layer: 0, width: 8, height: 8 },
        new Uint8Array(256),
      );
    }, ErrorCode.InvalidArgument);
  });
});

describe('webgl2 デバイス: 描画先', () => {
  it('スワップチェーンは目印付きで返る', () => {
    const dev = new WebGlDevice({ gl: fakeGl(), canvas: fakeCanvas() });
    const tex = dev.getCurrentTexture();
    expect(tex.width).toBe(256);
    expect(tex.format).toBe(1);
  });

  it('テクスチャへのパスはフレームバッファを作る', () => {
    calls.length = 0;
    const dev = new WebGlDevice({ gl: fakeGl(), canvas: fakeCanvas() });
    const tex = dev.createTexture({ format: 1, width: 64, height: 64, layers: 1, usage: 8 });
    const enc = dev.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: tex, load: 0, store: true, clearColor: [0, 0, 0, 1] }],
    });
    pass.end();
    dev.submit(enc);
    expect(calls).toContain('attach:36064');
    expect(calls).toContain('drawBuffers:1');
    expect(calls).toContain('flush');
  });

  it('混ぜると InvalidArgument になる', () => {
    const dev = new WebGlDevice({ gl: fakeGl(), canvas: fakeCanvas() });
    const tex = dev.createTexture({ format: 1, width: 64, height: 64, layers: 1, usage: 8 });
    const swap = dev.getCurrentTexture();
    const enc = dev.createCommandEncoder();
    expectThrows(() => {
      enc.beginRenderPass({
        colorAttachments: [
          { view: swap, load: 0, store: true, clearColor: [0, 0, 0, 1] },
          { view: tex, load: 1, store: true },
        ],
      });
    }, ErrorCode.InvalidArgument);
  });

  it('破棄するとフレームバッファを消す', () => {
    calls.length = 0;
    const dev = new WebGlDevice({ gl: fakeGl(), canvas: fakeCanvas() });
    const tex = dev.createTexture({ format: 1, width: 64, height: 64, layers: 1, usage: 8 });
    const enc = dev.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: tex, load: 1, store: true }],
    });
    pass.end();
    dev.destroy();
    dev.destroy();
    expect(calls.filter((c) => c === 'deleteFramebuffer')).toHaveLength(1);
  });
});
