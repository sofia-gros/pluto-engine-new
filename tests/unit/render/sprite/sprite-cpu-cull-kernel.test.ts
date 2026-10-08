/**
 * @file sprite-cpu-cull-kernel の単体テスト (docs/07-renderer.md §8, §9)
 */

import { describe, expect, it } from 'vitest';
import { World } from '../../../../src/core/ecs';
import {
  FLAG_ADDITIVE,
  FLAG_OPAQUE,
  FLAG_VISIBLE,
  Sprite,
  SpriteSlot,
  spriteCpuCullKernel,
  spriteCpuCullKernelFn,
} from '../../../../src/render';
import { WorldTransform } from '../../../../src/transform';

describe('sprite-cpu-cull-kernel', () => {
  it('defineKernel で名前 sprite-cpu-cull として定義されている', () => {
    expect(spriteCpuCullKernel.name).toBe('sprite-cpu-cull');
    expect(spriteCpuCullKernel.id).toBeDefined();
  });

  it('カメラ矩形内外の判定および 3 ビン分類 (Opaque, Alpha, Additive) が正しく動作する', () => {
    const world = new World();

    // 1. 画面内 Opaque スプライト (slot 10)
    const e1 = world.spawn(WorldTransform, Sprite, SpriteSlot);
    world.set(e1, WorldTransform.tx, 100.0);
    world.set(e1, WorldTransform.ty, 100.0);
    world.set(e1, WorldTransform.a, 1.0);
    world.set(e1, WorldTransform.d, 1.0);
    world.set(e1, Sprite.flags, FLAG_VISIBLE | FLAG_OPAQUE);
    world.set(e1, SpriteSlot.slot, 10);

    // 2. 画面内 Alpha スプライト (slot 20)
    const e2 = world.spawn(WorldTransform, Sprite, SpriteSlot);
    world.set(e2, WorldTransform.tx, 200.0);
    world.set(e2, WorldTransform.ty, 200.0);
    world.set(e2, WorldTransform.a, 1.0);
    world.set(e2, WorldTransform.d, 1.0);
    world.set(e2, Sprite.flags, FLAG_VISIBLE);
    world.set(e2, SpriteSlot.slot, 20);

    // 3. 画面内 Additive スプライト (slot 30)
    const e3 = world.spawn(WorldTransform, Sprite, SpriteSlot);
    world.set(e3, WorldTransform.tx, 300.0);
    world.set(e3, WorldTransform.ty, 300.0);
    world.set(e3, WorldTransform.a, 1.0);
    world.set(e3, WorldTransform.d, 1.0);
    world.set(e3, Sprite.flags, FLAG_VISIBLE | FLAG_ADDITIVE);
    world.set(e3, SpriteSlot.slot, 30);

    // 4. 画面外スプライト (slot 40)
    const e4 = world.spawn(WorldTransform, Sprite, SpriteSlot);
    world.set(e4, WorldTransform.tx, 2000.0);
    world.set(e4, WorldTransform.ty, 2000.0);
    world.set(e4, WorldTransform.a, 1.0);
    world.set(e4, WorldTransform.d, 1.0);
    world.set(e4, Sprite.flags, FLAG_VISIBLE);
    world.set(e4, SpriteSlot.slot, 40);

    // 5. 非表示スプライト (slot 50)
    const e5 = world.spawn(WorldTransform, Sprite, SpriteSlot);
    world.set(e5, WorldTransform.tx, 150.0);
    world.set(e5, WorldTransform.ty, 150.0);
    world.set(e5, WorldTransform.a, 1.0);
    world.set(e5, WorldTransform.d, 1.0);
    world.set(e5, Sprite.flags, 0); // FLAG_VISIBLE なし
    world.set(e5, SpriteSlot.slot, 50);

    const binCapacity = 64;
    const cullOutput = new Uint32Array(binCapacity * 3);
    const cullCounters = new Int32Array(3);

    const buffers = {
      u32: [new Uint32Array(0), cullOutput],
      f32: [new Float32Array(0), new Float32Array(0)],
      i32: [new Int32Array(0), cullCounters],
    };

    // カメラ矩形: [0, 0, 800, 600], binCapacity = 64, baseRadius = 32
    const params = new Float32Array([0.0, 0.0, 800.0, 600.0, binCapacity, 32.0]);

    const query = world.query({ all: [WorldTransform, Sprite, SpriteSlot] });
    expect(query.chunkCount()).toBe(1);

    query.forEachChunk((chunk) => {
      spriteCpuCullKernelFn(chunk, params, buffers);
    });

    // カウンタ検証: Opaque=1, Alpha=1, Additive=1
    expect(cullCounters[0]).toBe(1);
    expect(cullCounters[1]).toBe(1);
    expect(cullCounters[2]).toBe(1);

    // スロット検証
    expect(cullOutput[0 * binCapacity + 0]).toBe(10); // Opaque
    expect(cullOutput[1 * binCapacity + 0]).toBe(20); // Alpha
    expect(cullOutput[2 * binCapacity + 0]).toBe(30); // Additive
  });
});
