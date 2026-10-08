import { beforeEach, describe, expect, it } from 'vitest';
import { World } from '../../../../src/core/ecs';
import { PlutoError } from '../../../../src/core/debug';
import { FrameTable, Sprite, SpriteBuffer, SpriteSlot } from '../../../../src/render';
import { Transform, WorldTransform } from '../../../../src/transform';
import { SpriteHandle } from '../../../../src/scene/handles/sprite-handle';

describe('SpriteHandle', () => {
  let world: World;
  let frameTable: FrameTable;
  let handle: SpriteHandle;

  beforeEach(() => {
    world = new World();
    frameTable = new FrameTable();
    const entity = world.spawn(Transform, WorldTransform, Sprite, SpriteSlot);
    world.set(entity, SpriteSlot.slot, 0);
    world.set(entity, Sprite.flags, 1); // visible
    world.set(entity, Transform.scaleX, 1);
    world.set(entity, Transform.scaleY, 1);
    handle = new SpriteHandle(world, entity, frameTable);
  });

  it('位置、スケール、回転、深度の getter / setter / chain が動作する', () => {
    handle
      .setPosition(100, 200)
      .setScale(2, 3)
      .setRotation(Math.PI / 2)
      .setDepth(0.5);

    expect(handle.x).toBe(100);
    expect(handle.y).toBe(200);
    expect(handle.scaleX).toBe(2);
    expect(handle.scaleY).toBe(3);
    expect(handle.rotation).toBeCloseTo(Math.PI / 2);
    expect(handle.angle).toBeCloseTo(90);
    expect(handle.depth).toBe(0.5);

    handle.x = 300;
    handle.y = 400;
    handle.angle = 180;
    expect(handle.x).toBe(300);
    expect(handle.y).toBe(400);
    expect(handle.angle).toBeCloseTo(180);
    expect(handle.rotation).toBeCloseTo(Math.PI);
  });

  it('可視性、アルファ、ティント、ブレンドモードの設定が動作する', () => {
    handle.setVisible(false);
    expect(handle.visible).toBe(false);

    handle.setVisible(true);
    expect(handle.visible).toBe(true);

    handle.setAlpha(0.5);
    expect(handle.alpha).toBeCloseTo(0.5);

    handle.setTint(0xff00ff);
    expect(handle.tint).toBe(0xff00ff);

    handle.setBlend('additive');
    expect(handle.blend).toBe('additive');

    handle.setBlend('opaque');
    expect(handle.blend).toBe('opaque');

    handle.setBlend('alpha');
    expect(handle.blend).toBe('alpha');
  });

  it('フリップとアンカー (origin) の設定が動作する', () => {
    handle.setFlip(true, false);
    expect(handle.flipX).toBe(true);
    expect(handle.flipY).toBe(false);

    handle.setOrigin(0, 0);
    expect(handle.originX).toBe(0);
    expect(handle.originY).toBe(0);
  });

  it('destroy 呼出後に無効化され、再アクセス時に InvalidState エラーを投げる', () => {
    expect(handle.isDestroyed).toBe(false);
    handle.destroy();
    expect(handle.isDestroyed).toBe(true);

    expect(() => handle.x).toThrow(PlutoError);
    expect(() => handle.setPosition(10, 20)).toThrow(PlutoError);
  });

  it('depth と layer の範囲外指定は InvalidArgument になる', () => {
    expect(() => handle.setDepth(1)).toThrow(PlutoError);
    expect(() => handle.setDepth(-0.1)).toThrow(PlutoError);
    expect(() => handle.setLayer(1024)).toThrow(PlutoError);
    expect(() => handle.setLayer(-1)).toThrow(PlutoError);
    expect(() => handle.setLayer(1.5)).toThrow(PlutoError);
    handle.setDepth(0.999);
    expect(handle.depth).toBeCloseTo(0.999);
    handle.setLayer(1023);
    expect(handle.layer).toBe(1023);
  });

  it('範囲外の origin 指定は InvalidArgument になる', () => {
    expect(() => handle.setOrigin(2)).toThrow(PlutoError);
    expect(() => handle.setOrigin(0.5, -0.1)).toThrow(PlutoError);
  });

  it('destroy 時にスプライトスロットを解放する', () => {
    const bufferWorld = new World();
    const bufferTable = new FrameTable();
    const buffer = new SpriteBuffer(10);
    const slot = buffer.allocateSlot();
    const entity = bufferWorld.spawn(Transform, WorldTransform, Sprite, SpriteSlot);
    bufferWorld.set(entity, SpriteSlot.slot, slot);
    bufferWorld.set(entity, Sprite.flags, 1);
    bufferWorld.set(entity, Transform.scaleX, 1);
    bufferWorld.set(entity, Transform.scaleY, 1);
    const withBuffer = new SpriteHandle(bufferWorld, entity, bufferTable, buffer);
    withBuffer.destroy();
    expect(buffer.allocateSlot()).toBe(slot);
  });

  it('バッファなしハンドルの destroy は例外を投げない', () => {
    expect(() => {
      handle.destroy();
    }).not.toThrow();
  });

  it('破棄後の on/off/once は InvalidState になる', () => {
    const listener = (): void => {
      return;
    };
    handle.destroy();
    expect(() => handle.on('x', listener)).toThrow(PlutoError);
    expect(() => handle.off('x', listener)).toThrow(PlutoError);
    expect(() => handle.once('x', listener)).toThrow(PlutoError);
  });
});
