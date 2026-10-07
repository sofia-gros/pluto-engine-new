import { describe, expect, it } from 'vitest';
import { ErrorCode, PlutoError } from '../../../../src/core/debug';
import { BindingType, ShaderStage } from '../../../../src/rhi/types';
import { WebGlBuffer } from '../../../../src/rhi/webgl2/webgl2-buffer';
import { WebGlBindGroup, WebGlBindGroupLayout } from '../../../../src/rhi/webgl2/webgl2-bind-group';
import { WebGlRenderPipeline } from '../../../../src/rhi/webgl2/webgl2-pipeline';
import { WebGlSampler, WebGlTexture } from '../../../../src/rhi/webgl2/webgl2-texture';
import { WebGlStateCache } from '../../../../src/rhi/webgl2/webgl2-state-cache';
import { WebGlCommandEncoder } from '../../../../src/rhi/webgl2/webgl2-encoder';

/** 記録された GL 呼び出し。 */
const calls: string[] = [];

/**
 * `WebGL2RenderingContext` の偽物。使う呼び出しだけ持つ。
 * @returns 偽物のコンテキスト
 */
function fakeGl(): WebGL2RenderingContext {
  const stub: Pick<
    WebGL2RenderingContext,
    | 'viewport'
    | 'scissor'
    | 'enable'
    | 'clearColor'
    | 'clear'
    | 'useProgram'
    | 'uniform1i'
    | 'drawArraysInstanced'
    | 'bindFramebuffer'
    | 'bindTexture'
    | 'activeTexture'
    | 'bindSampler'
    | 'bindBuffer'
    | 'bindBufferRange'
    | 'blendFuncSeparate'
    | 'blendEquation'
    | 'disable'
    | 'flush'
    | 'colorMask'
    | 'createBuffer'
    | 'bufferData'
    | 'cullFace'
    | 'depthFunc'
    | 'depthMask'
  > = {
    viewport: (): undefined => undefined,
    scissor: (): undefined => undefined,
    enable: (): undefined => undefined,
    clearColor: (): undefined => undefined,
    clear: (): undefined => {
      calls.push('clear');
      return undefined;
    },
    useProgram: (): undefined => {
      calls.push('useProgram');
      return undefined;
    },
    uniform1i: (...args: unknown[]): undefined => {
      calls.push(`uniform1i:${String(args[1])}`);
      return undefined;
    },
    drawArraysInstanced: (...args: unknown[]): undefined => {
      calls.push(`draw:${String(args[2])}x${String(args[3])}`);
      return undefined;
    },
    bindFramebuffer: (): undefined => undefined,
    bindTexture: (): undefined => undefined,
    activeTexture: (): undefined => undefined,
    bindSampler: (): undefined => undefined,
    bindBuffer: (): undefined => undefined,
    bindBufferRange: (): undefined => undefined,
    blendFuncSeparate: (): undefined => undefined,
    blendEquation: (): undefined => undefined,
    disable: (): undefined => undefined,
    flush: (): undefined => {
      calls.push('flush');
      return undefined;
    },
    colorMask: (): undefined => undefined,
    createBuffer: (): WebGLBuffer => ({}),
    bufferData: (): undefined => undefined,
    cullFace: (): undefined => undefined,
    depthFunc: (): undefined => undefined,
    depthMask: (): undefined => undefined,
  };
  return stub as WebGL2RenderingContext;
}

/** 色テクスチャの偽物。 */
function colorTexture(gl: WebGL2RenderingContext): WebGlTexture {
  return new WebGlTexture(
    gl,
    {},
    {
      label: 'c',
      format: 0,
      width: 64,
      height: 64,
      dimension: 0,
      layers: 1,
      usage: 8,
    },
  );
}

/** 描画先の解決。常に既定のフレームバッファ。 */
function resolveNull(): null {
  return null;
}

/**
 * テクスチャとサンプラの組のパイプライン偽物を作る。
 * @param gl GL コンテキスト
 * @returns パイプライン
 */
