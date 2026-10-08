// @pluto-hot
/**
 * @file GPU/CPU スプライトバッファ管理
 *
 * docs/07-renderer.md §10 に基づき、スロット割当 (RangeAllocator)、
 * CPU ステージングバッファ、dirty ブロック管理 (Bitset)、および GPU 転送を行う。
 */

import { ErrorCode, PlutoError } from '../../core/debug';
import { Bitset, RangeAllocator } from '../../core/memory';
import {
  BufferUsage,
  TextureDimension,
  TextureFormat,
  TextureUsage,
  type RhiBuffer,
  type RhiDevice,
  type RhiTexture,
} from '../../rhi';
import {
  DATA_TEXTURE_WIDTH,
  DEFAULT_MAX_SPRITES,
  GPU_GROUP_ALIGN,
  SPRITE_STRIDE_BYTES,
  SPRITE_STRIDE_WORDS,
} from '../render-constants';
import { SPRITE_WORD_FLAGS } from './sprite-instance-layout';

/** 1 ブロックあたりのスロット数 (dirty 管理単位) */
const SLOTS_PER_BLOCK = 64;

/** 1 フレームあたりの最大分割転送数 */
export const MAX_UPLOAD_RANGES_PER_FRAME = 256;

/**
 * 内部で再利用するアップロード範囲型。
 */
interface UploadRange {
  startBlock: number;
  endBlock: number;
}

/**
 * スプライトバッファ管理クラス。
 */
export class SpriteBuffer {
  /** 最大スプライト容量 */
  public readonly maxSprites: number;

  /** CPU ステージング用 ArrayBuffer */
  public readonly buffer: ArrayBuffer;
  /** ステージングバッファの Uint32 ビュー */
  public readonly u32View: Uint32Array;
  /** ステージングバッファの Float32 ビュー */
  public readonly f32View: Float32Array;

  /** 64 スロット単位の dirty ビットセット */
  public readonly dirtyBlocks: Bitset;

  private readonly allocator: RangeAllocator;
  private readonly blockCount: number;
  private readonly uploadRanges: UploadRange[];

  private currentHighWater = 0;
  private gpuBuffer: RhiBuffer | undefined = undefined;
  private gpuTexture: RhiTexture | undefined = undefined;

  /**
   * GPU ストレージバッファを取得する (WebGPU 用)。
   */
  public getGpuBuffer(): RhiBuffer | undefined {
    return this.gpuBuffer;
  }

  /**
   * GPU データテクスチャを取得する (WebGL2 用)。
   */
  public getGpuTexture(): RhiTexture | undefined {
    return this.gpuTexture;
  }

  /**
   * @param maxSprites 最大スプライト数 (既定: DEFAULT_MAX_SPRITES = 1,048,576)
   */
  public constructor(maxSprites = DEFAULT_MAX_SPRITES) {
    this.maxSprites = maxSprites;
    this.buffer = new ArrayBuffer(this.maxSprites * SPRITE_STRIDE_BYTES);
    this.u32View = new Uint32Array(this.buffer);
    this.f32View = new Float32Array(this.buffer);

    this.allocator = new RangeAllocator(this.maxSprites);
    this.blockCount = Math.ceil(this.maxSprites / SLOTS_PER_BLOCK);
    this.dirtyBlocks = new Bitset(this.blockCount);

    this.uploadRanges = [];
    for (let i = 0; i < MAX_UPLOAD_RANGES_PER_FRAME; i++) {
      this.uploadRanges.push({ startBlock: 0, endBlock: 0 });
    }
  }

  /**
   * 使用中最大スロット + 1 (カリング対象スロット数)。
   *
   * @returns highWater 値
   */
  public get highWater(): number {
    return this.currentHighWater;
  }

  /**
   * GPU バッファリソースを取得する。
   *
   * @returns RHI バッファ、未作成時は undefined
   */
  public get bufferResource(): RhiBuffer | undefined {
    return this.gpuBuffer;
  }

  /**
   * 単一のスプライトスロットを確保する (CPU Tier 用)。
   *
   * @returns 確保されたスロット番号
   * @throws {@link PlutoError} 容量超過の場合
   */
  public allocateSlot(): number {
    const slot = this.allocator.allocate(1, 1);
    if (slot === -1) {
      throw new PlutoError(
        ErrorCode.CapacityExceeded,
        `スプライトバッファの容量 (${String(this.maxSprites)}) を超過しました。`, // pluto-allow: コールドパスのエラー送出のため許可
      );
    }

    if (slot + 1 > this.currentHighWater) {
      this.currentHighWater = slot + 1;
    }

    this.markDirty(slot);
    return slot;
  }

  /**
   * GPU_GROUP_ALIGN (1024) 整列の連続スロット範囲を確保する (GPU Tier グループ用)。
   *
   * @param count 確保する連続スロット数
   * @returns 確保された開始スロット番号
   * @throws {@link PlutoError} 容量超過の場合
   */
  public allocateGroup(count: number): number {
    const start = this.allocator.allocate(count, GPU_GROUP_ALIGN);
    if (start === -1) {
      throw new PlutoError(
        ErrorCode.CapacityExceeded,
        `スプライトバッファに連続 ${String(count)} スロットを確保できませんでした。`, // pluto-allow: コールドパスのエラー送出のため許可
      );
    }

    if (start + count > this.currentHighWater) {
      this.currentHighWater = start + count;
    }

    this.markRangeDirty(start, count);
    return start;
  }

  /**
   * スロットを解放する。flags = 0 を書き込んで可視性をオフにする。
   *
   * @param slot 解放するスロット番号
   */
  public freeSlot(slot: number): void {
    const base = slot * SPRITE_STRIDE_WORDS;
    this.u32View[base + SPRITE_WORD_FLAGS] = 0;
    this.markDirty(slot);
    this.allocator.free(slot, 1);
  }

