/**
 * @file 変換と階層のコンポーネント定義 (docs/04-memory-and-ecs.md §3.1、`docs/02` §11)。
 * `Transform` はローカル変換、`WorldTransform` は親を合成したワールド行列 (2x3 アフィン)、
 * `Parent` は親の Entity ハンドル、`HierarchyDepth` は階層の深さを持つ。
 */
import { defineComponent } from '../core/ecs';
import { ScalarType } from '../core/memory';

/** ローカル変換 (親から継承する前の値)。角度はラジアン。 */
export const Transform = defineComponent('Transform', {
  x: ScalarType.F32,
  y: ScalarType.F32,
  rotation: ScalarType.F32,
  scaleX: ScalarType.F32,
  scaleY: ScalarType.F32,
});

/**
 * ワールド変換 (親を合成した 2x3 アフィン行列)。
 * `(a, b, c, d)` が 2x2 部分の回転・スケール、`(tx, ty)` が平行移動。
 * `docs/07-renderer.md` §11 がスプライトパックの入力に使うフィールドと一致する。
 */
export const WorldTransform = defineComponent('WorldTransform', {
  a: ScalarType.F32,
  b: ScalarType.F32,
  c: ScalarType.F32,
  d: ScalarType.F32,
  tx: ScalarType.F32,
  ty: ScalarType.F32,
});

/** 親の Entity ハンドル。`NULL_ENTITY` は親なし。 */
export const Parent = defineComponent('Parent', { parent: ScalarType.U32 });

/** 階層の深さ (根 = 0)。`MAX_HIERARCHY_DEPTH` まで。 */
export const HierarchyDepth = defineComponent('HierarchyDepth', { depth: ScalarType.U32 });

/** 階層の最大深さ (`docs/09-api-design.md` §container の「最大深さ 8」)。 */
export const MAX_HIERARCHY_DEPTH = 8;
