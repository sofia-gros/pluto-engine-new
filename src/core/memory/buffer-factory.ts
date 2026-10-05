/**
 * @file バッキングバッファの生成と管理。
 */
import { assert } from '../debug/assert';

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
 * 伸長可能なバッキングバッファを作る。
 * @param initialBytes 初期バイト長 (8 の倍数)
 * @param maxBytes 最大バイト長 (8 の倍数, initialBytes 以上)
 * @returns 伸長可能な ArrayBuffer または SharedArrayBuffer
 */
export function createBackingBuffer(initialBytes: number, maxBytes: number): BackingBuffer {
  assert(initialBytes % 8 === 0, 'initialBytes は 8 の倍数でなければなりません');
  assert(maxBytes % 8 === 0, 'maxBytes は 8 の倍数でなければなりません');
  assert(initialBytes <= maxBytes, 'initialBytes は maxBytes 以下でなければなりません');

  if (isSharedMemoryEnabled()) {
    return new SharedArrayBuffer(initialBytes, { maxByteLength: maxBytes });
  } else {
    return new ArrayBuffer(initialBytes, { maxByteLength: maxBytes });
  }
}

/**
 * バッファを newBytes まで伸長する (縮小不可)。
 * @param buffer 対象のバッファ
 * @param newBytes 新しいバイト長 (8 の倍数, 現在のサイズより大きく、最大長以下であること)
 */
export function growBackingBuffer(buffer: BackingBuffer, newBytes: number): void {
  assert(newBytes % 8 === 0, 'newBytes は 8 の倍数でなければなりません');
  assert(newBytes > buffer.byteLength, 'newBytes は現在の byteLength より大きくなければなりません');

  if ('grow' in buffer) {
    buffer.grow(newBytes);
  } else if ('resize' in buffer) {
    buffer.resize(newBytes);
  } else {
    assert(false, 'バッファが grow または resize をサポートしていません');
  }
}
