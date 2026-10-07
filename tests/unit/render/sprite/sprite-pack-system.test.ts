import { describe, expect, it } from 'vitest';
import { SpritePackSystem } from '../../../../src/render/sprite/sprite-pack-system';
import { Phase } from '../../../../src/core/ecs';
import { spritePackKernel } from '../../../../src/render/sprite/sprite-pack-kernel';

describe('sprite-pack-system', () => {
  it('SpritePackSystem が正しいメタデータで定義されている', () => {
    expect(SpritePackSystem.name).toBe('Sprite.Pack');
    expect(SpritePackSystem.phase).toBe(Phase.PostUpdate);
    expect(SpritePackSystem.order).toBe(10);
    expect(SpritePackSystem.kernel).toBe(spritePackKernel);
    expect(SpritePackSystem.query).toBeDefined();
  });
});
