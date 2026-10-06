/**
 * @file バッキングバッファの生成 (docs/04-memory-and-ecs.md §1.1)。
 * 伸長可能なバッファは V8 で要素アクセスが大幅に遅いので使わない (E-002)。伸長は利用側が新しいバッファへコピーして行う。
 */
import { assert } from '../debug';

/** バッキングバッファ。parallel ビルドでは SharedArrayBuffer。 */
export type BackingBuffer = ArrayBuffer | SharedArrayBuffer;

/**
 * SharedArrayBuffer が有効かどうかを判定する。
 * @returns 共有メモリが有効な場合は true
 */
export function isSharedMemoryEnabled(): boolean {
  return (
    __PARALLEL__ &&
    typeof globalThis.crossOriginIsolated === 'boolean' &&
    globalThis.crossOriginIsolated
  );
}

/**
 * 固定長 (伸長しない) のバッキングバッファを作る。
 * @param bytes バイト長 (0 以上の 8 の倍数)
 * @returns ArrayBuffer、または共有メモリが有効なら SharedArrayBuffer
 */
export function createBackingBuffer(bytes: number): BackingBuffer {
  assert(
    Number.isInteger(bytes) && bytes >= 0 && bytes % 8 === 0,
    'createBackingBuffer: bytes は 0 以上の 8 の倍数にしてください',
  );
  return isSharedMemoryEnabled() ? new SharedArrayBuffer(bytes) : new ArrayBuffer(bytes);
}
