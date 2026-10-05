/**
 * @file カーネル定義と共有バッファの定義。
 */

import type { ChunkView } from '../core/ecs/chunk-view';
import { registerKernel } from './kernel-registry';

/**
 * カーネルを一意に識別するID。
 */
export type KernelId = number & { readonly __brand: 'KernelId' };

/**
 * カーネルが参照できる共有バッファ表。
 * index は `KernelBufferSlot` 定数で固定。
 */
export interface KernelBuffers {
  readonly u32: readonly Uint32Array[];
  readonly f32: readonly Float32Array[];
  readonly i32: readonly Int32Array[]; // Atomics 用
}

/**
 * カーネル本体。
 * view の範囲だけを読み書きする純粋関数。
 */
export type KernelFn = (view: ChunkView, params: Float32Array, buffers: KernelBuffers) => void;

/**
 * カーネル定義。
 */
export interface KernelDef {
  readonly id: KernelId;
  readonly name: string;
  readonly fn: KernelFn;
}

/**
 * 新しいカーネルを定義し、レジストリに登録する。
 *
 * @param name カーネルの名前。
 * @param fn カーネルの処理関数。
 * @returns 登録されたカーネル定義。
 */
export function defineKernel(name: string, fn: KernelFn): KernelDef {
  return registerKernel(name, fn);
}

/**
 * 共有バッファの固定スロット番号。
 */
export const KernelBufferSlot = {
  SpriteStagingU32: 0, // u32[0]: スプライトステージング (u32 ビュー)
  SpriteStagingF32: 0, // f32[0]: 同じバッファの f32 ビュー
  SpriteDirtyBits: 0, // i32[0]: 64 スロット単位の dirty ビット (Atomics.or で立てる)
  CullOutput: 1, // u32[1]: CPU カリング結果
  CullCounters: 1, // i32[1]: CPU カリングのビン別カウンタ (Atomics.add)
} as const;