  /**
   * 連続するスロットグループを解放する。
   *
   * @param start 開始スロット番号
   * @param count スロット数
   */
  public freeGroup(start: number, count: number): void {
    for (let i = 0; i < count; i++) {
      const base = (start + i) * SPRITE_STRIDE_WORDS;
      this.u32View[base + SPRITE_WORD_FLAGS] = 0;
    }
    this.markRangeDirty(start, count);
    this.allocator.free(start, count);
  }

  /**
   * 指定したスロットを dirty としてマークする。
   *
   * @hot
   * @param slot スロット番号
   */
  public markDirty(slot: number): void {
    const block = slot >> 6;
    this.dirtyBlocks.set(block);
  }

  /**
   * 連続するスロット範囲を dirty としてマークする。
   *
   * @hot
   * @param start 開始スロット番号
   * @param count スロット数
   */
  public markRangeDirty(start: number, count: number): void {
    const startBlock = start >> 6;
    const endBlock = (start + count - 1) >> 6;
    for (let b = startBlock; b <= endBlock; b++) {
      this.dirtyBlocks.set(b);
    }
  }

  /**
   * dirty なスロット範囲を GPU バッファに転送する。
   *
   * @hot
   * @param device RHI デバイス
   */
  public flushToGpu(device: RhiDevice): void {
    if (device.caps.backend === 'webgpu') {
      this.gpuBuffer ??= device.createBuffer({
        sizeBytes: this.buffer.byteLength,
        usage: BufferUsage.Storage | BufferUsage.CopyDst,
        label: 'SpriteBuffer',
      }); // pluto-allow: 初回フラッシュ時の遅延バッファ生成
    } else {
      const texHeight = Math.ceil((this.maxSprites * 2) / DATA_TEXTURE_WIDTH) | 0;
      this.gpuTexture ??= device.createTexture({
        width: DATA_TEXTURE_WIDTH,
        height: texHeight > 0 ? texHeight : 1,
        layers: 1,
        format: TextureFormat.RGBA32Uint,
        usage: TextureUsage.TextureBinding | TextureUsage.CopyDst,
        dimension: TextureDimension.D2,
        label: 'SpriteDataTexture',
      }); // pluto-allow: 初回フラッシュ時の遅延テクスチャ生成
    }

    let rangeCount = 0;
    let isInRange = false;
    let rangeStart = 0;
    let minBlock = Infinity;
    let maxBlock = -1;

    for (let b = 0; b < this.blockCount; b++) {
      if (this.dirtyBlocks.test(b)) {
        if (b < minBlock) {
          minBlock = b;
        }
        if (b > maxBlock) {
          maxBlock = b;
        }

        if (!isInRange) {
          isInRange = true;
          rangeStart = b;
        }
      } else if (isInRange) {
        isInRange = false;
        if (rangeCount < MAX_UPLOAD_RANGES_PER_FRAME) {
          const r = this.uploadRanges[rangeCount];
          r.startBlock = rangeStart;
          r.endBlock = b - 1;
          rangeCount++;
        }
      }
    }

    if (isInRange && rangeCount < MAX_UPLOAD_RANGES_PER_FRAME) {
      const r = this.uploadRanges[rangeCount];
      r.startBlock = rangeStart;
      r.endBlock = this.blockCount - 1;
      rangeCount++;
    }

    if (maxBlock === -1) {
      return; // dirty なブロックなし
    }

    if (rangeCount < MAX_UPLOAD_RANGES_PER_FRAME) {
      // 個別の連続ブロックを転送
      for (let i = 0; i < rangeCount; i++) {
        const r = this.uploadRanges[i];
        this.writeBlocks(device, r.startBlock, r.endBlock);
      }
    } else {
      // 範囲数があふれた場合は最小〜最大の 1 回でバッチ転送
      this.writeBlocks(device, minBlock, maxBlock);
    }

    this.dirtyBlocks.clearAll();
  }

  /**
   * 指定したブロック範囲を GPU バッファまたはデータテクスチャに書き込む。
   */
  private writeBlocks(device: RhiDevice, startBlock: number, endBlock: number): void {
    const startSlot = startBlock * SLOTS_PER_BLOCK;
    const endSlot = Math.min((endBlock + 1) * SLOTS_PER_BLOCK, this.maxSprites);
    const startWord = startSlot * SPRITE_STRIDE_WORDS;
    const endWord = endSlot * SPRITE_STRIDE_WORDS;
    const byteOffset = startWord * 4;

    const subView = this.u32View.subarray(startWord, endWord);

    if (this.gpuBuffer !== undefined) {
      device.writeBuffer(this.gpuBuffer, byteOffset, subView);
    } else if (this.gpuTexture !== undefined) {
      const startTexel = startSlot * 2;
      const countTexels = (endSlot - startSlot) * 2;
      const startY = (startTexel / DATA_TEXTURE_WIDTH) | 0;
      const endY = ((startTexel + countTexels - 1) / DATA_TEXTURE_WIDTH) | 0;
      const height = endY - startY + 1;
      device.writeTexture(
        this.gpuTexture,
        {
          offsetX: 0,
          offsetY: startY,
          layer: 0,
          width: DATA_TEXTURE_WIDTH,
          height,
        }, // pluto-allow: writeTexture 記述子生成
        this.u32View.subarray(
          startY * DATA_TEXTURE_WIDTH * 4,
          (startY + height) * DATA_TEXTURE_WIDTH * 4,
        ),
      );
    }
  }
}
