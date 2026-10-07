/**
 * @file WebGL2 版のバッファ (docs/06-rhi.md §4・§4.1・§7、`docs/02` §12)。
 * Uniform 用途は UBO、Storage 用途は読み取り専用のデータテクスチャ
 * (`RGBA32UI`、幅 2048 texel) に載せる。書き込みストレージは作らない
 * (`createBindGroup` で `StorageBufferReadWrite` を弾く)。
 */
import { ErrorCode, PlutoError } from '../../core/debug';
import type { RhiBuffer } from '../device';
import { BufferUsage, DATA_TEXTURE_TEXEL_BYTES, DATA_TEXTURE_WIDTH } from '../types';
import { toBufferHint } from './webgl2-convert';

/** UBO の結び付け先。仕様固定値。 */
const GL_UNIFORM_BUFFER = 0x8a11;

/** データテクスチャの対象。仕様固定値。 */
const GL_TEXTURE_2D = 0x0de1;

/** データテクスチャの sized internal format (`RGBA32UI`)。仕様固定値。 */
const GL_RGBA32UI = 0x8d70;

/** データテクスチャの画素形式 (`RGBA_INTEGER`)。仕様固定値。 */
const GL_RGBA_INTEGER = 0x8d8e;

/** データテクスチャの画素の型 (`UNSIGNED_INT`)。仕様固定値。 */
const GL_UNSIGNED_INT = 0x1405;

/** 1 行のバイト数 (2048 texel × 16 バイト)。 */
const ROW_BYTES = DATA_TEXTURE_WIDTH * DATA_TEXTURE_TEXEL_BYTES;

/**
 * `ArrayBufferView` の 1 要素のバイト数を求める。
 * @param data 転送するビュー
 * @returns 1 要素のバイト数
 */
function elementBytes(data: ArrayBufferView): number {
  if (data instanceof DataView) return 1;
  if (
    data instanceof Int8Array ||
    data instanceof Uint8Array ||
    data instanceof Uint8ClampedArray
  ) {
    return 1;
  }
  if (data instanceof Int16Array || data instanceof Uint16Array) return 2;
  if (data instanceof Int32Array || data instanceof Uint32Array || data instanceof Float32Array) {
    return 4;
  }
  return 8;
}

/**
 * `ArrayBufferView` の部分範囲を `Uint8Array` で切り出す。
 * @param data 転送するビュー
 * @param from 要素単位の開始位置
 * @param length 要素単位の長さ (省略時は末尾まで)
 * @returns 切り出したビュー
 */
function sliceView(data: ArrayBufferView, from: number, length?: number): Uint8Array {
  const unit = elementBytes(data);
  const start = data.byteOffset + from * unit;
  const bytes = length === undefined ? data.byteLength - from * unit : length * unit;
  return new Uint8Array(data.buffer, start, bytes);
}

/** WebGL2 版のバッファ。 */
export class WebGlBuffer implements RhiBuffer {
  /** 生成時のラベル。省略時は空文字列。 */
  public readonly label: string;

  /** バイト数。 */
  public readonly sizeBytes: number;

  /** `BufferUsage` のビットフラグ。 */
  public readonly usage: number;

  private readonly gl: WebGL2RenderingContext;

  private readonly isDataTexture: boolean;

  private readonly handle: WebGLBuffer | null;

  private readonly texture: WebGLTexture | null;

  private readonly rows: number;

  private destroyed = false;

  /**
   * バッファを作る。生成は `WebGlDevice.createBuffer` からだけ呼ぶ。
   * @param gl GL コンテキスト
   * @param label 生成時のラベル
   * @param sizeBytes バイト数
   * @param usage `BufferUsage` のビットフラグ
   */
  public constructor(gl: WebGL2RenderingContext, label: string, sizeBytes: number, usage: number) {
    this.gl = gl;
    this.label = label;
    this.sizeBytes = sizeBytes;
    this.usage = usage;
    this.isDataTexture = (usage & BufferUsage.Storage) !== 0;
    if (this.isDataTexture) {
      this.handle = null;
      this.rows = Math.max(1, Math.ceil(sizeBytes / ROW_BYTES));
      const tex = gl.createTexture();
      gl.bindTexture(GL_TEXTURE_2D, tex);
      gl.texImage2D(
        GL_TEXTURE_2D,
        0,
        GL_RGBA32UI,
        DATA_TEXTURE_WIDTH,
        this.rows,
        0,
        GL_RGBA_INTEGER,
        GL_UNSIGNED_INT,
        null,
      );
      this.texture = tex;
    } else {
      this.texture = null;
      this.rows = 0;
      const buf = gl.createBuffer();
      gl.bindBuffer(GL_UNIFORM_BUFFER, buf);
      gl.bufferData(GL_UNIFORM_BUFFER, sizeBytes, toBufferHint(usage));
      this.handle = buf;
    }
  }

  /**
   * データテクスチャかどうか。`src/rhi/webgl2/` 内部専用。
   * @returns データテクスチャなら true
   */
  public get isStorage(): boolean {
    return this.isDataTexture;
  }

  /**
   * UBO を取り出す。`src/rhi/webgl2/` 内部専用。
   * @returns GL バッファ
   */
  public get gpuBuffer(): WebGLBuffer | null {
    this.assertAlive();
    return this.handle;
  }

