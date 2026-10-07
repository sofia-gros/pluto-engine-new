import { describe, expect, it } from 'vitest';
import {
  HierarchyDepth,
  MAX_HIERARCHY_DEPTH,
  Parent,
  Transform,
  WorldTransform,
} from '../../../src/transform/transform-components';
import { ScalarType } from '../../../src/core/memory/scalar-type';

describe('transform コンポーネント', () => {
  it('Transform はローカル変換の 5 フィールドを持つ', () => {
    expect(Transform.name).toBe('Transform');
    expect(Transform.fields.map((f) => f.name)).toEqual(['x', 'y', 'rotation', 'scaleX', 'scaleY']);
    for (const f of Transform.fields) expect(f.type).toBe(ScalarType.F32);
  });

  it('WorldTransform は 2x3 アフィンの 6 フィールドを持つ (docs/07 §11 の入力カラム)', () => {
    expect(WorldTransform.name).toBe('WorldTransform');
    expect(WorldTransform.fields.map((f) => f.name)).toEqual(['a', 'b', 'c', 'd', 'tx', 'ty']);
    for (const f of WorldTransform.fields) expect(f.type).toBe(ScalarType.F32);
  });

  it('Parent は Entity ハンドル (U32)、HierarchyDepth は深さ (U32)', () => {
    expect(Parent.fields.map((f) => f.name)).toEqual(['parent']);
    expect(Parent.parent.type).toBe(ScalarType.U32);
    expect(HierarchyDepth.fields.map((f) => f.name)).toEqual(['depth']);
    expect(HierarchyDepth.depth.type).toBe(ScalarType.U32);
  });

  it('フィールド ID はコンポーネント間で重複しない', () => {
    const ids = [
      ...Transform.fields,
      ...WorldTransform.fields,
      ...Parent.fields,
      ...HierarchyDepth.fields,
    ].map((f) => f.fieldId);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('MAX_HIERARCHY_DEPTH は 8 (docs/09 §container)', () => {
    expect(MAX_HIERARCHY_DEPTH).toBe(8);
  });
});