function fakePipeline(gl: WebGL2RenderingContext): WebGlRenderPipeline {
  return new WebGlRenderPipeline(
    gl,
    {},
    {
      label: 'p',
      samplerLocations: [{}],
      samplerTypes: [0x8b5e],
      slots: [
        [
          { kind: 'texture', binding: 0 },
          { kind: 'sampler', binding: 0 },
        ],
      ],
      state: {
        blendEnabled: false,
        blendSrcRGB: 1,
        blendDstRGB: 0,
        blendSrcAlpha: 1,
        blendDstAlpha: 0,
        cullEnabled: false,
        cullFace: 0x0405,
        depthEnabled: false,
        depthFunc: 0,
        depthWrite: false,
        writeMask: [true, true, true, true],
      },
    },
  );
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

describe('webgl2 エンコーダ: レンダーパス', () => {
  it('開いて描いて閉じる', () => {
    calls.length = 0;
    const gl = fakeGl();
    const cache = new WebGlStateCache(gl);
    const enc = new WebGlCommandEncoder(gl, cache, resolveNull);
    const pass = enc.beginRenderPass({
      colorAttachments: [
        { view: colorTexture(gl), load: 0, store: true, clearColor: [0, 0, 0, 1] },
      ],
    });
    pass.setPipeline(fakePipeline(gl));
    const layout = new WebGlBindGroupLayout({
      entries: [
        { stage: ShaderStage.Fragment, type: BindingType.Texture },
        { stage: ShaderStage.Fragment, type: BindingType.Sampler },
      ],
    });
    const tex = colorTexture(gl);
    const group = new WebGlBindGroup(layout, [
      { type: BindingType.Texture, texture: tex },
      { type: BindingType.Sampler, sampler: new WebGlSampler(gl, {}) },
    ]);
    pass.setBindGroup(0, group);
    pass.draw(6, 4);
    pass.end();
    expect(calls).toContain('clear');
    expect(calls).toContain('useProgram');
    expect(calls).toContain('uniform1i:0');
    expect(calls).toContain('draw:6x4');
  });

  it('パイプライン無しでは描けない', () => {
    const gl = fakeGl();
    const cache = new WebGlStateCache(gl);
    const enc = new WebGlCommandEncoder(gl, cache, resolveNull);
    const pass = enc.beginRenderPass({
      colorAttachments: [
        { view: colorTexture(gl), load: 0, store: true, clearColor: [0, 0, 0, 1] },
      ],
    });
    expectThrows(() => {
      pass.draw(6, 1);
    }, ErrorCode.InvalidState);
  });

  it('先頭が 0 でないと InvalidArgument になる', () => {
    const gl = fakeGl();
    const cache = new WebGlStateCache(gl);
    const enc = new WebGlCommandEncoder(gl, cache, resolveNull);
    const pass = enc.beginRenderPass({
      colorAttachments: [
        { view: colorTexture(gl), load: 0, store: true, clearColor: [0, 0, 0, 1] },
      ],
    });
    pass.setPipeline(fakePipeline(gl));
    expectThrows(() => {
      pass.draw(6, 1, 1);
    }, ErrorCode.InvalidArgument);
    expectThrows(() => {
      pass.draw(6, 1, 0, 2);
    }, ErrorCode.InvalidArgument);
  });

  it('間接描画は InvalidState になる', () => {
    const gl = fakeGl();
    const cache = new WebGlStateCache(gl);
    const enc = new WebGlCommandEncoder(gl, cache, resolveNull);
    const pass = enc.beginRenderPass({
      colorAttachments: [
        { view: colorTexture(gl), load: 0, store: true, clearColor: [0, 0, 0, 1] },
      ],
    });
    const buf = new WebGlBuffer(gl, 'b', 16, 1);
    expectThrows(() => {
      pass.drawIndirect(buf, 0);
    }, ErrorCode.InvalidState);
  });

  it('二重に開くと InvalidState になる', () => {
    const gl = fakeGl();
    const cache = new WebGlStateCache(gl);
    const enc = new WebGlCommandEncoder(gl, cache, resolveNull);
    enc.beginRenderPass({
      colorAttachments: [
        { view: colorTexture(gl), load: 0, store: true, clearColor: [0, 0, 0, 1] },
      ],
    });
    expectThrows(() => {
      enc.beginRenderPass({
        colorAttachments: [
          { view: colorTexture(gl), load: 0, store: true, clearColor: [0, 0, 0, 1] },
        ],
      });
    }, ErrorCode.InvalidState);
  });

  it('compute は開けない', () => {
    const gl = fakeGl();
    const cache = new WebGlStateCache(gl);
    const enc = new WebGlCommandEncoder(gl, cache, resolveNull);
    expectThrows(() => {
      enc.beginComputePass();
    }, ErrorCode.InvalidState);
  });

  it('種別が合わないと InvalidState になる', () => {
    const gl = fakeGl();
    const cache = new WebGlStateCache(gl);
    const enc = new WebGlCommandEncoder(gl, cache, resolveNull);
    const pass = enc.beginRenderPass({
      colorAttachments: [
        { view: colorTexture(gl), load: 0, store: true, clearColor: [0, 0, 0, 1] },
      ],
    });
    const pipe = new WebGlRenderPipeline(
      gl,
      {},
      {
        label: 'p',
        samplerLocations: [{}],
        samplerTypes: [0x8dc1],
        slots: [[{ kind: 'texture', binding: 0 }]],
        state: {
          blendEnabled: false,
          blendSrcRGB: 1,
          blendDstRGB: 0,
          blendSrcAlpha: 1,
          blendDstAlpha: 0,
          cullEnabled: false,
          cullFace: 0x0405,
          depthEnabled: false,
          depthFunc: 0,
          depthWrite: false,
          writeMask: [true, true, true, true],
        },
      },
    );
    pass.setPipeline(pipe);
    const layout = new WebGlBindGroupLayout({
      entries: [{ stage: ShaderStage.Fragment, type: BindingType.Texture }],
    });
    const group = new WebGlBindGroup(layout, [
      { type: BindingType.Texture, texture: colorTexture(gl) },
    ]);
    pass.setBindGroup(0, group);
    expectThrows(() => {
      pass.draw(6, 1);
    }, ErrorCode.InvalidState);
  });
});
