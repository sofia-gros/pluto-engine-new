/**
 * @file フレームテーブル (フレーム情報管理および GPU バッファ同期)
 *
 * 各フレームの UV、サイズ、アンカー、テクスチャ配列層を 32 バイト単位で保持し、
 * 派生フレームのキャッシュおよび GPU バッファへの同期を行う。
 */

import { ErrorCode, PlutoError } from '../../core/debug';
import { packHalf2x16 } from '../../core/math';
import { BufferUsage, type RhiBuffer, type RhiDevice } from '../../rhi';
import { FRAME_STRIDE_BYTES, MAX_FRAMES, WHITE_FRAME_ID } from '../render-constants';

/**
 * 1 ワード (32bit) 単位のフレームストライド。
 */
const FRAME_STRIDE_WORDS = FRAME_STRIDE_BYTES / 4; // 8 words

/**
 * フレーム登録記述子。
 */
export interface FrameDescriptor {
  readonly uvMinX: number;
  readonly uvMinY: number;
  readonly uvMaxX: number;
  readonly uvMaxY: number;
  readonly width: number;
  readonly height: number;
  readonly anchorX?: number;
  readonly anchorY?: number;
  readonly page: number;
}

/**
 * フレーム情報保持用インターフェース。
 */
export interface FrameInfo {
  readonly uvMinX: number;
  readonly uvMinY: number;
  readonly uvMaxX: number;
  readonly uvMaxY: number;
  readonly width: number;
  readonly height: number;
  readonly anchorX: number;
  readonly anchorY: number;
  readonly page: number;
}

/**
 * フレームテーブルクラス。
 */
export class FrameTable {
  private readonly maxFrames: number;
  private readonly buffer: ArrayBuffer;
  private readonly f32View: Float32Array;
  private readonly u32View: Uint32Array;
  private readonly frames: FrameInfo[] = [];
  private readonly derivedCache = new Map<string, number>();

  private dirtyMin = Infinity;
  private dirtyMax = -1;
  private gpuBuffer: RhiBuffer | undefined = undefined;

  /**
   * @param maxFrames 最大フレーム数 (既定: 65536)
   */
  public constructor(maxFrames = MAX_FRAMES) {
    this.maxFrames = maxFrames;
    this.buffer = new ArrayBuffer(this.maxFrames * FRAME_STRIDE_BYTES);
    this.f32View = new Float32Array(this.buffer);
    this.u32View = new Uint32Array(this.buffer);

    // WHITE_FRAME_ID (0) を予約登録 (4x4px 白領域、アンカー 0.5, 0.5、層 0)
    this.initWhiteFrame();
  }

  /**
   * 登録済みフレーム総数を取得する。
   *
   * @returns フレーム数
   */
  public get count(): number {
    return this.frames.length;
  }

  /**
   * GPU バッファを取得する (flush 実行前は undefined の場合あり)。
   *
   * @returns GPU バッファ
   */
  public get bufferResource(): RhiBuffer | undefined {
    return this.gpuBuffer;
  }

  /**
   * 指定した ID のフレーム情報を取得する。
   *
   * @param frameId フレーム ID
   * @returns フレーム情報、未登録の場合は undefined
   */
  public getFrame(frameId: number): FrameInfo | undefined {
    return this.frames[frameId];
  }

  /**
   * フレームを追加登録する。
   *
   * @param desc フレーム記述子
   * @returns 発行された frameId
   * @throws {@link PlutoError} 最大フレーム数を超過した場合
   */
  public addFrame(desc: FrameDescriptor): number {
    if (this.frames.length >= this.maxFrames) {
      throw new PlutoError(
        ErrorCode.CapacityExceeded,
        `フレームテーブルの容量 (${String(this.maxFrames)}) を超過しました。`,
      );
    }

    const frameId = this.frames.length;
    const anchorX = desc.anchorX ?? 0.5;
    const anchorY = desc.anchorY ?? 0.5;

    const info: FrameInfo = {
      uvMinX: desc.uvMinX,
      uvMinY: desc.uvMinY,
      uvMaxX: desc.uvMaxX,
      uvMaxY: desc.uvMaxY,
      width: desc.width,
      height: desc.height,
      anchorX,
      anchorY,
      page: desc.page,
    };

    this.writeFrameData(frameId, info);
    this.frames.push(info);
    this.markDirty(frameId);

    return frameId;
  }

