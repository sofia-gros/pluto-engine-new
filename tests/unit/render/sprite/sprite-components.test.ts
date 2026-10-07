import { describe, expect, it } from 'vitest';
import { Sprite, SpriteSlot } from '../../../../src/render/sprite/sprite-components';

describe('sprite-components', () => {
  it('Sprite コンポーネントが定義されている', () => {
    expect(Sprite.frame).toBeDefined();
    expect(Sprite.tint).toBeDefined();
    expect(Sprite.layer).toBeDefined();
    expect(Sprite.flags).toBeDefined();
    expect(Sprite.sortKey).toBeDefined();
  });

  it('SpriteSlot コンポーネントが定義されている', () => {
    expect(SpriteSlot.slot).toBeDefined();
  });
});
