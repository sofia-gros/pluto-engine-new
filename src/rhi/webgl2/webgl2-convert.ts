/**
 * @file RHI 定数から GL 定数への変換表 (docs/06-rhi.md §5・§7、`docs/02` §12)。
 * GL の定数は仕様固定値なので数値で持つ。ブラウザの `gl` オブジェクトを使わず、
 * Node での単体検証でも読み込めるようにする (T-3.2 と同じ方針)。
 */
import { ErrorCode, PlutoError } from '../../core/debug';
import type { RhiCapabilities } from '../capabilities';
import {
  AddressMode,
  BlendMode,
  ColorWrite,
  CullMode,
  FilterMode,
  TextureDimension,
  TextureFormat,
  type RenderPipelineDesc,
} from '../types';

/** バッファの結び付け先。仕様固定値。 */
const GL_TARGETS = {
  UNIFORM_BUFFER: 0x8a11,
  COPY_READ_BUFFER: 0x8f36,
  COPY_WRITE_BUFFER: 0x8f37,
} as const;

/** バッファの用途ヒント。仕様固定値。 */
const GL_HINTS = {
  DYNAMIC_DRAW: 0x88e8,
  STREAM_READ: 0x88e1,
} as const;

/** テクスチャの対象。仕様固定値。 */
const GL_TEXTURE_TARGETS = {
  TEXTURE_2D: 0x0de1,
  TEXTURE_2D_ARRAY: 0x8c1a,
} as const;

/** サンプラの補間。仕様固定値。 */
const GL_FILTERS = { NEAREST: 0x2600, LINEAR: 0x2601 } as const;

/** サンプラの包み。仕様固定値。 */
const GL_WRAPS = {
  CLAMP_TO_EDGE: 0x812f,
  REPEAT: 0x2901,
  MIRRORED_REPEAT: 0x8370,
} as const;

/** 深度比較関数。RHI の `CompareFunc` 値順に並べる (GL 順とは異なる)。 */
const GL_COMPARE_FUNCS: readonly number[] = [
  0x0200, 0x0201, 0x0203, 0x0204, 0x0206, 0x0202, 0x0205, 0x0207,
];

/** カリングの面。仕様固定値。 */
const GL_FACES = { FRONT: 0x0404, BACK: 0x0405 } as const;

/** ブレンド係数。仕様固定値。 */
const GL_BLEND_FACTORS = {
  ZERO: 0,
  ONE: 1,
  SRC_ALPHA: 0x0302,
  ONE_MINUS_SRC_ALPHA: 0x0303,
  DST_COLOR: 0x0306,
  ONE_MINUS_DST_COLOR: 0x0307,
} as const;

/** 消去マスク。仕様固定値。 */
const GL_CLEAR_MASKS = { COLOR_BUFFER_BIT: 0x4000, DEPTH_BUFFER_BIT: 0x0100 } as const;

/**
 * `BufferUsage` からバッファの結び付け先を求める。
 * Uniform は UBO、それ以外はコピー書き込みの対象にする。Storage の実体は
 * データテクスチャなので、この値を使うことは無い (docs/06 §7)。
 * @param usage RHI の用途ビット
 * @returns GL の結び付け先
 */
export function toBufferTarget(usage: number): number {
  if ((usage & 1) !== 0) return GL_TARGETS.UNIFORM_BUFFER;
  return GL_TARGETS.COPY_WRITE_BUFFER;
}

/**
 * `BufferUsage` から用途ヒントを求める。読み戻しだけ `STREAM_READ` にする。
 * @param usage RHI の用途ビット
 * @returns GL の用途ヒント
 */
export function toBufferHint(usage: number): number {
  if ((usage & 32) !== 0) return GL_HINTS.STREAM_READ;
  return GL_HINTS.DYNAMIC_DRAW;
}

/** テクスチャ転送の 3 値。 */
export interface GlTextureFormatInfo {
  /** sized 内部形式。 */
  readonly internalFormat: number;
  /** 画素形式。 */
  readonly format: number;
  /** 画素の型。 */
  readonly type: number;
}

