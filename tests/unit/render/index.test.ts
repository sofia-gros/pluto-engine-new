import { describe, expect, it } from 'vitest';
import * as render from '../../../src/render';

describe('render index', () => {
  it('公開シンボルが正しくエクスポートされている', () => {
    expect(render.WORKGROUP_SIZE).toBeDefined();
    expect(render.AtlasPacker).toBeDefined();
    expect(render.FrameTable).toBeDefined();
    expect(render.TextureArrayManager).toBeDefined();
    expect(render.Sprite).toBeDefined();
    expect(render.SpriteSlot).toBeDefined();
    expect(render.SpriteBuffer).toBeDefined();
    expect(render.spritePackKernel).toBeDefined();
    expect(render.SpritePackSystem).toBeDefined();
    expect(render.packSprite).toBeDefined();
  });
});
