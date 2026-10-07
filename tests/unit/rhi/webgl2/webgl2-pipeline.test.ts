import { describe, expect, it } from 'vitest';
import { ErrorCode, PlutoError } from '../../../../src/core/debug';
import {
  buildRenderPipeline,
  compileShader,
  linkProgram,
  reflectProgram,
  requireGlsl,
} from '../../../../src/rhi/webgl2/webgl2-pipeline';

/** 記録された GL 呼び出し。 */
const calls: string[] = [];

/** uniform ブロックの個数とサンプラの個数。 */
const reflection = { blocks: 0, samplers: 0 };

/**
 * `WebGL2RenderingContext` の偽物。プログラム系だけ持つ。
 * @param compileOk コンパイルとリンクが成功するか
 * @returns 偽物のコンテキスト
 */
function fakeGl(compileOk = true): WebGL2RenderingContext {
  let nextId = 1;
  const stub: Pick<
    WebGL2RenderingContext,
    | 'createShader'
    | 'shaderSource'
    | 'compileShader'
    | 'getShaderParameter'
    | 'getShaderInfoLog'
    | 'deleteShader'
    | 'createProgram'
    | 'attachShader'
    | 'linkProgram'
    | 'getProgramParameter'
    | 'getProgramInfoLog'
    | 'deleteProgram'
    | 'getActiveUniform'
    | 'getUniformLocation'
    | 'uniformBlockBinding'
  > = {
    createShader: (): WebGLShader => {
      calls.push('createShader');
      return { id: nextId++ };
    },
    shaderSource: (): undefined => undefined,
    compileShader: (): undefined => {
      calls.push('compileShader');
      return undefined;
    },
    getShaderParameter: (): unknown => compileOk,
    getShaderInfoLog: (): string => 'ERROR: 0:3: error',
    deleteShader: (): undefined => {
      calls.push('deleteShader');
      return undefined;
    },
    createProgram: (): WebGLProgram => {
      calls.push('createProgram');
      return { id: nextId++ };
    },
    attachShader: (): undefined => undefined,
    linkProgram: (): undefined => {
      calls.push('linkProgram');
      return undefined;
    },
    getProgramParameter: (...args: unknown[]): unknown => {
      const pname = args[1] as number;
      if (pname === 0x8a36) return reflection.blocks;
      if (pname === 0x8b4c) return reflection.samplers;
      return true;
    },
    getProgramInfoLog: (): string => 'ERROR: link error',
    deleteProgram: (): undefined => {
      calls.push('deleteProgram');
      return undefined;
    },
    getActiveUniform: (...args: unknown[]): WebGLActiveInfo | null => {
      const index = args[1] as number;
      if (index >= reflection.samplers) return null;
      return { type: 0x8b5e, size: 1, name: `u${String(index)}` };
    },
    getUniformLocation: (...args: unknown[]): WebGLUniformLocation | null => {
      calls.push(`getUniformLocation:${String(args[1])}`);
      return { id: nextId++ };
    },
    uniformBlockBinding: (...args: unknown[]): undefined => {
      calls.push(`blockBinding:${String(args[1])}->${String(args[2])}`);
      return undefined;
    },
  };
  return stub as WebGL2RenderingContext;
}

/** 頂点シェーダ。 */
const VS = { name: 'sprite', glslVertex: 'void main() {}' };

/** フラグメントシェーダ。 */
const FS = { name: 'sprite', glslFragment: 'void main() {}' };

/** 能力の偽物。 */
const CAPS = {
  backend: 'webgl2',
  compute: false,
  indirectDraw: false,
  storageBuffers: true,
  timestampQuery: false,
  floatRenderTarget: true,
  floatBlend: true,
  maxTextureSize: 8192,
  maxTextureArrayLayers: 256,
  maxStorageBufferBytes: 67108864,
  maxComputeWorkgroupSize: 0,
  maxComputeInvocationsPerWorkgroup: 0,
  minUniformBufferOffsetAlignment: 256,
  minStorageBufferOffsetAlignment: 256,
  textureCompressionBC7: true,
  textureCompressionETC2: true,
  textureCompressionASTC: false,
} as const;

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

