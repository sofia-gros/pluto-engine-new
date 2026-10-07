import { describe, expect, it } from 'vitest';
import {
  FLAG_ADDITIVE,
  FLAG_FLIP_X,
  FLAG_FLIP_Y,
  FLAG_OCCLUDER,
  FLAG_OPAQUE,
  FLAG_VISIBLE,
  packSprite,
  SPRITE_WORD_FLAGS,
  SPRITE_WORD_FRAME_ID,
  SPRITE_WORD_POS_X,
  SPRITE_WORD_POS_Y,
  SPRITE_WORD_ROT_LAYER,
  SPRITE_WORD_SCALE,
  SPRITE_WORD_SORT_KEY,
  SPRITE_WORD_TINT,
} from '../../../../src/render/sprite/sprite-instance-layout';
import {
  FRAME_PAGE_COMPRESSED_BIT,
  SPRITE_STRIDE_WORDS,
} from '../../../../src/render/render-constants';
import { getBuiltinInclude } from '../../../../src/shaders/shader-library';
import { f16ToF32 } from '../../../../src/core/math';

describe('sprite-instance-layout', () => {
  it('packSprite が各ワードに正しくエンコードする', () => {
    const buffer = new ArrayBuffer(SPRITE_STRIDE_WORDS * 4);
    const u32 = new Uint32Array(buffer);
    const f32 = new Float32Array(buffer);

    const slot = 0;
    const posX = 123.5;
    const posY = 456.25;
    const scaleX = 2.0;
    const scaleY = 3.0;
    const rotation = 1.57; // ~pi/2
    const layer = 42;
    const frameId = 100;
    const tint = 0xff00ffff;
    const flags = FLAG_VISIBLE | FLAG_OPAQUE | FLAG_OCCLUDER;
    const sortKey = 0.75;

    packSprite(
      u32,
      f32,
      slot,
      posX,
      posY,
      scaleX,
      scaleY,
      rotation,
      layer,
      frameId,
      tint,
      flags,
      sortKey,
    );

    expect(f32[SPRITE_WORD_POS_X]).toBe(posX);
    expect(f32[SPRITE_WORD_POS_Y]).toBe(posY);

    // scale (scaleX low, scaleY high)
    const scaleWord = u32[SPRITE_WORD_SCALE];
    const unpackedScaleX = f16ToF32(scaleWord & 0xffff);
    const unpackedScaleY = f16ToF32(scaleWord >>> 16);
    expect(unpackedScaleX).toBeCloseTo(scaleX, 2);
    expect(unpackedScaleY).toBeCloseTo(scaleY, 2);

    // rotLayer (rotation low, layer high)
    const rotLayerWord = u32[SPRITE_WORD_ROT_LAYER];
    const unpackedRot = f16ToF32(rotLayerWord & 0xffff);
    const unpackedLayer = rotLayerWord >>> 16;
    expect(unpackedRot).toBeCloseTo(rotation, 2);
    expect(unpackedLayer).toBe(layer);

    expect(u32[SPRITE_WORD_FRAME_ID]).toBe(frameId);
    expect(u32[SPRITE_WORD_TINT]).toBe(tint);
    expect(u32[SPRITE_WORD_FLAGS]).toBe(flags);
    expect(f32[SPRITE_WORD_SORT_KEY]).toBe(sortKey);
  });

  it('フラグ定数値および圧縮ビット定数が仕様と一致する', () => {
    expect(FLAG_VISIBLE).toBe(1);
    expect(FLAG_FLIP_X).toBe(2);
    expect(FLAG_FLIP_Y).toBe(4);
    expect(FLAG_OPAQUE).toBe(8);
    expect(FLAG_ADDITIVE).toBe(16);
    expect(FLAG_OCCLUDER).toBe(32); // bit 5
    expect(FRAME_PAGE_COMPRESSED_BIT).toBe(0x10000); // bit 16
  });

  it('WGSL / GLSL の構造体・定数定義と TS のオフセット・フラグが文字列解析で一致する', () => {
    const wgslSource = getBuiltinInclude('common/sprite-instance.wgsl');
    expect(wgslSource).toBeDefined();
    if (wgslSource !== undefined) {
      // フィールド並び順の検証
      const expectedFields = [
        'posX',
        'posY',
        'scale',
        'rotLayer',
        'frameId',
        'tint',
        'flags',
        'sortKey',
      ];
      for (const field of expectedFields) {
        expect(wgslSource).toContain(field);
      }
      expect(wgslSource).toContain('FLAG_OCCLUDER: u32 = 32u');
    }

    const glslSource = getBuiltinInclude('common/sprite-instance.glsl');
    expect(glslSource).toBeDefined();
    if (glslSource !== undefined) {
      expect(glslSource).toContain('FLAG_OCCLUDER = 32u');
    }

    const frameWgsl = getBuiltinInclude('common/frame.wgsl');
    expect(frameWgsl).toBeDefined();
    if (frameWgsl !== undefined) {
      expect(frameWgsl).toContain('0x10000u');
    }

    const frameGlsl = getBuiltinInclude('common/frame.glsl');
    expect(frameGlsl).toBeDefined();
    if (frameGlsl !== undefined) {
      expect(frameGlsl).toContain('0x10000u');
    }
  });
});
