import { describe, expect, it } from 'vitest';
import * as shaders from '../../../src/shaders';

const VALUE_EXPORTS = [
  'preprocessShader',
  'getBuiltinInclude',
  'getShader',
  'getAllShaderNames',
  'registerShader',
  'preprocessWithBuiltins',
] as const;

describe('shaders 公開窓口 (T-4.1)', () => {
  it('公開すべき関数をすべて公開している', () => {
    for (const name of VALUE_EXPORTS) {
      expect(shaders[name], name).toBeDefined();
    }
  });

  it('公開窓口には意図した関数だけがランタイムに載る', () => {
    expect(Object.keys(shaders).sort()).toEqual([...VALUE_EXPORTS].sort());
  });
});
