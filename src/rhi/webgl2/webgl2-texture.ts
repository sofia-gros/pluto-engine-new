/**
 * @file WebGL2 版のテクスチャとサンプラ (docs/06-rhi.md §4・§4.1・§5、`docs/02` §12)。
 * `RhiTexture` と `RhiSampler` を `WebGLTexture`・`WebGLSampler` で満たす。
 */
import { ErrorCode, PlutoError } from '../../core/debug';
import type { RhiSampler, RhiTexture } from '../device';
import {
  TextureDimension,
  TextureFormat,
  FilterMode,
  AddressMode,
  type TextureDesc,
  type TextureWriteDesc,
} from '../types';
import {
  blockBytes,
  blockSide,
  isCompressedFormat,
  toAddressMode,
  toFilterMode,
  toTextureFormatInfo,
  toTextureTarget,
} from './webgl2-convert';

/**
 * WebGL テクスチャの生成に使う記述子。`TextureDesc` に必須ラベルを足したもの。
 */
export type WebGlTextureDesc = TextureDesc & {
  /** 生成時のラベル。 */
  readonly label: string;
  /** スワップチェーンの目印かどうか。省略時は偽。 */
  readonly swapchain?: boolean;
};

/** WebGL2 版のテクスチャ。 */
export class WebGlTexture implements RhiTexture {
  /** 生成時のラベル。省略時は空文字列。 */
  public readonly label: string;

  /** `TextureFormat` の値。 */
  public readonly format: number;

  /** 幅 (px)。 */
  public readonly width: number;

  /** 高さ (px)。 */
  public readonly height: number;

  /** `TextureDimension` の値。 */
  public readonly dimension: number;

  /** レイヤー数。 */
  public readonly layers: number;

  /** `TextureUsage` のビットフラグ。 */
  public readonly usage: number;

  /** スワップチェーンの目印かどうか。描画先の解決に使う。 */
  public readonly swapchain: boolean;

  private readonly gl: WebGL2RenderingContext;

  private readonly handle: WebGLTexture | null;

  private destroyed = false;

  /**
   * テクスチャのラッパーを作る。生成は `WebGlDevice.createTexture` からだけ呼ぶ。
   * @param gl GL コンテキスト
   * @param handle GL テクスチャ
   * @param desc 生成時の記述子
   */
  public constructor(
    gl: WebGL2RenderingContext,
    handle: WebGLTexture | null,
    desc: WebGlTextureDesc,
  ) {
    this.gl = gl;
    this.handle = handle;
    this.label = desc.label;
    this.format = desc.format;
    this.width = desc.width;
    this.height = desc.height;
    this.dimension = desc.dimension ?? TextureDimension.D2;
    this.layers = desc.layers;
    this.usage = desc.usage;
    this.swapchain = desc.swapchain ?? false;
  }

  /**
   * GL テクスチャを取り出す。`src/rhi/webgl2/` 内部専用。
   * @returns GL テクスチャ
   */
  public get gpu(): WebGLTexture | null {
    this.assertAlive();
    return this.handle;
  }

  /**
   * テクスチャを破棄する。2 回呼んでも安全。
   */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.gl.deleteTexture(this.handle);
  }

  /**
   * 破棄済みなら例外を投げる。
   */
  private assertAlive(): void {
    if (this.destroyed) {
      throw new PlutoError(
        ErrorCode.InvalidState,
        `破棄済みのテクスチャ ${this.label} を使いました`,
      );
    }
  }
}

/** WebGL2 版のサンプラ。 */
export class WebGlSampler implements RhiSampler {
  private readonly gl: WebGL2RenderingContext;

  private readonly handle: WebGLSampler | null;

  private destroyed = false;

  /**
   * サンプラのラッパーを作る。生成は `WebGlDevice.createSampler` からだけ呼ぶ。
   * @param gl GL コンテキスト
   * @param handle GL サンプラ
   */
  public constructor(gl: WebGL2RenderingContext, handle: WebGLSampler | null) {
    this.gl = gl;
    this.handle = handle;
  }

  /**
   * GL サンプラを取り出す。`src/rhi/webgl2/` 内部専用。
   * @returns GL サンプラ
   */
  public get gpu(): WebGLSampler | null {
    if (this.destroyed) {
      throw new PlutoError(ErrorCode.InvalidState, '破棄済みのサンプラを使いました');
    }
    return this.handle;
  }

  /**
   * サンプラを破棄する。2 回呼んでも安全。
   */
  public destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    this.gl.deleteSampler(this.handle);
  }
}

/** テクスチャ引数の名前。仕様固定値。 */
const GL_TEXTURE_MIN_FILTER = 0x2801;
const GL_TEXTURE_MAG_FILTER = 0x2800;
const GL_TEXTURE_WRAP_S = 0x2802;
const GL_TEXTURE_WRAP_T = 0x2803;

/**
 * テクスチャの領域を確保する。生成時に 1 回だけ呼ぶ。
 * 圧縮書式は 0 埋めで確保する。
 * @param gl GL コンテキスト
 * @param handle 結び付け済みの GL テクスチャ
 * @param desc 生成時の記述子
 */
