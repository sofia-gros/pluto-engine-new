import { describe, expect, it } from 'vitest';
import { BindingType, ShaderStage } from '../../../../src/rhi/types';
import { buildLayoutEntries } from '../../../../src/rhi/webgpu/webgpu-bind-group';

describe('webgpu レイアウトエントリ', () => {
  it('空のレイアウトは空の並びになる', () => {
    expect(buildLayoutEntries([])).toEqual([]);
  });

  it('バインディング番号は添字順になる', () => {
    const out = buildLayoutEntries([
      { stage: ShaderStage.Vertex, type: BindingType.UniformBuffer },
      { stage: ShaderStage.Fragment, type: BindingType.Texture },
    ]);
    expect(out).toHaveLength(2);
    expect(out[0].binding).toBe(0);
    expect(out[1].binding).toBe(1);
  });

  it('ステージはそのまま可視性になる', () => {
    const out = buildLayoutEntries([
      { stage: ShaderStage.Vertex, type: BindingType.UniformBuffer },
      { stage: ShaderStage.Compute, type: BindingType.StorageBufferRead },
    ]);
    expect(out[0].visibility).toBe(1);
    expect(out[1].visibility).toBe(4);
  });

  it('バッファとテクスチャとサンプラで項目が分かれる', () => {
    const out = buildLayoutEntries([
      { stage: ShaderStage.Vertex, type: BindingType.UniformBuffer },
      { stage: ShaderStage.Fragment, type: BindingType.Texture },
      { stage: ShaderStage.Fragment, type: BindingType.Sampler },
    ]);
    expect(out[0].buffer).toEqual({ type: 'uniform' });
    expect(out[1].texture).toBeDefined();
    expect(out[2].sampler).toEqual({ type: 'filtering' });
  });

  it('ストレージ書き込みは storage になる', () => {
    const out = buildLayoutEntries([
      { stage: ShaderStage.Compute, type: BindingType.StorageBufferReadWrite },
    ]);
    expect(out[0].buffer).toEqual({ type: 'storage' });
  });
});
