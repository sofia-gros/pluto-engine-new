import { describe, expect, it } from 'vitest';
import { WebGlStateCache } from '../../../../src/rhi/webgl2/webgl2-state-cache';

/** 記録された GL 呼び出し。 */
const calls: string[] = [];

/**
 * `WebGL2RenderingContext` の偽物。使う呼び出しだけ持つ。
 * @returns 偽物のコンテキスト
 */
function fakeGl(): WebGL2RenderingContext {
  const stub: Pick<
    WebGL2RenderingContext,
    | 'enable'
    | 'disable'
    | 'blendFuncSeparate'
    | 'blendEquation'
    | 'cullFace'
    | 'depthFunc'
    | 'depthMask'
    | 'colorMask'
    | 'clearColor'
    | 'clearDepth'
    | 'clear'
    | 'viewport'
    | 'scissor'
    | 'activeTexture'
    | 'bindTexture'
    | 'bindBuffer'
    | 'bindFramebuffer'
    | 'useProgram'
    | 'bindSampler'
    | 'pixelStorei'
  > = {
    enable: (cap: number): undefined => {
      calls.push(`enable:${String(cap)}`);
      return undefined;
    },
    disable: (cap: number): undefined => {
      calls.push(`disable:${String(cap)}`);
      return undefined;
    },
    blendFuncSeparate: (s: number, d: number): undefined => {
      calls.push(`blend:${String(s)}/${String(d)}`);
      return undefined;
    },
    blendEquation: (): undefined => {
      calls.push('equation');
      return undefined;
    },
    cullFace: (mode: number): undefined => {
      calls.push(`cull:${String(mode)}`);
      return undefined;
    },
    depthFunc: (func: number): undefined => {
      calls.push(`depthFunc:${String(func)}`);
      return undefined;
    },
    depthMask: (flag: boolean): undefined => {
      calls.push(`depthMask:${String(flag)}`);
      return undefined;
    },
    colorMask: (r: boolean, g: boolean, b: boolean, a: boolean): undefined => {
      calls.push(`colorMask:${String(r)}${String(g)}${String(b)}${String(a)}`);
      return undefined;
    },
    clearColor: (r: number, g: number, b: number, a: number): undefined => {
      calls.push(`clearColor:${String(r)},${String(g)},${String(b)},${String(a)}`);
      return undefined;
    },
    clearDepth: (d: number): undefined => {
      calls.push(`clearDepth:${String(d)}`);
      return undefined;
    },
    clear: (mask: number): undefined => {
      calls.push(`clear:${String(mask)}`);
      return undefined;
    },
    viewport: (x: number, y: number, w: number, h: number): undefined => {
      calls.push(`viewport:${String(x)},${String(y)},${String(w)},${String(h)}`);
      return undefined;
    },
    scissor: (x: number, y: number, w: number, h: number): undefined => {
      calls.push(`scissor:${String(x)},${String(y)},${String(w)},${String(h)}`);
      return undefined;
    },
    activeTexture: (unit: number): undefined => {
      calls.push(`active:${String(unit)}`);
      return undefined;
    },
    bindTexture: (): undefined => {
      calls.push('bindTexture');
      return undefined;
    },
    bindBuffer: (): undefined => {
      calls.push('bindBuffer');
      return undefined;
    },
    bindFramebuffer: (): undefined => {
      calls.push('bindFramebuffer');
      return undefined;
    },
    useProgram: (): undefined => {
      calls.push('useProgram');
      return undefined;
    },
    bindSampler: (): undefined => {
      calls.push('bindSampler');
      return undefined;
    },
    pixelStorei: (): undefined => {
      calls.push('unpack');
      return undefined;
    },
  };
  return stub as WebGL2RenderingContext;
}

describe('webgl2 状態キャッシュ', () => {
  it('同じ値は 2 回送らない', () => {
    calls.length = 0;
    const cache = new WebGlStateCache(fakeGl());
    cache.setViewport(0, 0, 256, 256);
    cache.setViewport(0, 0, 256, 256);
    expect(calls).toEqual(['viewport:0,0,256,256']);
  });

  it('変わった分だけ送る', () => {
    calls.length = 0;
    const cache = new WebGlStateCache(fakeGl());
    cache.setViewport(0, 0, 256, 256);
    cache.setViewport(0, 0, 128, 128);
    expect(calls).toEqual(['viewport:0,0,256,256', 'viewport:0,0,128,128']);
  });

  it('ブレンドは有効無効と係数を覚える', () => {
    calls.length = 0;
    const cache = new WebGlStateCache(fakeGl());
    cache.setBlend(true, 0x0302, 0x0303, 1, 0x0303);
    cache.setBlend(true, 0x0302, 0x0303, 1, 0x0303);
    expect(calls.filter((c) => c.startsWith('enable'))).toHaveLength(1);
    expect(calls.filter((c) => c.startsWith('blend:'))).toHaveLength(1);
    cache.setBlend(false, 0x0302, 0x0303, 1, 0x0303);
    expect(calls.filter((c) => c.startsWith('disable'))).toHaveLength(1);
  });

  it('深度は試験・関数・書き込みを覚える', () => {
    calls.length = 0;
    const cache = new WebGlStateCache(fakeGl());
    cache.setDepth(true, 0x0203, true);
    cache.setDepth(true, 0x0203, true);
    expect(calls).toEqual(['enable:2929', 'depthFunc:515', 'depthMask:true']);
  });

  it('テクスチャは単位ごとに覚える', () => {
    calls.length = 0;
    const cache = new WebGlStateCache(fakeGl());
    const a = { id: 1 };
    const b = { id: 2 };
    cache.bindTexture2D(0, a);
    cache.bindTexture2D(0, a);
    cache.bindTexture2D(1, b);
    expect(calls.filter((c) => c === 'bindTexture')).toHaveLength(2);
  });

  it('reset すると次は必ず送る', () => {
    calls.length = 0;
    const cache = new WebGlStateCache(fakeGl());
    cache.setViewport(0, 0, 256, 256);
    cache.reset();
    cache.setViewport(0, 0, 256, 256);
    expect(calls).toEqual(['viewport:0,0,256,256', 'viewport:0,0,256,256']);
  });

  it('サンプラは単位ごとに覚える', () => {
    calls.length = 0;
    const cache = new WebGlStateCache(fakeGl());
    const s = { id: 1 };
    cache.bindSampler(0, s);
    cache.bindSampler(0, s);
    expect(calls.filter((c) => c === 'bindSampler')).toHaveLength(1);
  });

  it('行揃えは変わったときだけ送る', () => {
    calls.length = 0;
    const cache = new WebGlStateCache(fakeGl());
    cache.setUnpackAlignment(1);
    cache.setUnpackAlignment(1);
    cache.setUnpackAlignment(4);
    expect(calls.filter((c) => c === 'unpack')).toHaveLength(2);
  });
});
