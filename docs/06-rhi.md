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

1. `navigator.gpu` が存在 → `requestAdapter({ powerPreference })` → 成功なら `requestDevice({ requiredFeatures: 利用可能なら ['timestamp-query', 'indirect-first-instance'], requiredLimits: { maxStorageBufferBindingSize: adapter.limits の最大, maxBufferSize: 同 } })`
2. 1 が失敗 (例外・null) → `canvas.getContext('webgl2', { antialias, alpha: false, depth: true, stencil: false, powerPreference, preserveDrawingBuffer: false })` → 必須拡張 `EXT_color_buffer_float` を確認
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
```

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
