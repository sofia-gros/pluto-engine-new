import { describe, expect, it } from 'vitest';
import { ErrorCode, PlutoError } from '../../../../src/core/debug';
import { requireWgsl } from '../../../../src/rhi/webgpu/webgpu-pipeline';

describe('webgpu シェーダソース', () => {
  it('WGSL があればそのまま返す', () => {
    expect(requireWgsl({ name: 'sprite', wgsl: 'code' }, '頂点')).toBe('code');
  });

  it('WGSL が無いと UnsupportedFeature になる', () => {
    let caught: unknown;
    try {
      requireWgsl({ name: 'sprite' }, '頂点');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(PlutoError);
    expect((caught as PlutoError).code).toBe(ErrorCode.UnsupportedFeature);
  });

  it('WGSL が空文字でも UnsupportedFeature になる', () => {
    let caught: unknown;
    try {
      requireWgsl({ name: 'sprite', wgsl: '' }, '頂点');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(PlutoError);
    expect((caught as PlutoError).code).toBe(ErrorCode.UnsupportedFeature);
  });
});
