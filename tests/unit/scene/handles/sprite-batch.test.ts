import { beforeEach, describe, expect, it } from 'vitest';
import { World } from '../../../../src/core/ecs';
import { PlutoError } from '../../../../src/core/debug';
import { FrameTable, SpriteBuffer } from '../../../../src/render';
import { SpriteBatch, type SpriteBatchConfig } from '../../../../src/scene/handles/sprite-batch';

describe('SpriteBatch', () => {
  let world: World;
  let frameTable: FrameTable;
  let spriteBuffer: SpriteBuffer;

  beforeEach(() => {
    world = new World();
    frameTable = new FrameTable();
    spriteBuffer = new SpriteBuffer(10000);
  });

  it('SpriteBatch を生成し、位置やティント、カラム操作ができる', () => {
    const config: SpriteBatchConfig = {
      count: 100,
      frame: 0,
      x: (i) => i * 10,
      y: (i) => i * 20,
      layer: 1,
      blend: 'alpha',
    };

    const batch = new SpriteBatch(world, frameTable, spriteBuffer, config);
    expect(batch.count).toBe(100);
    expect(batch.isDestroyed).toBe(false);

    const colX = batch.column('x');
    expect(colX.length).toBeGreaterThanOrEqual(100);
    expect(colX[0]).toBe(0);
    expect(colX[1]).toBe(10);

    const xs = new Float32Array(100);
    const ys = new Float32Array(100);
    for (let i = 0; i < 100; i++) {
      xs[i] = i * 5;
      ys[i] = i * 5;
    }
    batch.setPositions(xs, ys);
    const updatedX = batch.column('x');
    expect(updatedX[1]).toBe(5);

    batch.markDirty();
    batch.destroy();
    expect(batch.isDestroyed).toBe(true);
    expect(() => batch.count).toThrow(PlutoError);
  });
});
