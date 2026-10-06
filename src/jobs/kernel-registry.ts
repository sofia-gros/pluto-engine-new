/**
 * @file カーネルの登録表 (ID → 定義)。Worker 側も同じモジュールを読み込んで同じ表を作る (docs/05-jobs-and-builds.md §2)。
 */
import { ErrorCode, PlutoError } from '../core/debug';
import type { KernelDef, KernelFn, KernelId } from './kernel';

const registry = new Map<number, KernelDef>();

/**
 * 文字列の FNV-1a 32 ビットハッシュ (UTF-16 コード単位で計算する)。
 * @param text 文字列
 * @returns 32 ビット符号なし整数
 */
export function fnv1a32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/**
 * カーネルを登録する (`defineKernel` から呼ばれる)。
 * @param name カーネル名 (一意)
 * @param fn 本体
 * @returns カーネル定義
 */
export function registerKernel(name: string, fn: KernelFn): KernelDef {
  const id = fnv1a32(name) as KernelId;
  const existing = registry.get(id);
  if (existing !== undefined) {
    const reason =
      existing.name === name
        ? '同じ名前のカーネルが既にあります'
        : `カーネル '${existing.name}' と ID が衝突しました`;
    throw new PlutoError(
      ErrorCode.InvalidArgument,
      `カーネル '${name}': ${reason}。名前を変えてください。`,
    );
  }
  const def: KernelDef = { id, name, fn };
  registry.set(id, def);
  return def;
}

/**
 * ID からカーネルを引く (無ければ undefined。Worker が参加できるかの判定に使う)。
 * @param id カーネル ID
 * @returns カーネル定義、または undefined
 */
export function findKernel(id: number): KernelDef | undefined {
  return registry.get(id);
}

/**
 * ID からカーネルを引く。
 * @param id カーネル ID
 * @returns カーネル定義
 */
export function getKernelById(id: number): KernelDef {
  const def = registry.get(id);
  if (def === undefined) {
    throw new PlutoError(
      ErrorCode.InvalidArgument,
      `カーネル ID ${String(id)} は登録されていません (Worker 側では src/worker-main.ts が定義元のモジュールを import しているか確認してください)。`,
    );
  }
  return def;
}

/**
 * 登録済みのカーネル (登録順)。
 * @returns カーネル定義の配列
 */
export function getAllKernels(): readonly KernelDef[] {
  return [...registry.values()];
}

/**
 * テスト専用: 登録表を空にする (jobs/index.ts からは公開しない)。
 */
export function clearKernelRegistryForTesting(): void {
  registry.clear();
}
