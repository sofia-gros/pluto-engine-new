// @pluto-hot
/**
 * @file スプライトパックカーネル (docs/07-renderer.md §11)
 *
 * SoA ECS の WorldTransform, Sprite, SpriteSlot カラムを読み取り、
 * 32 バイト AoS スプライトステージングバッファへパックして dirty ビットを立てる。
 */

import type { ChunkView } from '../../core/ecs';
import { defineKernel, KernelBufferSlot, type KernelDef } from '../../jobs';
import { WorldTransform } from '../../transform';
import { Sprite, SpriteSlot } from './sprite-components';
import { packSprite } from './sprite-instance-layout';

/**
 * スプライトパックカーネル本体。
 *
 * @hot
 * @param view チャンクビュー
 * @param _params 未使用パラメータ
 * @param buffers 共有バッファ表 (u32, f32, i32)
 */
export function spritePackKernelFn(
  view: ChunkView,
  _params: Float32Array,
  buffers: {
    readonly u32: readonly Uint32Array[];
    readonly f32: readonly Float32Array[];
    readonly i32: readonly Int32Array[];
  },
): void {
  if (
    buffers.u32.length <= KernelBufferSlot.SpriteStagingU32 ||
    buffers.f32.length <= KernelBufferSlot.SpriteStagingF32 ||
    buffers.i32.length <= KernelBufferSlot.SpriteDirtyBits
  ) {
    return;
  }

  const stagingU32 = buffers.u32[KernelBufferSlot.SpriteStagingU32];
  const stagingF32 = buffers.f32[KernelBufferSlot.SpriteStagingF32];
  const dirtyInt32 = buffers.i32[KernelBufferSlot.SpriteDirtyBits];

  const colA = view.column(WorldTransform.a);
  const colB = view.column(WorldTransform.b);
  const colC = view.column(WorldTransform.c);
  const colD = view.column(WorldTransform.d);
  const colTx = view.column(WorldTransform.tx);
  const colTy = view.column(WorldTransform.ty);

  const colFrame = view.column(Sprite.frame);
  const colTint = view.column(Sprite.tint);
  const colLayer = view.column(Sprite.layer);
  const colFlags = view.column(Sprite.flags);
  const colSortKey = view.column(Sprite.sortKey);

  const colSlot = view.column(SpriteSlot.slot);

  const start = view.start;
  const end = view.end;

  for (let i = start; i < end; i++) {
    const a = colA[i];
    const b = colB[i];
    const c = colC[i];
    const d = colD[i];
    const tx = colTx[i];
    const ty = colTy[i];

    const scaleX = Math.sqrt(a * a + b * b);
    const rotation = Math.atan2(b, a);
    // スキューは非対応 (0 除算を避ける)
    const scaleY = scaleX > 0.00001 ? (a * d - b * c) / scaleX : 0;

    const slot = colSlot[i];
    const frameId = colFrame[i];
    const tint = colTint[i];
    const layer = colLayer[i];
    const flags = colFlags[i];
    const sortKey = colSortKey[i];

    packSprite(
      stagingU32,
      stagingF32,
      slot,
      tx,
      ty,
      scaleX,
      scaleY,
      rotation,
      layer,
      frameId,
      tint,
      flags,
      sortKey,
    );

    // 64 スロット = 1 ブロック、32 ブロック = 1 ワード
    const block = slot >> 6;
    const word = block >> 5;
    const bit = block & 31;
    Atomics.or(dirtyInt32, word, 1 << bit);
  }
}

/**
 * スプライトパックカーネル定義。
 */
export const spritePackKernel: KernelDef = defineKernel('sprite-pack', spritePackKernelFn);
