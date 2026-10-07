# 06. RHI (Render Hardware Interface) 仕様

## 1. 方針

- RHI は **WebGPU のモデルに寄せた薄い抽象**。WebGL2 側がそれをエミュレートする。
- 上位層 (`compute`, `render`, `sim` ...) は `RhiDevice` インターフェースだけを使う。`GPUDevice` や `WebGL2RenderingContext` に直接触れてはならない。
- **能力差は隠さない**: `RhiCapabilities` で公開し、上位層は初期化時に 1 回だけ分岐する。WebGL2 で compute を「なんとなく」エミュレートすることはしない。

## 2. デバイス生成 (`src/rhi/create-device.ts`)

```ts
export interface CreateDeviceOptions {
  canvas: HTMLCanvasElement | OffscreenCanvas;
  backend?: 'auto' | 'webgpu' | 'webgl2'; // デフォルト 'auto'
  powerPreference?: 'high-performance' | 'low-power'; // デフォルト 'high-performance'
  antialias?: boolean; // デフォルト false
}
export async function createDevice(opts: CreateDeviceOptions): Promise<RhiDevice>;
```

`auto` の手順:

1. `navigator.gpu` が存在 → `requestAdapter({ powerPreference })` → 成功なら `requestDevice({ requiredFeatures: 利用可能なら ['timestamp-query', 'indirect-first-instance', 'texture-compression-bc', 'texture-compression-etc2', 'texture-compression-astc'], requiredLimits: { maxStorageBufferBindingSize: adapter.limits の最大, maxBufferSize: 同 } })`
2. 1 が失敗 (例外・null) → `canvas.getContext('webgl2', { antialias, alpha: false, depth: true, stencil: false, powerPreference, preserveDrawingBuffer: false })` → 必須拡張 `EXT_color_buffer_float` を確認。任意拡張 `EXT_float_blend`, `EXT_texture_compression_bptc` (BC7), `WEBGL_compressed_texture_etc` (ETC2), `WEBGL_compressed_texture_astc` (ASTC) を有効化を試みる
3. 両方失敗 → `PlutoError(GpuUnavailable, ...)`

失敗理由は `logger.info` で必ず記録する。

## 3. 能力 (`src/rhi/capabilities.ts`)

```ts
export interface RhiCapabilities {
  readonly backend: 'webgpu' | 'webgl2';
  readonly compute: boolean; // WebGPU: true / WebGL2: false
  readonly indirectDraw: boolean; // WebGPU: true / WebGL2: false
  readonly storageBuffers: boolean; // WebGPU: true / WebGL2: false (データテクスチャで読み取り専用エミュレート)
  readonly timestampQuery: boolean;
  readonly floatRenderTarget: boolean; // WebGL2: EXT_color_buffer_float
  readonly floatBlend: boolean; // WebGL2: EXT_float_blend
  readonly maxTextureSize: number;
  readonly maxTextureArrayLayers: number;
  readonly maxStorageBufferBytes: number; // WebGL2: データテクスチャの上限から算出
  readonly maxComputeWorkgroupSize: number; // WebGL2: 0
  readonly textureCompressionBC7: boolean; // WebGPU: 'texture-compression-bc' / WebGL2: EXT_texture_compression_bptc
  readonly textureCompressionETC2: boolean; // WebGPU: 'texture-compression-etc2' / WebGL2: WEBGL_compressed_texture_etc
  readonly textureCompressionASTC: boolean; // WebGPU: 'texture-compression-astc' / WebGL2: WEBGL_compressed_texture_astc (4x4 LDR)
}
```

## 4. インターフェース (`src/rhi/device.ts`)

