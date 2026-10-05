/**
 * @file カーネルをグローバルに管理するレジストリ。
 */

import type { KernelDef, KernelFn, KernelId } from './kernel';
import { assert } from '../core/debug/assert';

const KERNEL_REGISTRY: KernelDef[] = [];

/**
 * 内部用のカーネル登録処理。`defineKernel` から呼ばれる。
 *
 * @param name カーネル名。
 * @param fn カーネル関数。
 * @returns 登録されたカーネル定義。
 */
export function registerKernel(name: string, fn: KernelFn): KernelDef {
  const id = KERNEL_REGISTRY.length as KernelId;
  const def: KernelDef = { id, name, fn };
  KERNEL_REGISTRY.push(def);
  return def;
}

/**
 * ID からカーネル定義を取得する。
 *
 * @param id 取得したいカーネルのID。
 * @returns カーネル定義。
 * @throws 存在しない場合はエラー。
 */
export function getKernelById(id: KernelId): KernelDef {
  const def = KERNEL_REGISTRY[id] as KernelDef | undefined;
  assert(def !== undefined, 'KernelRegistry: 未登録のカーネルIDです');
  return def;
}

/**
 * テスト用にレジストリをクリアする。
 * 通常は使用しない。
 */
export function clearKernelRegistryForTesting(): void {
  KERNEL_REGISTRY.length = 0;
}

/**
 * 全ての登録済みカーネルを取得する。
 *
 * @returns カーネル定義の配列。
 */
export function getAllKernels(): readonly KernelDef[] {
  return KERNEL_REGISTRY;
}