  /**
   * データテクスチャを取り出す。`src/rhi/webgl2/` 内部専用。
   * @returns GL テクスチャ
   */
  public get gpuTexture(): WebGLTexture | null {
    this.assertAlive();
    return this.texture;
  }

  /**
   * データテクスチャの高さ (texel 行数) を返す。`src/rhi/webgl2/` 内部専用。
   * @returns 行数
   */
  public get textureRows(): number {
    return this.rows;
  }

  /**
   * バッファへ書き込む。UBO は `bufferSubData`、データテクスチャは範囲を
   * texel に切り上げて `texSubImage2D` で送る (行をまたぐ範囲は分割する)。
   * @param dstOffsetBytes 書き込み先の開始バイト
   * @param data 書き込むデータ
   * @param srcOffsetElements `data` 側の開始位置 (要素単位、省略は 0)
   * @param sizeElements 書き込む大きさ (要素単位、省略は全部)
   */
  public write(
    dstOffsetBytes: number,
    data: ArrayBufferView,
    srcOffsetElements?: number,
    sizeElements?: number,
  ): void {
    this.assertAlive();
    if (!this.isDataTexture) {
      const handle = this.handle;
      if (handle === null) {
        throw new PlutoError(ErrorCode.InvalidState, `バッファ ${this.label} は使えません`);
      }
      this.gl.bindBuffer(GL_UNIFORM_BUFFER, handle);
      if (srcOffsetElements === undefined && sizeElements === undefined) {
        this.gl.bufferSubData(GL_UNIFORM_BUFFER, dstOffsetBytes, data);
        return;
      }
      this.gl.bufferSubData(
        GL_UNIFORM_BUFFER,
        dstOffsetBytes,
        data,
        srcOffsetElements ?? 0,
        sizeElements ?? data.byteLength,
      );
      return;
    }
    const view =
      srcOffsetElements === undefined && sizeElements === undefined
        ? new Uint8Array(data.buffer, data.byteOffset, data.byteLength)
        : sliceView(data, srcOffsetElements ?? 0, sizeElements);
    this.writeTexture(dstOffsetBytes, view);
  }

  /**
   * バッファの一部を読み出す。UBO だけ読める。コールドパスとテスト専用。
   * @param offsetBytes 読み出す開始バイト
   * @param sizeBytes 読み出すバイト数
   * @returns 読み出したデータ
   */
  public readAsync(offsetBytes: number, sizeBytes: number): ArrayBuffer {
    this.assertAlive();
    if (this.isDataTexture) {
      throw new PlutoError(
        ErrorCode.UnsupportedFeature,
        `データテクスチャ ${this.label} の読み戻しには対応していません。UBO を使ってください`,
      );
    }
    if (offsetBytes < 0 || sizeBytes < 0 || offsetBytes + sizeBytes > this.sizeBytes) {
      const end = offsetBytes + sizeBytes;
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        `読み出し範囲 ${String(offsetBytes)}..${String(end)} がバッファ ${this.label} を超えています`,
      );
    }
    const out = new ArrayBuffer(sizeBytes);
    this.gl.bindBuffer(GL_UNIFORM_BUFFER, this.handle);
    this.gl.getBufferSubData(GL_UNIFORM_BUFFER, offsetBytes, new Uint8Array(out));
    return out;
  }

  /**
   * バッファを破棄する。2 回呼んでも安全。
   */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.texture !== null) this.gl.deleteTexture(this.texture);
    if (this.handle !== null) this.gl.deleteBuffer(this.handle);
  }

  /**
   * データテクスチャへ書き込む。texel 単位に切り上げ、行をまたぐ場合は分ける。
   * @param dstOffsetBytes 書き込み先の開始バイト
   * @param data 書き込むデータ
   */
  private writeTexture(dstOffsetBytes: number, data: ArrayBufferView): void {
    const bytes = data.byteLength;
    const src = new Uint8Array(data.buffer, data.byteOffset, bytes);
    const firstTexel = Math.floor(dstOffsetBytes / DATA_TEXTURE_TEXEL_BYTES);
    const startByte = firstTexel * DATA_TEXTURE_TEXEL_BYTES;
    const endByte = dstOffsetBytes + bytes;
    const spanTexels = Math.ceil((endByte - startByte) / DATA_TEXTURE_TEXEL_BYTES);
    const stage = new Uint8Array(spanTexels * DATA_TEXTURE_TEXEL_BYTES);
    stage.set(src, dstOffsetBytes - startByte);
    const words = new Uint32Array(stage.buffer);
    this.gl.bindTexture(GL_TEXTURE_2D, this.texture);
    let texel = firstTexel;
    let done = 0;
    while (done < spanTexels) {
      const y = Math.floor(texel / DATA_TEXTURE_WIDTH);
      const x = texel % DATA_TEXTURE_WIDTH;
      const rest = Math.min(spanTexels - done, DATA_TEXTURE_WIDTH - x);
      this.gl.texSubImage2D(
        GL_TEXTURE_2D,
        0,
        x,
        y,
        rest,
        1,
        GL_RGBA_INTEGER,
        GL_UNSIGNED_INT,
        words,
        done * 4,
      );
      texel += rest;
      done += rest;
    }
  }

  /**
   * 破棄済みなら例外を投げる。
   */
  private assertAlive(): void {
    if (this.destroyed) {
      throw new PlutoError(ErrorCode.InvalidState, `破棄済みのバッファ ${this.label} を使いました`);
    }
  }
}