```ts
export interface RhiDevice {
  readonly caps: RhiCapabilities;
  createBuffer(desc: BufferDesc): RhiBuffer;
  createTexture(desc: TextureDesc): RhiTexture;
  createSampler(desc: SamplerDesc): RhiSampler;
  createBindGroupLayout(desc: BindGroupLayoutDesc): RhiBindGroupLayout;
  createBindGroup(desc: BindGroupDesc): RhiBindGroup;
  createRenderPipeline(desc: RenderPipelineDesc): RhiRenderPipeline;
  createComputePipeline(desc: ComputePipelineDesc): RhiComputePipeline; // caps.compute=false なら PlutoError(UnsupportedFeature)
  createQuerySet(count: number): RhiQuerySet | null; // caps.timestampQuery=false なら null。devtools 専用
  writeBuffer(
    buf: RhiBuffer,
    dstOffsetBytes: number,
    data: ArrayBufferView,
    srcOffsetElements?: number,
    sizeElements?: number,
  ): void;
  writeTexture(tex: RhiTexture, desc: TextureWriteDesc, data: ArrayBufferView | ImageBitmap): void;
  readBufferAsync(buf: RhiBuffer, offsetBytes: number, sizeBytes: number): Promise<ArrayBuffer>; // コールドパス・テスト専用
  createCommandEncoder(): RhiCommandEncoder;
  submit(encoder: RhiCommandEncoder): void;
  getCurrentTexture(): RhiTexture; // スワップチェーン
  resize(width: number, height: number): void;
  readonly onDeviceLost: EventEmitter<{ lost: { reason: string } }>;
  destroy(): void;
}

export interface RhiCommandEncoder {
  beginRenderPass(desc: RenderPassDesc): RhiRenderPass;
  beginComputePass(): RhiComputePass;
  copyBufferToBuffer(
    src: RhiBuffer,
    srcOffset: number,
    dst: RhiBuffer,
    dstOffset: number,
    size: number,
  ): void;
  clearBuffer(buf: RhiBuffer, offset?: number, size?: number): void;
  writeTimestamp?(querySet: RhiQuerySet, index: number): void;
}

export interface RhiRenderPass {
  setPipeline(p: RhiRenderPipeline): void;
  setBindGroup(index: 0 | 1 | 2 | 3, g: RhiBindGroup): void;
  setViewport(x: number, y: number, w: number, h: number): void;
  setScissor(x: number, y: number, w: number, h: number): void;
  draw(
    vertexCount: number,
    instanceCount: number,
    firstVertex?: number,
    firstInstance?: number,
  ): void;
  drawIndirect(args: RhiBuffer, offsetBytes: number): void; // caps.indirectDraw=false なら assert 失敗
  end(): void;
}

export interface RhiComputePass {
  setPipeline(p: RhiComputePipeline): void;
  setBindGroup(index: 0 | 1 | 2 | 3, g: RhiBindGroup): void;
  dispatch(x: number, y?: number, z?: number): void;
  dispatchIndirect(args: RhiBuffer, offsetBytes: number): void;
  end(): void;
}
```

### 4.1 リソースインターフェース (2026-10-07 追記, D-21)

上記が参照する GPU リソースのインターフェースも `src/rhi/device.ts` に置く。第四章の `RhiDevice` と同じファイルにまとめて定義する (docs/02 §12)。

```ts
export interface RhiBuffer {
  readonly label: string;
  readonly sizeBytes: number;
  readonly usage: number;
  destroy(): void;
}

export interface RhiTexture {
  readonly label: string;
  readonly format: number; // TextureFormat
  readonly width: number;
  readonly height: number;
  readonly dimension: number; // TextureDimension
  readonly layers: number;
  readonly usage: number; // TextureUsage のビットフラグ
  destroy(): void;
}

export interface RhiSampler {
  destroy(): void;
}

export interface RhiBindGroupLayout {
  readonly entries: readonly BindGroupLayoutEntryDesc[];
  destroy(): void;
}

export interface RhiBindGroup {
  readonly layout: RhiBindGroupLayout;
  destroy(): void;
}

export interface RhiRenderPipeline {
  readonly label: string;
  destroy(): void;
}

export interface RhiComputePipeline {
  readonly label: string;
  readonly workgroupSize: readonly [number, number, number];
  destroy(): void;
}

export interface RhiQuerySet {
  readonly count: number;
  destroy(): void;
}
```

- `label` は devtools とログ用の識別子で、挙動には影響しない。`create*` の `label` を省略した場合は空文字列にする。
- `destroy()` は **2 回呼んでも安全** (2 回目は何もしない)。破棄後に残った参照を使った場合は `__DEBUG__` で `PlutoError(InvalidState)` (docs/09 §A5)。
- **`RhiBindGroupLayout` と `RhiQuerySet` は docs/02 §12 の表に 2026-10-07 で追記した。** それまでは `device.ts` の責務一覧に無かった。

