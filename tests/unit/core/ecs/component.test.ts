import { describe, expect, it } from 'vitest';
import { defineComponent } from '../../../../src/core/ecs/component';
import { ScalarType } from '../../../../src/core/memory/scalar-type';

describe('Component', () => {
  it('defines component and assigns IDs', () => {
    const Transform = defineComponent('Transform', {
      x: ScalarType.F32,
      y: ScalarType.F32,
    });

    expect(Transform.name).toBe('Transform');
    expect(typeof Transform.id).toBe('number');
    expect(Transform.fields.length).toBe(2);

    expect(Transform.x.name).toBe('x');
    expect(Transform.x.type).toBe(ScalarType.F32);
    expect(Transform.x.componentId).toBe(Transform.id);
    expect(typeof Transform.x.fieldId).toBe('number');

    expect(Transform.y.name).toBe('y');
    expect(Transform.y.type).toBe(ScalarType.F32);
  });

  it('defines tag component without fields', () => {
    const Tag = defineComponent('Tag', {});
    expect(Tag.name).toBe('Tag');
    expect(Tag.fields.length).toBe(0);
  });

  it('throws when MAX_COMPONENTS is exceeded', () => {
    // 256個まで定義できる。すでにいくつか定義されているので、
    // エラーが出るまでループする
    let caught = false;
    try {
      for (let i = 0; i < 300; i++) {
        defineComponent(`Dummy${String(i)}`, {});
      }
    } catch {
      caught = true;
    }
    expect(caught).toBe(true);
  });
});
