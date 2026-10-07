/**
 * @file rhi モジュールの公開窓口 (docs/06-rhi.md §1・§4、`docs/02` §12)。
 * インターフェースと定数だけを公開する。`rhi/webgpu/**` と `rhi/webgl2/**` と
 * `rhi/validate.ts` はモジュール外から import できない (docs/02 §12)。
 *
 * `DATA_TEXTURE_WIDTH` と `DATA_TEXTURE_TEXEL_BYTES` は WebGL2 バックエンドの
 * エミュレーション専用なので公開しない (2026-10-07, D-22)。
 */
export {
  BufferUsage,
  TextureUsage,
  TextureFormat,
  TextureDimension,
  BlendMode,
  CompareFunc,
  CullMode,
  LoadAction,
  ColorWrite,
  FilterMode,
  AddressMode,
  ShaderStage,
  BindingType,
  SWAPCHAIN_FORMAT,
} from './types';
export type {
  BufferDesc,
  TextureDesc,
  SamplerDesc,
  BindGroupLayoutDesc,
  BindGroupLayoutEntryDesc,
  BindGroupEntryDesc,
  BindGroupDesc,
  ColorTargetDesc,
  DepthStencilDesc,
  RenderPipelineDesc,
  ComputePipelineDesc,
  TextureWriteDesc,
  ColorAttachmentDesc,
  RenderPassDesc,
} from './types';
export type { RhiCapabilities } from './capabilities';
export type { ShaderSource } from './shader-source';
export type {
  RhiDevice,
  RhiCommandEncoder,
  RhiRenderPass,
  RhiComputePass,
  RhiBuffer,
  RhiTexture,
  RhiSampler,
  RhiBindGroupLayout,
  RhiBindGroup,
  RhiRenderPipeline,
  RhiComputePipeline,
  RhiQuerySet,
} from './device';
export { createDevice } from './create-device';
export type { CreateDeviceOptions } from './create-device';
