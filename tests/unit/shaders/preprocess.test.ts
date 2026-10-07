import { describe, expect, it } from 'vitest';
import { ErrorCode, PlutoError } from '../../../src/core/debug';
import { preprocessShader } from '../../../src/shaders/preprocess';

describe('preprocessShader (T-4.1)', () => {
  it('include ディレクティブのないソースはそのまま返す', () => {
    const src = 'const A: u32 = 1u;\nfn main() {}\n';
    expect(preprocessShader(src)).toBe(src);
  });

  it('#include "path" をリゾルバの内容で置換する', () => {
    const src = 'head\n#include "common/const"\ntail';
    const resolver = (path: string): string | undefined => {
      if (path === 'common/const') return '// constants\nconst X: u32 = 10u;';
      return undefined;
    };
    const result = preprocessShader(src, { resolveInclude: resolver });
    expect(result).toBe('head\n// constants\nconst X: u32 = 10u;\ntail');
  });

  it('再帰的な #include を展開する', () => {
    const src = '#include "a"';
    const files: Record<string, string> = {
      a: 'from a\n#include "b"',
      b: 'from b',
    };
    const result = preprocessShader(src, { resolveInclude: (p) => files[p] });
    expect(result).toBe('from a\nfrom b');
  });

  it('循環 include を検出して PlutoError(InvalidArgument) を投げる', () => {
    const files: Record<string, string> = {
      a: '#include "b"',
      b: '#include "a"',
    };
    expect(() => {
      preprocessShader('#include "a"', { resolveInclude: (p) => files[p] });
    }).toThrow(PlutoError);

    try {
      preprocessShader('#include "a"', { resolveInclude: (p) => files[p] });
    } catch (e) {
      expect(e).toBeInstanceOf(PlutoError);
      expect((e as PlutoError).code).toBe(ErrorCode.InvalidArgument);
      expect((e as PlutoError).message).toContain('循環インクルード');
    }
  });

  it('解決できない include パスは PlutoError(InvalidArgument) を投げる', () => {
    expect(() => {
      preprocessShader('#include "missing"', { resolveInclude: () => undefined });
    }).toThrow(PlutoError);

    try {
      preprocessShader('#include "missing"', { resolveInclude: () => undefined });
    } catch (e) {
      expect((e as PlutoError).code).toBe(ErrorCode.InvalidArgument);
      expect((e as PlutoError).message).toContain('見つかりません');
    }
  });

  it('既定で同一ファイルの二重 include を抑止する (include once)', () => {
    const files: Record<string, string> = {
      common: 'struct Common { x: f32 };',
      a: '#include "common"\n// a code',
      b: '#include "common"\n// b code',
    };
    const src = '#include "a"\n#include "b"';
    const result = preprocessShader(src, { resolveInclude: (p) => files[p] });
    // common の内容は 1 回だけ現れること
    const matches = result.match(/struct Common/g);
    expect(matches).not.toBeNull();
    expect(matches?.length).toBe(1);
    expect(result).toContain('// a code');
    expect(result).toContain('// b code');
  });

  it('#ifdef と #ifndef と #else と #endif を正しく評価する', () => {
    const src = `
#ifdef FEATURE_A
line_a
#else
line_not_a
#endif
#ifndef FEATURE_B
line_not_b
#else
line_b
#endif
`.trim();

    const result = preprocessShader(src, {
      defines: { FEATURE_A: true, FEATURE_B: false },
    });
    expect(result).toContain('line_a');
    expect(result).not.toContain('line_not_a');
    expect(result).toContain('line_not_b');
    expect(result).not.toContain('line_b');
  });

  it('ソース内の #define を認識して後続の #ifdef に反映する', () => {
    const src = `
#define MY_FLAG
#ifdef MY_FLAG
defined_code
#else
not_defined_code
#endif
`.trim();

    const result = preprocessShader(src);
    expect(result).toContain('defined_code');
    expect(result).not.toContain('not_defined_code');
  });
});