/** `TextureFormat` を転送の 3 値に変換する表。1 行が `[内部形式, 画素形式, 画素の型]`。 */
const TEXTURE_FORMATS: readonly (readonly [number, number, number])[] = [
  [0x8058, 0x1908, 0x1401],
  [0x8058, 0x1908, 0x1401],
  [0x881a, 0x1908, 0x140b],
  [0x8814, 0x1908, 0x1406],
  [0x822e, 0x1903, 0x1406],
  [0x8236, 0x8d95, 0x1405],
  [0x8230, 0x8227, 0x1406],
  [0x8d70, 0x8d8e, 0x1405],
  [0x81a6, 0x1902, 0x1405],
  [0x8cac, 0x1902, 0x1406],
  [0x8e8c, 0x1908, 0x1401],
  [0x9278, 0x1908, 0x1401],
  [0x93b0, 0x1908, 0x1401],
];

/**
 * `TextureFormat` を転送の 3 値に変換する。
 * BGRA8 は GL に相当する sized 形式が無いので RGBA8 として扱う。
 * @param format RHI の書式
 * @returns GL の転送の 3 値
 */
export function toTextureFormatInfo(format: number): GlTextureFormatInfo {
  const entry = TEXTURE_FORMATS[format];
  return { internalFormat: entry[0], format: entry[1], type: entry[2] };
}

/**
 * `TextureDimension` を GL の対象に変換する。
 * @param dimension RHI の次元
 * @returns GL の対象
 */
export function toTextureTarget(dimension: number): number {
  return dimension === TextureDimension.D2Array
    ? GL_TEXTURE_TARGETS.TEXTURE_2D_ARRAY
    : GL_TEXTURE_TARGETS.TEXTURE_2D;
}

/** `FilterMode` を GL の補間に変換する。 */
export function toFilterMode(filter: number): number {
  return filter === FilterMode.Linear ? GL_FILTERS.LINEAR : GL_FILTERS.NEAREST;
}

/** `AddressMode` を GL の包みに変換する。 */
export function toAddressMode(mode: number): number {
  if (mode === AddressMode.Repeat) return GL_WRAPS.REPEAT;
  if (mode === AddressMode.MirrorRepeat) return GL_WRAPS.MIRRORED_REPEAT;
  return GL_WRAPS.CLAMP_TO_EDGE;
}

/**
 * `CompareFunc` を GL の深度比較関数に変換する。
 * @param func RHI の比較関数
 * @returns GL の比較関数
 */
export function toCompareFunc(func: number): number {
  return GL_COMPARE_FUNCS[func];
}

/** カリングの設定。 */
export interface GlCullFace {
  /** 有効にするか。無効なら面の値は使わない。 */
  readonly enable: boolean;
  /** 刈る面。 */
  readonly face: number;
}

/**
 * `CullMode` を GL のカリング設定に変換する。
 * @param mode RHI のカリング
 * @returns GL のカリング設定
 */
export function toCullFace(mode: number): GlCullFace {
  if (mode === CullMode.Front) return { enable: true, face: GL_FACES.FRONT };
  if (mode === CullMode.Back) return { enable: true, face: GL_FACES.BACK };
  return { enable: false, face: GL_FACES.BACK };
}

/**
 * `ColorWrite` のビットフラグを `gl.colorMask` の 4 値に変換する。
 * @param mask RHI の書き込みチャンネルビット
 * @returns 赤・緑・青・透過の順の真偽値
 */
export function toColorMask(mask: number): readonly [boolean, boolean, boolean, boolean] {
  return [
    (mask & ColorWrite.Red) !== 0,
    (mask & ColorWrite.Green) !== 0,
    (mask & ColorWrite.Blue) !== 0,
    (mask & ColorWrite.Alpha) !== 0,
  ];
}

/**
 * 消去マスクを求める。`gl.clear` に渡す。
 * @param clearColor 色を消すか
 * @param clearDepth 深度を消すか
 * @returns GL の消去マスク
 */
export function toClearMask(clearColor: boolean, clearDepth: boolean): number {
  let out = 0;
  if (clearColor) out |= GL_CLEAR_MASKS.COLOR_BUFFER_BIT;
  if (clearDepth) out |= GL_CLEAR_MASKS.DEPTH_BUFFER_BIT;
  return out;
}