- **頂点バッファ・インデックスバッファの API は持たない** (vertex pulling 方針)。四角形は `draw(6, instanceCount)` で `vertex_index` から生成する。
- エンコーダ・パスオブジェクトは **フレーム毎に新規生成しない** 実装にする (WebGPU 側は内部で `GPUCommandEncoder` を作るが、ラッパーオブジェクトはプールで再利用)。

## 5. 定数 (`src/rhi/types.ts`)

```ts
export const BufferUsage = {
  Uniform: 1,
  Storage: 2,
  Indirect: 4,
  CopySrc: 8,
  CopyDst: 16,
  MapRead: 32,
} as const; // ビットフラグ
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
  BC7RGBAUnorm: 10, // caps.textureCompressionBC7 が true のときのみ
  ETC2RGBA8Unorm: 11, // caps.textureCompressionETC2 が true のときのみ
  ASTC4x4Unorm: 12, // caps.textureCompressionASTC が true のときのみ
} as const;
export const TextureDimension = { D2: 0, D2Array: 1 } as const;
export const BlendMode = {
  Opaque: 0,
  Alpha: 1,
  PremultipliedAlpha: 2,
  Additive: 3,
  Multiply: 4,
  Screen: 5,
} as const;
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
export const FilterMode = { Nearest: 0, Linear: 1 } as const;
export const AddressMode = { ClampToEdge: 0, Repeat: 1, MirrorRepeat: 2 } as const;
export const ShaderStage = { Vertex: 1, Fragment: 2, Compute: 4 } as const;
export const BindingType = {
  UniformBuffer: 0,
  StorageBufferRead: 1,
  StorageBufferReadWrite: 2,
  Texture: 3,
  Sampler: 4,
  StorageTexture: 5,
} as const;
export const TextureUsage = {
  CopySrc: 1,
  CopyDst: 2,
  TextureBinding: 4,
  RenderAttachment: 8,
  StorageBinding: 16,
} as const; // ビットフラグ
export const CullMode = { None: 0, Front: 1, Back: 2 } as const;
export const LoadAction = { Clear: 0, Load: 1 } as const;
export const ColorWrite = { Red: 1, Green: 2, Blue: 4, Alpha: 8 } as const; // ビットフラグ
```

- 圧縮フォーマット (10〜12) は **サンプル専用** (レンダーターゲット・ストレージ不可)。`writeTexture` には 4×4 ブロック単位のバイト列を渡し、幅・高さ・オフセットは 4 の倍数でなければならない (違反は `PlutoError(InvalidArgument)`)。非対応デバイスで生成すると `PlutoError(UnsupportedFeature)`。
- **`TextureUsage` と `ColorWrite` は 2026-10-07 追記 (D-21)。** 当初は `BufferUsage` しか定数が無く、`TextureDesc` の用途ビットを表すものが定義されていなかった。WebGPU の `GPUTextureUsage` と同じ 5 種をビットフラグで持つ。`BindingType.Texture` は `TextureUsage.TextureBinding`、`BindingType.StorageTexture` は `TextureUsage.StorageBinding` を要求する。
- `BlendMode` は **固定機能ブレンドの合成結果**だけで表現する (WebGL2 の固定機能と同じ)。`ColorWrite` で個別チャンネルの有効・無効を指定できるが、ブレンド式そのものは `BlendMode` から一意に決まる。
- ミップマップは **使わない** (`mipLevelCount` は無い)。KTX2 もレベル 0 のみ (docs/07 §アトラス)。

## 5.1 記述子型 (`src/rhi/types.ts`)

> [!NOTE]
> **この節は 2026-10-07 に追記した (D-21)。** 第四章の `RhiDevice` が参照する記述子型 10 個と `RhiQuerySet` の定義が本文に無かったため、第一章の方針「WebGPU のモデルに寄せた薄い抽象」に沿って確定した。

すべての `Desc` は **読み取り専用** とする。実装は `create*` の呼び出し時に内容を検証し、違反は §5.1.1 の表のとおりです。