  /**
   * アンカー違いの派生フレームを取得する。
   * 同一 (baseFrameId, anchorX, anchorY) の組み合わせはキャッシュから同一 ID を返す。
   *
   * @param baseFrameId 基準となるフレーム ID
   * @param anchorX 新しいアンカー X (0〜1)
   * @param anchorY 新しいアンカー Y (0〜1)
   * @returns 派生フレーム ID
   * @throws {@link PlutoError} 基準フレームが存在しない、または容量超過の場合
   */
  public getDerivedFrame(baseFrameId: number, anchorX: number, anchorY: number): number {
    if (baseFrameId < 0 || baseFrameId >= this.frames.length) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        `基準フレーム ID (${String(baseFrameId)}) が存在しません。`,
      );
    }

    const base = this.frames[baseFrameId];

    if (base.anchorX === anchorX && base.anchorY === anchorY) {
      return baseFrameId;
    }

    const cacheKey = `${String(baseFrameId)}_${String(anchorX)}_${String(anchorY)}`;
    const cachedId = this.derivedCache.get(cacheKey);
    if (cachedId !== undefined) {
      return cachedId;
    }

    const derivedId = this.addFrame({
      uvMinX: base.uvMinX,
      uvMinY: base.uvMinY,
      uvMaxX: base.uvMaxX,
      uvMaxY: base.uvMaxY,
      width: base.width,
      height: base.height,
      anchorX,
      anchorY,
      page: base.page,
    });

    this.derivedCache.set(cacheKey, derivedId);
    return derivedId;
  }

  /**
   * 変更があったフレームデータを GPU バッファに同期する。
   *
   * @param device RHI デバイス
   */
  public flush(device: RhiDevice): void {
    if (this.gpuBuffer === undefined) {
      this.gpuBuffer = device.createBuffer({
        sizeBytes: this.buffer.byteLength,
        usage: BufferUsage.Storage | BufferUsage.CopyDst,
        label: 'FrameTableBuffer',
      });
      // 初回は全体を転送
      this.dirtyMin = 0;
      this.dirtyMax = this.frames.length - 1;
    }

    if (this.dirtyMin > this.dirtyMax || this.dirtyMax < 0) {
      return;
    }

    const startWord = this.dirtyMin * FRAME_STRIDE_WORDS;
    const endWord = (this.dirtyMax + 1) * FRAME_STRIDE_WORDS;
    const byteOffset = startWord * 4;
    const subArray = this.u32View.subarray(startWord, endWord);

    device.writeBuffer(this.gpuBuffer, byteOffset, subArray);

    this.dirtyMin = Infinity;
    this.dirtyMax = -1;
  }

  /**
   * WHITE_FRAME_ID (0) を初期化する。
   */
  private initWhiteFrame(): void {
    // 4x4px 白領域 (層 0、UV は 0〜4px の安全な領域)
    const whiteInfo: FrameInfo = {
      uvMinX: 0,
      uvMinY: 0,
      uvMaxX: 4 / 2048,
      uvMaxY: 4 / 2048,
      width: 4,
      height: 4,
      anchorX: 0.5,
      anchorY: 0.5,
      page: 0,
    };
    this.writeFrameData(WHITE_FRAME_ID, whiteInfo);
    this.frames.push(whiteInfo);
    this.markDirty(WHITE_FRAME_ID);
  }

  /**
   * フレームデータを ArrayBuffer に書き込む。
   */
  private writeFrameData(frameId: number, info: FrameInfo): void {
    const offset = frameId * FRAME_STRIDE_WORDS;
    // byte 0..15 (f32 x 4): uvMinX, uvMinY, uvMaxX, uvMaxY
    this.f32View[offset + 0] = info.uvMinX;
    this.f32View[offset + 1] = info.uvMinY;
    this.f32View[offset + 2] = info.uvMaxX;
    this.f32View[offset + 3] = info.uvMaxY;

    // byte 16..19 (f16 x 2): width, height
    this.u32View[offset + 4] = packHalf2x16(info.width, info.height);

    // byte 20..23 (f16 x 2): anchorX, anchorY
    this.u32View[offset + 5] = packHalf2x16(info.anchorX, info.anchorY);

    // byte 24..27 (u32): page
    this.u32View[offset + 6] = info.page >>> 0;

    // byte 28..31 (u32): 予約
    this.u32View[offset + 7] = 0;
  }

  /**
   * 指定フレームを dirty として記録する。
   */
  private markDirty(frameId: number): void {
    if (frameId < this.dirtyMin) {
      this.dirtyMin = frameId;
    }
    if (frameId > this.dirtyMax) {
      this.dirtyMax = frameId;
    }
  }
}