/** ブレンド係数の 4 値。`gl.blendFuncSeparate` に渡す。 */
export interface GlBlendFactors {
  /** 元の色の係数。 */
  readonly srcRGB: number;
  /** 先の色の係数。 */
  readonly dstRGB: number;
  /** 元の透過の係数。 */
  readonly srcAlpha: number;
  /** 先の透過の係数。 */
  readonly dstAlpha: number;
}

/**
 * `BlendMode` をブレンド係数の 4 値に変換する。
 * WebGPU 版 (`webgpu-convert.ts` の `BLEND`) と同じ合成結果になる組み合わせ。
 * @param mode RHI のブレンド
 * @returns GL のブレンド係数
 */
export function toBlendFactors(mode: number): GlBlendFactors {
  const F = GL_BLEND_FACTORS;
  const alpha = { srcAlpha: F.ONE, dstAlpha: F.ONE_MINUS_SRC_ALPHA };
  if (mode === BlendMode.Alpha) {
    return { srcRGB: F.SRC_ALPHA, dstRGB: F.ONE_MINUS_SRC_ALPHA, ...alpha };
  }
  if (mode === BlendMode.PremultipliedAlpha) {
    return { srcRGB: F.ONE, dstRGB: F.ONE_MINUS_SRC_ALPHA, ...alpha };
  }
  if (mode === BlendMode.Additive) {
    return { srcRGB: F.SRC_ALPHA, dstRGB: F.ONE, srcAlpha: F.ONE, dstAlpha: F.ONE };
  }
  if (mode === BlendMode.Multiply) {
    return { srcRGB: F.DST_COLOR, dstRGB: F.ZERO, ...alpha };
  }
  if (mode === BlendMode.Screen) {
    return { srcRGB: F.ONE_MINUS_DST_COLOR, dstRGB: F.ONE, ...alpha };
  }
  return { srcRGB: F.ONE, dstRGB: F.ZERO, srcAlpha: F.ONE, dstAlpha: F.ZERO };
}

/**
 * `TextureFormat` が 4x4 ブロックの圧縮書式かどうか。
 * @param format RHI の書式
 * @returns 圧縮書式なら true
 */
export function isCompressedFormat(format: number): boolean {
  return format >= TextureFormat.BC7RGBAUnorm;
}

/**
 * 圧縮書式の 1 ブロックが辺に占める texel 数。
 * @param format RHI の書式
 * @returns 圧縮書式は 4、それ以外は 1
 */
export function blockSide(format: number): number {
  return isCompressedFormat(format) ? 4 : 1;
}

/**
 * 1 ブロックが占めるバイト数。
 * @param format RHI の書式
 * @returns バイト数
 */
export function blockBytes(format: number): number {
  if (format === TextureFormat.BC7RGBAUnorm) return 16;
  if (format === TextureFormat.ETC2RGBA8Unorm) return 8;
  if (format === TextureFormat.ASTC4x4Unorm) return 16;
  return 4;
}

/**
 * 整数テクスチャかどうか。整数書式に線形補間のサンプラを合わせると
 * 描画時に失敗する。圧縮 3 形式は正規化形式で線形補間できるため含めない。
 * 32 ビット浮動小数の線形補間は拡張 (`OES_texture_float_linear`) が要るが、
 * caps には出さず T-3.4 で扱う。
 * @param format `TextureFormat` の値
 * @returns 整数書式なら true
 */
export function isIntegerFormat(format: number): boolean {
  return format === TextureFormat.R32Uint || format === TextureFormat.RGBA32Uint;
}

/** 拡張の名前。`COLOR_BUFFER_FLOAT` が無いとデバイスを作れない (docs/06 §2)。 */
export const EXT = {
  COLOR_BUFFER_FLOAT: 'EXT_color_buffer_float',
  FLOAT_BLEND: 'EXT_float_blend',
  BC7: 'EXT_texture_compression_bptc',
  ETC2: 'WEBGL_compressed_texture_etc',
  ASTC: 'WEBGL_compressed_texture_astc',
  TIMER_QUERY: 'EXT_disjoint_timer_query_webgl2',
} as const;