describe('webgl2 シェーダ', () => {
  it('WGSL しか無いと UnsupportedFeature になる', () => {
    expectThrows(
      () => requireGlsl({ name: 's', wgsl: 'code' }, true),
      ErrorCode.UnsupportedFeature,
    );
    expect(requireGlsl(VS, true)).toBe('void main() {}');
  });

  it('編めるとシェーダが返る', () => {
    calls.length = 0;
    const gl = fakeGl();
    const shader = compileShader(gl, 0x8b31, VS, true);
    expect(shader).not.toBeNull();
    expect(calls).toContain('compileShader');
  });

  it('失敗時は名前付きで ShaderCompileFailed になる', () => {
    const failing = fakeGl(false);
    expectThrows(() => compileShader(failing, 0x8b31, VS, true), ErrorCode.ShaderCompileFailed);
    try {
      compileShader(failing, 0x8b31, VS, true);
    } catch (e) {
      expect((e as Error).message).toContain('sprite');
      expect((e as Error).message).toContain('0:3');
    }
  });

  it('結べるとプログラムが返る', () => {
    const gl = fakeGl();
    const program = linkProgram(
      gl,
      'sprite',
      { id: 1 },
      {
        id: 2,
      },
    );
    expect(program).not.toBeNull();
  });
});

describe('webgl2 reflection', () => {
  it('ブロックは宣言順に binding を振る', () => {
    calls.length = 0;
    reflection.blocks = 2;
    reflection.samplers = 0;
    const gl = fakeGl();
    const found = reflectProgram(gl, { id: 1 }, 2, 0);
    expect(found.locations).toEqual([]);
    expect(found.types).toEqual([]);
    expect(calls).toContain('blockBinding:0->0');
    expect(calls).toContain('blockBinding:1->1');
  });

  it('個数が合わないと InvalidArgument になる', () => {
    reflection.blocks = 1;
    reflection.samplers = 0;
    const gl = fakeGl();
    expectThrows(() => reflectProgram(gl, { id: 1 }, 2, 0), ErrorCode.InvalidArgument);
  });

  it('サンプラは宣言順に位置を覚える', () => {
    calls.length = 0;
    reflection.blocks = 0;
    reflection.samplers = 2;
    const gl = fakeGl();
    const found = reflectProgram(gl, { id: 1 }, 0, 2);
    expect(found.locations).toHaveLength(2);
    expect(found.types).toEqual([0x8b5e, 0x8b5e]);
    expect(calls).toContain('getUniformLocation:u0');
    expect(calls).toContain('getUniformLocation:u1');
  });

  it('パイプライン生成は検証から reflection まで通す', () => {
    reflection.blocks = 0;
    reflection.samplers = 0;
    const gl = fakeGl();
    const pipeline = buildRenderPipeline(
      gl,
      {
        vertexShader: VS,
        fragmentShader: FS,
        layouts: [],
        colorTargets: [{ format: 1 }],
      },
      CAPS,
    );
    expect(pipeline.label).toBe('sprite');
    expect(pipeline.samplerLocations).toEqual([]);
    expect(pipeline.blendEnabled).toBe(false);
    expect(pipeline.cullEnabled).toBe(false);
    expect(pipeline.depthEnabled).toBe(false);
    expect(pipeline.writeMask).toEqual([true, true, true, true]);
  });

  it('描画先が 2 個で合成が違うと作れない', () => {
    reflection.blocks = 0;
    reflection.samplers = 0;
    const gl = fakeGl();
    expectThrows(
      () =>
        buildRenderPipeline(
          gl,
          {
            vertexShader: VS,
            fragmentShader: FS,
            layouts: [],
            colorTargets: [
              { format: 1, blend: 1 },
              { format: 1, blend: 3 },
            ],
          },
          CAPS,
        ),
      ErrorCode.InvalidArgument,
    );
  });
});