```ts
export interface BufferDesc {
  readonly sizeBytes: number; // 1 以上
  readonly usage: number; // BufferUsage のビットフラグ。0 は不可
  readonly label?: string;
}

export interface TextureDesc {
  readonly format: number; // TextureFormat
  readonly width: number; // 1 以上
  readonly height: number; // 1 以上
  readonly dimension: number; // TextureDimension (既定 D2)
  readonly layers: number; // 1 以上。D2 のときは 1 のみ
  readonly usage: number; // TextureUsage のビットフラグ。0 は不可
  readonly label?: string;
}

export interface SamplerDesc {
  readonly filter: number; // FilterMode (既定 Nearest)
  readonly addressModeU: number; // AddressMode (既定 ClampToEdge)
  readonly addressModeV: number; // AddressMode (既定 ClampToEdge)
}

export interface BindGroupLayoutEntryDesc {
  readonly stage: number; // ShaderStage のビットフラグ
  readonly type: number; // BindingType
}

export interface BindGroupLayoutDesc {
  readonly entries: readonly BindGroupLayoutEntryDesc[]; // 0 個 (空レイアウト) も可
}

export interface BindGroupEntryDesc {
  readonly type: number; // BindingType。layout の対応エントリと一致すること
  readonly buffer?: RhiBuffer; // UniformBuffer / StorageBuffer のとき必須
  readonly offsetBytes?: number; // buffer ありのとき。0 以外は 256 の倍数
  readonly sizeBytes?: number; // buffer ありのとき (Storage のみ)
  readonly texture?: RhiTexture; // Texture / StorageTexture のとき必須
  readonly sampler?: RhiSampler; // Sampler のとき必須
}

export interface BindGroupDesc {
  readonly layout: RhiBindGroupLayout;
  readonly entries: readonly BindGroupEntryDesc[]; // layout と同じ要素数
}

export interface ColorTargetDesc {
  readonly format: number; // TextureFormat
  readonly blend: number; // BlendMode (既定 Opaque)
  readonly writeMask?: number; // ColorWrite のビットフラグ (既定は全て)
}

export interface DepthStencilDesc {
  readonly format: number; // TextureFormat (Depth24Plus / Depth32Float のみ)
  readonly compare: number; // CompareFunc
  readonly writeEnabled: boolean;
}

export interface RenderPipelineDesc {
  readonly vertexShader: ShaderSource;
  readonly fragmentShader: ShaderSource;
  readonly layouts: readonly RhiBindGroupLayout[]; // 長さ 0〜4。index と setBindGroup が対応
  readonly colorTargets: readonly ColorTargetDesc[]; // 長さ 1〜2
  readonly depthStencil?: DepthStencilDesc;
  readonly cullMode?: number; // CullMode (既定 None)
}

export interface ComputePipelineDesc {
  readonly computeShader: ShaderSource;
  readonly layouts: readonly RhiBindGroupLayout[]; // 長さ 0〜4
  readonly workgroupSize: readonly [number, number, number]; // [x, y, z]
}

export interface TextureWriteDesc {
  readonly offsetX: number; // 0 以上
  readonly offsetY: number; // 0 以上
  readonly layer: number; // 0 以上。layers 未満
  readonly width: number; // 1 以上
  readonly height: number; // 1 以上
}

export interface ColorAttachmentDesc {
  readonly view: RhiTexture; // usage に RenderAttachment が立っていること
  readonly load: number; // LoadAction
  readonly store: boolean;
  readonly clearColor?: readonly [number, number, number, number]; // load=Clear のとき必須
}

export interface RenderPassDesc {
  readonly colorAttachments: readonly ColorAttachmentDesc[]; // 長さ 1〜2
  readonly depthStencil?: {
    readonly view: RhiTexture;
    readonly load: number; // LoadAction
    readonly store: boolean;
    readonly clearDepth?: number; // load=Clear のとき必須
  };
}
```

### 5.1.1 検証規則

`create*` は **同期的に** 検証し、違反は次の例外を送出する。バックエンドの実装差で検査を省略してはならない。