export function allocateTextureStorage(
  gl: WebGL2RenderingContext,
  handle: WebGLTexture | null,
  desc: TextureDesc,
): void {
  const target = toTextureTarget(desc.dimension ?? TextureDimension.D2);
  const info = toTextureFormatInfo(desc.format);
  gl.bindTexture(target, handle);
  gl.texParameteri(target, GL_TEXTURE_MIN_FILTER, toFilterMode(FilterMode.Nearest));
  gl.texParameteri(target, GL_TEXTURE_MAG_FILTER, toFilterMode(FilterMode.Nearest));
  gl.texParameteri(target, GL_TEXTURE_WRAP_S, toAddressMode(AddressMode.ClampToEdge));
  gl.texParameteri(target, GL_TEXTURE_WRAP_T, toAddressMode(AddressMode.ClampToEdge));
  gl.bindTexture(target, handle);
  if (isCompressedFormat(desc.format)) {
    const blocks = Math.ceil(desc.width / 4) * Math.ceil(desc.height / 4);
    const bytes = blocks * (desc.format === TextureFormat.ETC2RGBA8Unorm ? 8 : 16);
    gl.compressedTexImage2D(
      target,
      0,
      info.internalFormat,
      desc.width,
      desc.height,
      0,
      new Uint8Array(bytes),
    );
    return;
  }
  if (desc.dimension === TextureDimension.D2Array) {
    gl.texImage3D(
      target,
      0,
      info.internalFormat,
      desc.width,
      desc.height,
      desc.layers,
      0,
      info.format,
      info.type,
      null,
    );
    return;
  }
  gl.texImage2D(
    target,
    0,
    info.internalFormat,
    desc.width,
    desc.height,
    0,
    info.format,
    info.type,
    null,
  );
}

/**
 * テクスチャへ画像データを書き込む。結び付けは呼び出し側で行う。
 * @param gl GL コンテキスト
 * @param target GL の対象
 * @param format `TextureFormat` の値
 * @param dimension `TextureDimension` の値
 * @param desc 書き込む範囲
 * @param data 画像データ
 */
export function uploadTextureData(
  gl: WebGL2RenderingContext,
  target: number,
  format: number,
  dimension: number,
  desc: TextureWriteDesc,
  data: ArrayBufferView | ImageBitmap,
): void {
  const info = toTextureFormatInfo(format);
  if (isCompressedFormat(format)) {
    uploadCompressed(gl, target, dimension, desc, info.internalFormat, data);
    return;
  }
  if (typeof ImageBitmap !== 'undefined' && data instanceof ImageBitmap) {
    if (dimension === TextureDimension.D2Array) {
      gl.texSubImage3D(
        target,
        0,
        desc.offsetX,
        desc.offsetY,
        desc.layer,
        desc.width,
        desc.height,
        1,
        info.format,
        info.type,
        data,
      );
    } else {
      gl.texSubImage2D(
        target,
        0,
        desc.offsetX,
        desc.offsetY,
        desc.width,
        desc.height,
        info.format,
        info.type,
        data,
      );
    }
    return;
  }
  const view = data as ArrayBufferView;
  if (dimension === TextureDimension.D2Array) {
    gl.texSubImage3D(
      target,
      0,
      desc.offsetX,
      desc.offsetY,
      desc.layer,
      desc.width,
      desc.height,
      1,
      info.format,
      info.type,
      view,
    );
    return;
  }
  gl.texSubImage2D(
    target,
    0,
    desc.offsetX,
    desc.offsetY,
    desc.width,
    desc.height,
    info.format,
    info.type,
    view,
  );
}

/**
/**
 * 圧縮テクスチャへ書き込む。範囲は 4 の倍数でなければならない。
 * @param gl GL コンテキスト
 * @param target GL の対象
 * @param dimension `TextureDimension` の値
 * @param desc 書き込む範囲
 * @param internalFormat 内部形式
 * @param data ブロック単位のバイト列
 */
function uploadCompressed(
  gl: WebGL2RenderingContext,
  target: number,
  dimension: number,
  desc: TextureWriteDesc,
  internalFormat: number,
  data: ArrayBufferView | ImageBitmap,
): void {
  if (
    desc.offsetX % 4 !== 0 ||
    desc.offsetY % 4 !== 0 ||
    desc.width % 4 !== 0 ||
    desc.height % 4 !== 0
  ) {
    throw new PlutoError(
      ErrorCode.InvalidArgument,
      '圧縮テクスチャの範囲は 4 の倍数でなければなりません',
    );
  }
  if (typeof ImageBitmap !== 'undefined' && data instanceof ImageBitmap) {
    throw new PlutoError(
      ErrorCode.InvalidArgument,
      '圧縮テクスチャに ImageBitmap は使えません。ブロック単位のバイト列を渡してください',
    );
  }
  const view = data as ArrayBufferView;
  if (dimension === TextureDimension.D2Array) {
    gl.compressedTexSubImage3D(
      target,
      0,
      desc.offsetX,
      desc.offsetY,
      desc.layer,
      desc.width,
      desc.height,
      1,
      internalFormat,
      view,
    );
    return;
  }
  gl.compressedTexSubImage2D(
    target,
    0,
    desc.offsetX,
    desc.offsetY,
    desc.width,
    desc.height,
    internalFormat,
    view,
  );
}

/**
 * 転送 1 回分の矩形を求める。圧縮書式は 4x4 ブロック単位に切り上げる。
 * 行をまたぐ範囲は呼び出し側で分ける。
 * @param format `TextureFormat` の値
 * @param offsetX 左端 (texel)
 * @param width 幅 (texel)
 * @returns 1 回で送るバイト数とブロック数
 */
export function transferBlockBytes(format: number, offsetX: number, width: number): number {
  const side = blockSide(format);
  const firstBlock = Math.floor(offsetX / side);
  const lastBlock = Math.ceil((offsetX + width) / side);
  return (lastBlock - firstBlock) * blockBytes(format);
}
