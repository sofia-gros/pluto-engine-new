/**
 * @file RHI の定数と記述子型 (docs/06-rhi.md §5・§5.1、`docs/02` §12)。
 * 値は WebGPU のenumと同じ並び順に揃えている。`src/rhi/webgpu/`・`src/rhi/webgl2/` の
 * 変換表はこの並びを前提にする。
 */
import type { RhiBindGroupLayout, RhiBuffer, RhiSampler, RhiTexture } from './device';
import type { ShaderSource } from './shader-source';

// ---------------------------------------------------------------- 定数 (§5)

/** バッファの用途。ビットフラグ。`MapRead` は他と併用できない。 */
export const BufferUsage = {
  Uniform: 1,
  Storage: 2,
  Indirect: 4,
  CopySrc: 8,
  CopyDst: 16,
  MapRead: 32,
} as const;

/** テクスチャのピクセル書式。10〜12 は圧縮形式で `caps.textureCompression*` が true のときのみ使える。 */
export const TextureFormat = {
  RGBA8Unorm: 0,
  BGRA8Unorm: 1,
  RGBA16Float: 2,
  RGBA32Float: 3,
  R32Float: 4,
  R32Uint: 5,
  RG32Float: 6,
  RGBA32Uint: 7,
  Depth24Plus: 8,
  Depth32Float: 9,
  BC7RGBAUnorm: 10,
  ETC2RGBA8Unorm: 11,
  ASTC4x4Unorm: 12,
} as const;

/** テクスチャの次元。ミップマップは使わないので配列形式のみ (`docs/06` §5)。 */
export const TextureDimension = { D2: 0, D2Array: 1 } as const;

/** 固定機能ブレンドの合成結果。ブレンド式はこの値から一意に決まる。 */
export const BlendMode = {
  Opaque: 0,
  Alpha: 1,
  PremultipliedAlpha: 2,
  Additive: 3,
  Multiply: 4,
  Screen: 5,
} as const;

/** 深度の比較関数。 */
export const CompareFunc = {
  Never: 0,
  Less: 1,
  LessEqual: 2,
  Greater: 3,
  GreaterEqual: 4,
  Equal: 5,
  NotEqual: 6,
  Always: 7,
} as const;

/** サンプラの補間。ミップマップを含まない。 */
export const FilterMode = { Nearest: 0, Linear: 1 } as const;

/** サンプラの座標 addressingモード。 */
export const AddressMode = { ClampToEdge: 0, Repeat: 1, MirrorRepeat: 2 } as const;

/** シェーダの実行ステージ。ビットフラグ。 */
export const ShaderStage = { Vertex: 1, Fragment: 2, Compute: 4 } as const;

/** バインディング 1 個の種類。レイアウトと `BindGroupEntryDesc.type` が一致すること。 */
export const BindingType = {
  UniformBuffer: 0,
  StorageBufferRead: 1,
  StorageBufferReadWrite: 2,
  Texture: 3,
  Sampler: 4,
  StorageTexture: 5,
} as const;

/** テクスチャの用途。ビットフラグ (2026-10-07 追記、`docs/12` D-21)。 */
export const TextureUsage = {
  CopySrc: 1,
  CopyDst: 2,
  TextureBinding: 4,
  RenderAttachment: 8,
  StorageBinding: 16,
} as const;

/** 三角形のカリング方向。 */
export const CullMode = { None: 0, Front: 1, Back: 2 } as const;

/** アタッチメントを読み込む際に消去するか。 */
export const LoadAction = { Clear: 0, Load: 1 } as const;

/** 書き込む色チャンネル。ビットフラグ。省略時は全チャンネル。 */

export const ColorWrite = { Red: 1, Green: 2, Blue: 4, Alpha: 8 } as const; // ビットフラグ

/**
 * スワップチェーンが使うテクスチャ書式。`bgra8unorm` に固定する (docs/06 §5 の注記)。
 * `navigator.gpu.getPreferredCanvasFormat()` には合わせない。
 */
export const SWAPCHAIN_FORMAT = TextureFormat.BGRA8Unorm;

/** WebGL2 でストレージバッファを代替するデータテクスチャの texel 数 (32KB/行)。 */
export const DATA_TEXTURE_WIDTH = 2048;

/** データテクスチャ 1 texel のバイト数 (`RGBA32UI` = 4 つの u32)。 */
export const DATA_TEXTURE_TEXEL_BYTES = 16;

// ------------------------------------------------------- 記述子型 (§5.1)

/** バッファ生成の記述子。 */
export interface BufferDesc {
  /** バイト数。1 以上。 */
  readonly sizeBytes: number;
  /** `BufferUsage` のビットフラグ。0 は不可。 */
  readonly usage: number;
  /** devtools とログ用の識別子。省略時は空文字列。 */
  readonly label?: string;
}

/** テクスチャ生成の記述子。ミップマップは持たない。 */
export interface TextureDesc {
  /** `TextureFormat` のいずれか。 */
  readonly format: number;
  /** 幅 (px)。1 以上。 */
  readonly width: number;
  /** 高さ (px)。1 以上。 */
  readonly height: number;
  /** `TextureDimension` のいずれか。既定 `D2`。 */
  readonly dimension?: number;
  /** レイヤー数。1 以上。`D2` のときは 1 のみ。 */
  readonly layers: number;
  /** `TextureUsage` のビットフラグ。0 は不可。 */
  readonly usage: number;
  /** devtools とログ用の識別子。省略時は空文字列。 */
  readonly label?: string;
}

/** サンプラ生成の記述子。ミップマップフィルタは無い。 */
export interface SamplerDesc {
  /** `FilterMode`。既定 `Nearest`。 */
  readonly filter?: number;
  /** 水平方向の `AddressMode`。既定 `ClampToEdge`。 */
  readonly addressModeU?: number;
  /** 垂直方向の `AddressMode`。既定 `ClampToEdge`。 */
  readonly addressModeV?: number;
}

