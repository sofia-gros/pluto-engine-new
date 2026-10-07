import { describe, expect, it } from 'vitest';
import { World } from '../../../../src/core/ecs';
import { WorldTransform } from '../../../../src/transform';
import { Sprite, SpriteSlot } from '../../../../src/render/sprite/sprite-components';
import {
  spritePackKernel,
  spritePackKernelFn,
} from '../../../../src/render/sprite/sprite-pack-kernel';
import {
  FLAG_VISIBLE,
  SPRITE_WORD_FLAGS,
  SPRITE_WORD_FRAME_ID,
  SPRITE_WORD_POS_X,
  SPRITE_WORD_POS_Y,
  SPRITE_WORD_ROT_LAYER,
  SPRITE_WORD_SCALE,
  SPRITE_WORD_SORT_KEY,
  SPRITE_WORD_TINT,
} from '../../../../src/render/sprite/sprite-instance-layout';
import { SPRITE_STRIDE_WORDS } from '../../../../src/render/render-constants';
import { f16ToF32 } from '../../../../src/core/math';

describe('sprite-pack-kernel', () => {
  it('defineKernel で名前 sprite-pack として定義されている', () => {
    expect(spritePackKernel.name).toBe('sprite-pack');
    expect(spritePackKernel.id).toBeDefined();
  });

  it('WorldTransform, Sprite, SpriteSlot を読み込んでステージングにパックする', () => {
    const world = new World();
    const entity = world.spawn(WorldTransform, Sprite, SpriteSlot);

    // 回転 0、スケール 2x3、位置 (100, 200) のアフィン行列
    // a = cos(0)*scaleX = 2, b = sin(0)*scaleX = 0
    // c = -sin(0)*scaleY = 0, d = cos(0)*scaleY = 3
    world.set(entity, WorldTransform.a, 2.0);
    world.set(entity, WorldTransform.b, 0.0);
    world.set(entity, WorldTransform.c, 0.0);
    world.set(entity, WorldTransform.d, 3.0);
    world.set(entity, WorldTransform.tx, 100.0);
    world.set(entity, WorldTransform.ty, 200.0);

    world.set(entity, Sprite.frame, 10);
    world.set(entity, Sprite.tint, 0xffffffff);
    world.set(entity, Sprite.layer, 5);
    world.set(entity, Sprite.flags, FLAG_VISIBLE);
    world.set(entity, Sprite.sortKey, 0.5);

    world.set(entity, SpriteSlot.slot, 42);

    // 共有バッファの準備
    const stagingBuffer = new ArrayBuffer(128 * SPRITE_STRIDE_WORDS * 4);
    const u32Staging = new Uint32Array(stagingBuffer);
    const f32Staging = new Float32Array(stagingBuffer);
    const dirtyInt32 = new Int32Array(4); // 128 スロット = 2 ブロック

    const buffers = {
      u32: [u32Staging],
      f32: [f32Staging],
      i32: [dirtyInt32],
    };

    const query = world.query({ all: [WorldTransform, Sprite, SpriteSlot] });
    expect(query.chunkCount()).toBe(1);

    query.forEachChunk((chunk) => {
      spritePackKernelFn(chunk, new Float32Array(0), buffers);
    });

    // slot 42 のパック結果を検証
    const base = 42 * SPRITE_STRIDE_WORDS;
    expect(f32Staging[base + SPRITE_WORD_POS_X]).toBe(100.0);
    expect(f32Staging[base + SPRITE_WORD_POS_Y]).toBe(200.0);

    const scaleWord = u32Staging[base + SPRITE_WORD_SCALE];
    expect(f16ToF32(scaleWord & 0xffff)).toBeCloseTo(2.0, 2);
    expect(f16ToF32(scaleWord >>> 16)).toBeCloseTo(3.0, 2);

    const rotLayerWord = u32Staging[base + SPRITE_WORD_ROT_LAYER];
    expect(f16ToF32(rotLayerWord & 0xffff)).toBeCloseTo(0.0, 2);
    expect(rotLayerWord >>> 16).toBe(5);

    expect(u32Staging[base + SPRITE_WORD_FRAME_ID]).toBe(10);
    expect(u32Staging[base + SPRITE_WORD_TINT]).toBe(0xffffffff);
    expect(u32Staging[base + SPRITE_WORD_FLAGS]).toBe(FLAG_VISIBLE);
    expect(f32Staging[base + SPRITE_WORD_SORT_KEY]).toBe(0.5);

    // dirtyBits の検証: slot 42 -> block 0 (42 >> 6 = 0) -> bit 0 (word 0, bit 0)
    expect((dirtyInt32[0] & 1) !== 0).toBe(true);
  });
});
