import { describe, expect, it } from 'vitest';
import * as rhi from '../../../src/rhi';

/** docs/06 §5・§5.1 が要求する公開定数。窓口から漏れるとバックエンドが書けなくなる。 */
const VALUE_EXPORTS = [
  'AddressMode',
  'BlendMode',
  'BindingType',
  'BufferUsage',
  'ColorWrite',
  'CompareFunc',
  'CullMode',
  'FilterMode',
  'LoadAction',
  'ShaderStage',
  'TextureDimension',
  'TextureFormat',
  'TextureUsage',
] as const;

describe('rhi 公開窓口', () => {
  it('定数 13 種を公開する', () => {
    for (const name of VALUE_EXPORTS) expect(rhi[name], name).toBeDefined();
  });

  it('バックエンド実装は公開しない (docs/02 §12)', () => {
    const leaked = Object.keys(rhi).filter((k) => /webgpu|webgl2|createDevice/i.test(k));
    expect(leaked).toEqual([]);
  });

  it('公開窓口は定数だけランタイムに載る (型 export は消える)', () => {
    expect(Object.keys(rhi).sort()).toEqual([...VALUE_EXPORTS].sort());
  });
});