/** バインドグループレイアウトの 1 エントリの記述子。 */
export interface BindGroupLayoutEntryDesc {
  /** `ShaderStage` のビットフラグ。 */
  readonly stage: number;
  /** `BindingType` のいずれか。 */
  readonly type: number;
}

/** バインドグループレイアウト生成の記述子。 */
export interface BindGroupLayoutDesc {
  /** エントリの並び。空でもよい。 */
  readonly entries: readonly BindGroupLayoutEntryDesc[];
}

/** バインドグループの 1 エントリの記述子。 */
export interface BindGroupEntryDesc {
  /** `BindingType`。レイアウトの同一位置のエントリと一致すること。 */
  readonly type: number;
  /** バッファ。`UniformBuffer` / `StorageBuffer` 系では必須。 */
  readonly buffer?: RhiBuffer;
  /** バッファ内の開始バイト。0 以外は 256 の倍数。 */
  readonly offsetBytes?: number; // buffer ありのとき。0 以外は caps の整列値の倍数 (§5.1.1)
  /** 使用するバイト数 (ストレージバッファのみ)。 */
  readonly sizeBytes?: number;
  /** テクスチャ。`Texture` / `StorageTexture` では必須。 */
  readonly texture?: RhiTexture;
  /** サンプラ。`Sampler` では必須。 */
  readonly sampler?: RhiSampler;
}

/** バインドグループ生成の記述子。 */
export interface BindGroupDesc {
  /** エントリ数と型が一致するレイアウト。 */
  readonly layout: RhiBindGroupLayout;
  /** 実リソースの並び。`layout.entries` と同じ要素数。 */
  readonly entries: readonly BindGroupEntryDesc[];
}

/** カラー描画先の記述子。 */
export interface ColorTargetDesc {
  /** `TextureFormat` のいずれか。 */
  readonly format: number;
  /** `BlendMode`。既定 `Opaque`。 */
  readonly blend?: number;
  /** `ColorWrite` のビットフラグ。省略時は全チャンネル。 */
  readonly writeMask?: number;
}

/** 深度とステンシルの記述子。 */
export interface DepthStencilDesc {
  /** `Depth24Plus` または `Depth32Float` のみ。 */
  readonly format: number;
  /** `CompareFunc` のいずれか。 */
  readonly compare: number;
  /** 深度を書き込むか。 */
  readonly writeEnabled: boolean;
}

/** レンダーパイプライン生成の記述子。頂点バッファは持たない (vertex pulling)。 */
export interface RenderPipelineDesc {
  /** 頂点シェーダ。WGSL のエントリポイントは `vs_main` 固定。 */
  readonly vertexShader: ShaderSource;
  /** フラグメントシェーダ。WGSL のエントリポイントは `fs_main` 固定。 */
  readonly fragmentShader: ShaderSource;
  /** バインドグループレイアウト。長さ 0〜4。添字が `RhiRenderPass.setBindGroup` の index に対応する。 */
  readonly layouts: readonly RhiBindGroupLayout[];
  /** カラー描画先。長さ 1〜2。 */
  readonly colorTargets: readonly ColorTargetDesc[];
  /** 深度とステンシル。指定しなければ深度を使わない。 */
  readonly depthStencil?: DepthStencilDesc;
  /** `CullMode`。既定 `None`。 */
  readonly cullMode?: number;
}

/** コンピュートパイプライン生成の記述子。 */
export interface ComputePipelineDesc {
  /** コンピュートシェーダ。WGSL のエントリポイントは `cs_` 接頭辞。 */
  readonly computeShader: ShaderSource;
  /** バインドグループレイアウト。長さ 0〜4。 */
  readonly layouts: readonly RhiBindGroupLayout[];
  /** ワークグループ size `[x, y, z]`。各 1 以上、積は 1024 以下。 */
  readonly workgroupSize: readonly [number, number, number];
}

/** writeTexture で書き込む領域。圧縮フォーマットは 4 の倍数に限る。 */
export interface TextureWriteDesc {
  /** 左端の texel 座標。0 以上。 */
  readonly offsetX: number;
  /** 上端の texel 座標。0 以上。 */
  readonly offsetY: number;
  /** レイヤー番号。0 以上。 */
  readonly layer: number;
  /** 幅 (texel)。1 以上。 */
  readonly width: number;
  /** 高さ (texel)。1 以上。 */
  readonly height: number;
}

/** カラーアタッチメントの記述子。 */
export interface ColorAttachmentDesc {
  /** 描画先テクスチャ。`usage` に `RenderAttachment` が立っていること。 */
  readonly view: RhiTexture;
  /** 開始時に消去するか。 */
  readonly load: number;
  /** 終了時に内容を残すか。 */
  readonly store: boolean;
  /** 消去色 (0〜1)。`load === LoadAction.Clear` のとき必須。 */
  readonly clearColor?: readonly [number, number, number, number];
}

/** レンダーパス開始の記述子。 */
export interface RenderPassDesc {
  /** カラーアタッチメント。長さ 1〜2。 */
  readonly colorAttachments: readonly ColorAttachmentDesc[];
  /** 深度アタッチメント。指定しなければ深度を使わない。 */
  readonly depthStencil?: {
    /** 深度テクスチャ。 */
    readonly view: RhiTexture;
    /** 開始時に消去するか。 */
    readonly load: number;
    /** 終了時に内容を残すか。 */
    readonly store: boolean;
    /** 消去深度 (0〜1)。`load === LoadAction.Clear` のとき必須。 */
    readonly clearDepth?: number;
  };
}
