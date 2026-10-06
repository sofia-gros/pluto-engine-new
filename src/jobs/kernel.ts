/**
 * @file カーネル (チャンクに対して実行する純粋関数) の型と定義 (docs/05-jobs-and-builds.md §2)。
 */
import type { ChunkView } from '../core/ecs';
import { registerKernel } from './kernel-registry';

/** カーネルに渡すパラメータの最大要素数 (= 64)。core/ecs で定義し、ここから再公開する。 */
export { MAX_KERNEL_PARAMS } from '../core/ecs';

/** カーネル ID (名前の FNV-1a 32 ビットハッシュ)。 */
export type KernelId = number & { readonly __brand: 'KernelId' };

/** カーネルが参照できる共有バッファ表。添字は `KernelBufferSlot` で固定。 */
export interface KernelBuffers {
  /** u32 ビューの表。 */
  readonly u32: readonly Uint32Array[];
  /** f32 ビューの表。 */
  readonly f32: readonly Float32Array[];
  /** i32 ビューの表 (Atomics 用)。 */
  readonly i32: readonly Int32Array[];
}

/** カーネル本体。view の範囲だけを読み書きする純粋関数 (§2 の契約)。 */
export type KernelFn = (view: ChunkView, params: Float32Array, buffers: KernelBuffers) => void;

/** カーネル定義。core/ecs の `KernelRef` を満たす。 */
export interface KernelDef {
  /** カーネル ID。 */
  readonly id: KernelId;
  /** カーネル名 (一意)。 */
  readonly name: string;
  /** 本体。 */
  readonly fn: KernelFn;
}

/**
 * カーネルを定義してレジストリに登録する。モジュールのトップレベルでのみ呼ぶ。
 * ID は名前のハッシュなので、メインと Worker で登録順によらず一致する。
 * @param name カーネル名 (一意)
 * @param fn 本体
 * @returns カーネル定義
 */
export function defineKernel(name: string, fn: KernelFn): KernelDef {
  return registerKernel(name, fn);
}

/** 共有バッファの固定スロット番号 (追加はタスクの指示がある場合のみ)。 */
export const KernelBufferSlot = {
  /** u32[0]: スプライトステージング (u32 ビュー)。 */
  SpriteStagingU32: 0,
  /** f32[0]: 同じバッファの f32 ビュー。 */
  SpriteStagingF32: 0,
  /** i32[0]: 64 スロット単位の dirty ビット (Atomics.or で立てる)。 */
  SpriteDirtyBits: 0,
  /** u32[1]: CPU カリング結果。 */
  CullOutput: 1,
  /** i32[1]: CPU カリングのビン別カウンタ (Atomics.add)。 */
  CullCounters: 1,
} as const;
