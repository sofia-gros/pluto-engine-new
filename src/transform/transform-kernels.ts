// @pluto-hot
/**
 * @file ローカル `Transform` からワールド行列 `WorldTransform` を計算するカーネル (`docs/02` §11)。
 * 深さ 0 (親なし) だけを並列に扱い、深い階層は `transform-system.ts` がメインスレッドで合成する。
 * カーネルには自チャンクのビューしか渡らない (`docs/05` §2) ので、親は別のアーキタイプにあり引けないためである。
 */
import type { ChunkView } from '../core/ecs';
import { defineKernel } from '../jobs';
import { Transform, WorldTransform } from './transform-components';

/**
 * 深さ 0 (親なし) のワールド行列をローカル行列のまま計算する。
 * 回転とスケールを行列に焼き込み、`WorldTransform` の 6 フィールドをすべて書く。
 * @hot チャンクの行数に比例してループする
 * @param view 対象チャンク
 */
function computeRootWorldTransforms(view: ChunkView): void {
  // ループ前に TypedArray と長さをローカルへキャッシュする (R2 §5)
  const x = view.column(Transform.x);
  const y = view.column(Transform.y);
  const rotation = view.column(Transform.rotation);
  const scaleX = view.column(Transform.scaleX);
  const scaleY = view.column(Transform.scaleY);
  const a = view.column(WorldTransform.a);
  const b = view.column(WorldTransform.b);
  const c = view.column(WorldTransform.c);
  const d = view.column(WorldTransform.d);
  const tx = view.column(WorldTransform.tx);
  const ty = view.column(WorldTransform.ty);
  const start = view.start;
  const end = view.end;
  for (let i = start; i < end; i++) {
    const cos = Math.cos(rotation[i]);
    const sin = Math.sin(rotation[i]);
    const sx = scaleX[i];
    const sy = scaleY[i];
    a[i] = cos * sx;
    b[i] = sin * sx;
    c[i] = -sin * sy;
    d[i] = cos * sy;
    tx[i] = x[i];
    ty[i] = y[i];
  }
  view.markDirty(WorldTransform.a);
  view.markDirty(WorldTransform.b);
  view.markDirty(WorldTransform.c);
  view.markDirty(WorldTransform.d);
  view.markDirty(WorldTransform.tx);
  view.markDirty(WorldTransform.ty);
}

/** 深さ 0 (親なし) のエンティティのワールド行列を計算するカーネル。 */
export const RootWorldTransformKernel = defineKernel(
  'Transform.RootWorldTransform',
  computeRootWorldTransforms,
);
