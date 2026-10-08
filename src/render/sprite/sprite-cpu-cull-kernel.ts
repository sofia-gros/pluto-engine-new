// @pluto-hot
/**
 * @file CPU スプライトカリングカーネル (docs/07-renderer.md §9, docs/02-directory-structure.md §17)
 *
 * カメラ矩形と各スプライトの交差を判定し、可視スプライトのスロット番号を 3 ビン別に振り分ける。
 */

import type { ChunkView } from '../../core/ecs';
import { defineKernel, KernelBufferSlot } from '../../jobs';
import { WorldTransform } from '../../transform';
import { FLAG_ADDITIVE, FLAG_OPAQUE, FLAG_VISIBLE } from './sprite-instance-layout';
import { Sprite, SpriteSlot } from './sprite-components';

/**
 * CPU スプライトカリングカーネル関数。
 *
 * @hot
 * @param view 対象の ECS チャンクビュー
 * @param params カメラカリングパラメータ [minX, minY, maxX, maxY, binCapacity, conservativeRadius]
 * @param buffers 共有バッファ (u32: [_, CullOutput], i32: [_, CullCounters])
 */
export function spriteCpuCullKernelFn(
  view: ChunkView,
  params: Float32Array,
  buffers: {
    readonly u32: readonly Uint32Array[];
    readonly f32: readonly Float32Array[];
    readonly i32: readonly Int32Array[];
  },
): void {
  if (
    buffers.u32.length <= KernelBufferSlot.CullOutput ||
    buffers.i32.length <= KernelBufferSlot.CullCounters ||
    params.length < 5
  ) {
    return;
  }

  const cullOutput = buffers.u32[KernelBufferSlot.CullOutput];
  const cullCounters = buffers.i32[KernelBufferSlot.CullCounters];

  const minX = params[0];
  const minY = params[1];
  const maxX = params[2];
  const maxY = params[3];
  const binCapacity = params[4] | 0;
  const baseRadius = params.length > 5 ? params[5] : 128.0;

  const colTx = view.column(WorldTransform.tx);
  const colTy = view.column(WorldTransform.ty);
  const colA = view.column(WorldTransform.a);
  const colB = view.column(WorldTransform.b);
  const colC = view.column(WorldTransform.c);
  const colD = view.column(WorldTransform.d);
  const colFlags = view.column(Sprite.flags);
  const colSlot = view.column(SpriteSlot.slot);

  const start = view.start;
  const end = view.end;

  for (let i = start; i < end; i++) {
    const flags = colFlags[i];
    if ((flags & FLAG_VISIBLE) === 0) {
      continue;
    }

    const tx = colTx[i];
    const ty = colTy[i];
    const a = colA[i];
    const b = colB[i];
    const c = colC[i];
    const d = colD[i];

    const scaleX = Math.sqrt(a * a + b * b);
    const scaleY = Math.sqrt(c * c + d * d);
    const maxScale = scaleX > scaleY ? scaleX : scaleY;
    const radius = baseRadius * (maxScale > 0.001 ? maxScale : 1.0);

    // 円と AABB の交差判定 (保守的)
    if (tx + radius < minX || tx - radius > maxX || ty + radius < minY || ty - radius > maxY) {
      continue;
    }

    // ビン分類: Opaque(0) / Alpha(1) / Additive(2)
    let bin = 1;
    if ((flags & FLAG_OPAQUE) !== 0) {
      bin = 0;
    } else if ((flags & FLAG_ADDITIVE) !== 0) {
      bin = 2;
    }

    const slot = colSlot[i];
    const writeIdx = Atomics.add(cullCounters, bin, 1);
    if (writeIdx < binCapacity) {
      cullOutput[bin * binCapacity + writeIdx] = slot;
    }
  }
}

/**
 * CPU スプライトカリングカーネルのジョブ定義。
 */
export const spriteCpuCullKernel = defineKernel('sprite-cpu-cull', spriteCpuCullKernelFn);
