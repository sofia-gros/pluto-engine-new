import { describe, expect, it } from 'vitest';
import { ErrorCode, PlutoError } from '../../../src/core/debug';
import {
  getAllShaderNames,
  getBuiltinInclude,
  getShader,
  preprocessWithBuiltins,
  registerShader,
} from '../../../src/shaders/shader-library';

describe('shader-library (T-4.1)', () => {
  it('組み込みインクルード (constants, camera) を取得できる', () => {
    const constWgsl = getBuiltinInclude('common/constants');
    const constGlsl = getBuiltinInclude('common/constants.glsl');
    const camWgsl = getBuiltinInclude('common/camera');
    const camGlsl = getBuiltinInclude('common/camera.glsl');

    expect(constWgsl).toBeDefined();
    expect(constGlsl).toBeDefined();
    expect(camWgsl).toBeDefined();
    expect(camGlsl).toBeDefined();
  });

  it('constants.wgsl と constants.glsl の定数値が docs/07 §2 の仕様と一致する', () => {
    const constWgsl = getBuiltinInclude('common/constants.wgsl') ?? '';
    const constGlsl = getBuiltinInclude('common/constants.glsl') ?? '';

    // 期待定数と値のペア
    const expectedConstants: Record<string, number> = {
      WORKGROUP_SIZE: 256,
      SPRITE_STRIDE_BYTES: 32,
      SPRITE_STRIDE_WORDS: 8,
      DEFAULT_MAX_SPRITES: 1048576,
      MAX_LAYERS: 1024,
      ATLAS_PAGE_SIZE: 2048,
      MAX_ATLAS_PAGES: 64,
      MAX_FRAMES: 65536,
      FRAME_STRIDE_BYTES: 32,
      DATA_TEXTURE_WIDTH: 2048,
      GPU_GROUP_ALIGN: 1024,
      MAX_CAMERAS: 8,
      BIN_COUNT: 3,
      FRAME_PAGE_COMPRESSED_BIT: 0x10000,
      WHITE_FRAME_ID: 0,
      TILEMAP_CHUNK_SIZE: 32,
      GRAPHICS_MAX_VERTICES: 262144,
      TEXT_DEFAULT_MAX_GLYPHS: 256,
      MAX_LIGHTS: 4096,
    };

    for (const [name, val] of Object.entries(expectedConstants)) {
      const valStr = String(val);
      const hexStr = val.toString(16);
      // WGSL 形式: const NAME: u32 = VALu; または 16進数
      const wgslPattern = new RegExp(
        `const\\s+${name}:\\s*u32\\s*=\\s*(?:${valStr}u|0x${hexStr}u);`,
      );
      expect(constWgsl).toMatch(wgslPattern);

      // GLSL 形式: const uint NAME = VALu; または 16進数
      const glslPattern = new RegExp(
        `const\\s+uint\\s+${name}\\s*=\\s*(?:${valStr}u|0x${hexStr}u);`,
      );
      expect(constGlsl).toMatch(glslPattern);
    }
  });

  it('camera 構造体定義が docs/07 §6 の 64 バイト uniform 仕様と一致する', () => {
    const camWgsl = getBuiltinInclude('common/camera.wgsl') ?? '';
    const camGlsl = getBuiltinInclude('common/camera.glsl') ?? '';

    expect(camWgsl).toContain('struct CameraUniform');
    expect(camWgsl).toContain('viewProjAffine: vec4<f32>');
    expect(camWgsl).toContain('viewProjTranslation: vec4<f32>');
    expect(camWgsl).toContain('cullRect: vec4<f32>');
    expect(camWgsl).toContain('screenResolution: vec4<f32>');

    expect(camGlsl).toContain('struct CameraUniform');
    expect(camGlsl).toContain('vec4 viewProjAffine;');
    expect(camGlsl).toContain('vec4 viewProjTranslation;');
    expect(camGlsl).toContain('vec4 cullRect;');
    expect(camGlsl).toContain('vec4 screenResolution;');
  });

  it('preprocessWithBuiltins で組み込み include が自動展開される', () => {
    const source = `
#include "common/constants"
#include "common/camera"
fn test() {}
`.trim();

    const result = preprocessWithBuiltins(source);
    expect(result).toContain('WORKGROUP_SIZE');
    expect(result).toContain('struct CameraUniform');
    expect(result).toContain('fn test() {}');
  });

  it('未知のシェーダ名を要求した場合は PlutoError(InvalidArgument) を投げる', () => {
    expect(() => getShader('non_existent_shader')).toThrow(PlutoError);
    try {
      getShader('non_existent_shader');
    } catch (e) {
      expect(e).toBeInstanceOf(PlutoError);
      expect((e as PlutoError).code).toBe(ErrorCode.InvalidArgument);
    }
  });

  it('registerShader で登録したシェーダを getShader で取得できる', () => {
    const custom = {
      name: 'custom_test_shader',
      wgsl: 'fn main() {}',
      glslVertex: 'void main() {}',
      glslFragment: 'void main() {}',
    };
    registerShader(custom);

    const retrieved = getShader('custom_test_shader');
    expect(retrieved).toEqual(custom);
    expect(getAllShaderNames()).toContain('custom_test_shader');
  });
});