| 条件                                                                      | エラー                           |
| ------------------------------------------------------------------------- | -------------------------------- |
| `BufferDesc.sizeBytes` が 1 未満                                          | `PlutoError(InvalidArgument)`    |
| `BufferDesc.usage` が 0                                                   | `PlutoError(InvalidArgument)`    |
| `BufferUsage.MapRead` と他のビットを同時に指定                            | `PlutoError(InvalidArgument)`    |
| `TextureDesc.width` / `height` が 1 未満、または `usage` が 0             | `PlutoError(InvalidArgument)`    |
| `dimension === D2` かつ `layers !== 1`                                    | `PlutoError(InvalidArgument)`    |
| 圧縮フォーマット (10〜12) に `RenderAttachment` / `StorageBinding` を指定 | `PlutoError(InvalidArgument)`    |
| 圧縮フォーマットを非対応デバイスで指定                                    | `PlutoError(UnsupportedFeature)` |
| `BindGroupEntryDesc.type` が layout の対応エントリと異なる                | `PlutoError(InvalidArgument)`    |
| `offsetBytes !== 0` かつ 256 の倍数でない                                 | `PlutoError(InvalidArgument)`    |
| `layouts` の長さが 4 を超える                                             | `PlutoError(InvalidArgument)`    |
| `colorTargets` の長さが 0 または 3 以上                                   | `PlutoError(InvalidArgument)`    |
| `DepthStencilDesc.format` が `Depth24Plus` / `Depth32Float` 以外          | `PlutoError(InvalidArgument)`    |
| `workgroupSize` のいずれかが 1 未満、または積が 1024 超                   | `PlutoError(InvalidArgument)`    |
| `load === LoadAction.Clear` なのに `clearColor` / `clearDepth` が無い     | `PlutoError(InvalidArgument)`    |
| `TextureWriteDesc` の範囲がテクスチャの寸法・layer を超える               | `PlutoError(InvalidArgument)`    |
| `ColorAttachmentDesc.view` の `usage` に `RenderAttachment` が無い        | `PlutoError(InvalidArgument)`    |
| `caps.compute === false` のデバイスで `createComputePipeline`             | `PlutoError(UnsupportedFeature)` |
| `caps.timestampQuery === false` のデバイスで `createQuerySet`             | 例外ではなく `null` (§4 の通り)  |

## 6. シェーダソース (`src/rhi/shader-source.ts`)

```ts
export interface ShaderSource {
  readonly name: string;
  readonly wgsl?: string; // WebGPU 用 (render: vs_main/fs_main, compute: cs_main)
  readonly glslVertex?: string; // WebGL2 用
  readonly glslFragment?: string; // WebGL2 用
}
```

- WGSL のエントリポイント名は **固定**: 頂点 `vs_main`、フラグメント `fs_main`、コンピュート `cs_main` (複数ある場合は `cs_` 接頭辞 + 名前、例 `cs_count`)。

## 7. WebGL2 エミュレーション規則

| WebGPU 概念               | WebGL2 実装                                                                                                                                                               |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BindGroup index 0〜3      | バインディング番号 → `uniform` ブロック binding / テクスチャユニットへの固定割当表 (パイプライン生成時に名前で解決)                                                       |
| Uniform buffer            | UBO (`std140`)。WGSL 側も std140 互換レイアウトで書く (vec3 禁止、vec4 に詰める)                                                                                          |
| Storage buffer (読み取り) | `RGBA32UI` テクスチャ、幅 `DATA_TEXTURE_WIDTH = 2048` texel (= 32KB/行)。1 texel = 16 バイト。GLSL では `storage-emulation.glsl` の `pluto_fetch(tex, texelIndex)` で読む |
| Storage buffer (書き込み) | **非対応**。GPGPU はレンダーターゲット (`RGBA32F` テクスチャ) への fragment 出力で行う (`compute/gpgpu-pass.ts`)                                                          |
| Indirect draw             | 非対応。CPU 側でインスタンス数を決める                                                                                                                                    |
| Compute                   | 非対応                                                                                                                                                                    |
| Timestamp                 | `EXT_disjoint_timer_query_webgl2` があれば devtools のみで使用                                                                                                            |
| 状態                      | すべて `webgl2-state-cache.ts` 経由。直接 `gl.enable` 等を呼ばない                                                                                                        |

## 8. デバイスロスト

- WebGPU: `device.lost` を監視、WebGL2: `webglcontextlost` / `webglcontextrestored`。
- ロスト時は `onDeviceLost` を発火。v1 では自動復旧はせず、`Game` がエラー表示して停止する (復旧は将来タスク)。

## 9. エラーチェック

- `__DEBUG__` 時のみ: WebGPU は `pushErrorScope('validation')` をパイプライン生成時に使用、WebGL2 はシェーダ/プログラムのログを確認し `PlutoError(ShaderCompileFailed)` に **シェーダ名と行番号付きのログ** を含める。
- release 時はフレーム中に `gl.getError()` を呼ばない。