/**
 * コンテキストから `RhiCapabilities` を作り出す。
 * 必須拡張が無いときは例外を投げる。
 * @param gl GL コンテキスト
 * @returns RHI の能力
 */
export function buildCapabilities(gl: WebGL2RenderingContext): RhiCapabilities {
  if (gl.getExtension(EXT.COLOR_BUFFER_FLOAT) === null) {
    throw new PlutoError(
      ErrorCode.GpuUnavailable,
      'このデバイスは浮動小数点の描画先に対応していません',
    );
  }
  const maxSize = gl.getParameter(0x0d33) as number;
  return {
    backend: 'webgl2',
    compute: false,
    indirectDraw: false,
    storageBuffers: false,
    timestampQuery: gl.getExtension(EXT.TIMER_QUERY) !== null,
    floatRenderTarget: true,
    floatBlend: gl.getExtension(EXT.FLOAT_BLEND) !== null,
    maxTextureSize: maxSize,
    maxTextureArrayLayers: gl.getParameter(0x88ff) as number,
    maxStorageBufferBytes: 2048 * maxSize * 16,
    maxComputeWorkgroupSize: 0,
    maxComputeInvocationsPerWorkgroup: 0,
    minUniformBufferOffsetAlignment: 256,
    minStorageBufferOffsetAlignment: 256,
    textureCompressionBC7: gl.getExtension(EXT.BC7) !== null,
    textureCompressionETC2: gl.getExtension(EXT.ETC2) !== null,
    textureCompressionASTC: gl.getExtension(EXT.ASTC) !== null,
  };
}

/** パイプライン生成時に決まる固定機能の状態。 */
export interface WebGlPipelineState {
  /** ブレンドを使うか。 */
  readonly blendEnabled: boolean;
  /** ブレンド係数。 */
  readonly blendSrcRGB: number;
  /** ブレンド係数。 */
  readonly blendDstRGB: number;
  /** ブレンド係数。 */
  readonly blendSrcAlpha: number;
  /** ブレンド係数。 */
  readonly blendDstAlpha: number;
  /** カリングを使うか。 */
  readonly cullEnabled: boolean;
  /** 刈る面。 */
  readonly cullFace: number;
  /** 深度試験を使うか。 */
  readonly depthEnabled: boolean;
  /** 深度比較関数。 */
  readonly depthFunc: number;
  /** 深度を書き込むか。 */
  readonly depthWrite: boolean;
  /** 書き込む色要素。 */
  readonly writeMask: readonly [boolean, boolean, boolean, boolean];
}

/**
 * 固定機能の状態を記述子から決める。描画先が 2 個で合成が違う場合は作れない。
 * GL ES 3.0 のブレンドは全体で 1 種類しか持てないため。
 * @param desc RHI の記述子
 * @returns 固定機能の状態
 */
export function buildPipelineState(desc: RenderPipelineDesc): WebGlPipelineState {
  const first = desc.colorTargets[0];
  for (const t of desc.colorTargets) {
    if ((t.blend ?? 0) !== (first.blend ?? 0) || (t.writeMask ?? 15) !== (first.writeMask ?? 15)) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        '描画先が 2 個で合成が違う場合は WebGL2 で作れません',
      );
    }
  }
  const blend = first.blend ?? BlendMode.Opaque;
  const factors = toBlendFactors(blend);
  const cull = toCullFace(desc.cullMode ?? CullMode.None);
  const depth = desc.depthStencil;
  return {
    blendEnabled: blend !== BlendMode.Opaque,
    blendSrcRGB: factors.srcRGB,
    blendDstRGB: factors.dstRGB,
    blendSrcAlpha: factors.srcAlpha,
    blendDstAlpha: factors.dstAlpha,
    cullEnabled: cull.enable,
    cullFace: cull.face,
    depthEnabled: depth !== undefined,
    depthFunc: depth === undefined ? 0 : toCompareFunc(depth.compare),
    depthWrite: depth?.writeEnabled ?? false,
    writeMask: toColorMask(first.writeMask ?? 15),
  };
}
