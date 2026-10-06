/**
 * @file core/memory モジュールの公開窓口。
 */
export { ScalarType, SCALAR_BYTES } from './scalar-type';
export type { TypedArrayOf } from './scalar-type';
export { isSharedMemoryEnabled, createBackingBuffer } from './buffer-factory';
export type { BackingBuffer } from './buffer-factory';
export { Bitset } from './bitset';
export { FreeList } from './free-list';
export { RangeAllocator } from './range-allocator';
export type { Range } from './range-allocator';
export { RingBuffer } from './ring-buffer';
export type { AnyTypedArray } from './ring-buffer';
export { ObjectPool } from './object-pool';
