// @pluto-hot
/**
 * @file CPU 補助スプライト描画パス (docs/07-renderer.md §9, docs/02-directory-structure.md §17)
 *
 * compute 非対応環境 (WebGL2 / WebGPU フォールバック) 向けに、
 * CPU カリング、LSD 基数ソート、可視インデックス転送、3 ビン別描画を実行する。
 */

import type { ChunkView, World } from '../../core/ecs';
import type { KernelBuffers } from '../../jobs';
import {
  BindingType,
  BlendMode,
  BufferUsage,
  CompareFunc,
  FilterMode,
  ShaderStage,
  SWAPCHAIN_FORMAT,
  TextureDimension,
  TextureFormat,
  TextureUsage,
  type RhiBindGroup,
  type RhiBindGroupLayout,
  type RhiBuffer,
  type RhiDevice,
  type RhiRenderPass,
  type RhiRenderPipeline,
  type RhiSampler,
  type RhiTexture,
  type ShaderSource,
} from '../../rhi';
import { getShader, preprocessWithBuiltins } from '../../shaders';
import { WorldTransform } from '../../transform';
import { BIN_COUNT, DATA_TEXTURE_WIDTH, SPRITE_STRIDE_WORDS } from '../render-constants';
import type { FrameTable } from '../texture/frame-table';
import type { SpriteBuffer } from './sprite-buffer';
import { Sprite, SpriteSlot } from './sprite-components';
import { spriteCpuCullKernelFn } from './sprite-cpu-cull-kernel';
import { SPRITE_WORD_ROT_LAYER, SPRITE_WORD_SORT_KEY } from './sprite-instance-layout';

const SPRITE_QUERY_DESC = { all: [WorldTransform, Sprite, SpriteSlot] } as const;

/**
 * ビン用パイプラインの生成。
 * @cold
 */
function createBinPipelines(
  device: RhiDevice,
  layout: RhiBindGroupLayout,
): readonly [RhiRenderPipeline, RhiRenderPipeline, RhiRenderPipeline] {
  const r = getShader('sprite');
  const sh: ShaderSource = {
    name: 'sprite-assisted',
    ...(r.wgsl ? { wgsl: preprocessWithBuiltins(r.wgsl) } : {}),
    ...(r.glslVertex ? { glslVertex: preprocessWithBuiltins(r.glslVertex) } : {}),
    ...(r.glslFragment ? { glslFragment: preprocessWithBuiltins(r.glslFragment) } : {}),
  };
  const mk = (blend: number, writeEnabled: boolean): RhiRenderPipeline =>
    device.createRenderPipeline({
      vertexShader: sh,
      fragmentShader: sh,
      layouts: [layout],
      colorTargets: [{ format: SWAPCHAIN_FORMAT, blend }],
      depthStencil: { format: TextureFormat.Depth24Plus, compare: CompareFunc.Less, writeEnabled },
    });
  return [
    mk(BlendMode.Opaque, true),
    mk(BlendMode.PremultipliedAlpha, false),
    mk(BlendMode.Additive, false),
  ];
}

/**
 * スプライトパス描画用テクスチャセット。
 */
export interface SpritePathTextures {
  /** カラーテクスチャ配列 (RGBA8) */
  readonly colorTexture: RhiTexture;
  /** 圧縮テクスチャ配列 */
  readonly compressedTexture: RhiTexture;
  /** サンプラ (省略時は Nearest) */
  readonly sampler?: RhiSampler;
}

interface CommonBinResources {
  readonly device: RhiDevice;
  readonly layout: RhiBindGroupLayout;
  readonly camera: RhiBuffer;
  readonly sprite: RhiBuffer | RhiTexture;
  readonly frame: RhiBuffer | RhiTexture;
  readonly isWebGpu: boolean;
}

/**
 * 3 ビン分のバインドグループを構築する。
 * @cold
 */
function createBinBindGroups(
  res: CommonBinResources,
  bins: readonly [RhiBuffer | RhiTexture, RhiBuffer | RhiTexture, RhiBuffer | RhiTexture],
  textures: SpritePathTextures,
  sampler: RhiSampler,
): readonly [RhiBindGroup, RhiBindGroup, RhiBindGroup] {
  const { device, layout, camera, sprite, frame, isWebGpu } = res;
  const { colorTexture, compressedTexture } = textures;
  const t = isWebGpu ? BindingType.StorageBufferRead : BindingType.Texture;
  const mk = (b: RhiBuffer | RhiTexture): RhiBindGroup =>
    device.createBindGroup({
      layout,
      entries: [
        { type: BindingType.UniformBuffer, buffer: camera },
        isWebGpu
          ? { type: t, buffer: sprite as RhiBuffer }
          : { type: t, texture: sprite as RhiTexture },
        isWebGpu
          ? { type: t, buffer: frame as RhiBuffer }
          : { type: t, texture: frame as RhiTexture },
        isWebGpu ? { type: t, buffer: b as RhiBuffer } : { type: t, texture: b as RhiTexture },
        { type: BindingType.Texture, texture: colorTexture },
        { type: BindingType.Texture, texture: compressedTexture },
        { type: BindingType.Sampler, sampler },
      ],
    });
  return [mk(bins[0]), mk(bins[1]), mk(bins[2])];
}

/**
 * 可視リソース初期化。
 * @cold
 */
function initBinRes(device: RhiDevice, maxSprites: number, isWebGpu: boolean) {
  if (isWebGpu) {
    const mk = (l: string): RhiBuffer =>
      device.createBuffer({
        sizeBytes: maxSprites * 4,
        usage: BufferUsage.Storage | BufferUsage.CopyDst,
        label: l,
      });
    const b: [RhiBuffer, RhiBuffer, RhiBuffer] = [mk('Vis0'), mk('Vis1'), mk('Vis2')];
    return {
      bufs: b,
      texs: null,
      data: new Uint32Array(maxSprites),
      desc: { offsetX: 0, offsetY: 0, layer: 0, width: 1, height: 1 },
      b,
    };
  }
  const h = Math.max(1, Math.ceil(maxSprites / (DATA_TEXTURE_WIDTH * 4)) | 0);
  const mk = (l: string): RhiTexture =>
    device.createTexture({
      width: DATA_TEXTURE_WIDTH,
      height: h,
      layers: 1,
      format: TextureFormat.RGBA32Uint,
      usage: TextureUsage.TextureBinding | TextureUsage.CopyDst,
      dimension: TextureDimension.D2,
      label: l,
    });
  const b: [RhiTexture, RhiTexture, RhiTexture] = [mk('Vis0'), mk('Vis1'), mk('Vis2')];
  return {
    bufs: null,
    texs: b,
    data: new Uint32Array(DATA_TEXTURE_WIDTH * h * 4),
    desc: { offsetX: 0, offsetY: 0, layer: 0, width: DATA_TEXTURE_WIDTH, height: 1 },
    b,
  };
}

interface MutableTextureWriteDesc {
  offsetX: number;
  offsetY: number;
  layer: number;
  width: number;
  height: number;
}

/**
 * CPU 補助スプライト描画パス。
 */
export class SpritePathCpuAssisted {
  /** RHI デバイス */
  public readonly device: RhiDevice;
  /** 最大スプライト数 */
  public readonly maxSprites: number;
  /** カリング出力配列 (maxSprites * 3 要素) */
  public readonly cullOutput: Uint32Array;
  /** カリングカウンタ配列 (Opaque, Alpha, Additive の 3 要素) */
  public readonly cullCounters: Int32Array;

  private readonly sortKeys: Uint32Array;
  private readonly sortKeysScratch: Uint32Array;
  private readonly sortIndices: Uint32Array;
  private readonly sortIndicesScratch: Uint32Array;
  private readonly bucketCounts = new Uint32Array(256);
  private readonly bucketOffsets = new Uint32Array(256);

  private readonly cameraBuffer: RhiBuffer;
  private readonly visBuffers: readonly RhiBuffer[] | null;
  private readonly visTextures: readonly RhiTexture[] | null;
  private readonly visData: Uint32Array;
  private readonly writeTexDesc: MutableTextureWriteDesc;

  private readonly pipelines: readonly [RhiRenderPipeline, RhiRenderPipeline, RhiRenderPipeline];
  private readonly bindGroups: readonly [RhiBindGroup, RhiBindGroup, RhiBindGroup];

  private readonly cullParams = new Float32Array(8);
  private readonly cullBuffers: KernelBuffers;
  private readonly onChunkCallback: (chunk: ChunkView) => void;

  /**
   * @param device RHI デバイス
   * @param maxSprites 最大スプライト数
   * @param spriteBuffer スプライトバッファ
   * @param frameTable フレームテーブル
   * @param textures テクスチャ群
   */
  public constructor(
    device: RhiDevice,
    maxSprites: number,
    spriteBuffer: SpriteBuffer,
    frameTable: FrameTable,
    textures: SpritePathTextures,
  ) {
    this.device = device;
    this.maxSprites = maxSprites;
    this.cullOutput = new Uint32Array(maxSprites * BIN_COUNT);
    this.cullCounters = new Int32Array(BIN_COUNT);
    this.sortKeys = new Uint32Array(maxSprites);
    this.sortKeysScratch = new Uint32Array(maxSprites);
    this.sortIndices = new Uint32Array(maxSprites);
    this.sortIndicesScratch = new Uint32Array(maxSprites);

    this.cameraBuffer = device.createBuffer({
      sizeBytes: 64,
      usage: BufferUsage.Uniform | BufferUsage.CopyDst,
      label: 'SpriteCameraUniform',
    });
    const smp = textures.sampler ?? device.createSampler({ filter: FilterMode.Nearest });

    this.cullBuffers = {
      u32: [spriteBuffer.u32View, this.cullOutput],
      f32: [spriteBuffer.f32View],
      i32: [new Int32Array(1), this.cullCounters],
    };
    this.onChunkCallback = (chunk: ChunkView): void => {
      spriteCpuCullKernelFn(chunk, this.cullParams, this.cullBuffers);
    };

    const isWebGpu = device.caps.backend === 'webgpu';
    const stType = isWebGpu ? BindingType.StorageBufferRead : BindingType.Texture;
    const layout = device.createBindGroupLayout({
      entries: [
        { stage: ShaderStage.Vertex, type: BindingType.UniformBuffer },
        { stage: ShaderStage.Vertex, type: stType },
        { stage: ShaderStage.Vertex, type: stType },
        { stage: ShaderStage.Vertex, type: stType },
        { stage: ShaderStage.Fragment, type: BindingType.Texture },
        { stage: ShaderStage.Fragment, type: BindingType.Texture },
        { stage: ShaderStage.Fragment, type: BindingType.Sampler },
      ],
    });

    spriteBuffer.flushToGpu(device);
    frameTable.flush(device);

    const r = initBinRes(device, maxSprites, isWebGpu);
    this.visBuffers = r.bufs;
    this.visTextures = r.texs;
    this.visData = r.data;
    this.writeTexDesc = r.desc;

    const sRes = isWebGpu
      ? (spriteBuffer.getGpuBuffer() ?? this.cameraBuffer)
      : (spriteBuffer.getGpuTexture() ?? (r.b[0] as RhiTexture));
    const fRes = isWebGpu
      ? (frameTable.getGpuBuffer() ?? this.cameraBuffer)
      : (frameTable.getGpuTexture() ?? (r.b[0] as RhiTexture));

    this.bindGroups = createBinBindGroups(
      { device, layout, camera: this.cameraBuffer, sprite: sRes, frame: fRes, isWebGpu },
      r.b,
      textures,
      smp,
    );
    this.pipelines = createBinPipelines(device, layout);
  }

  /**
   * Alpha ビンを LSD 基数ソート (8bit × 4 パス) する。
   *
   * @hot
   * @param count ソート対象要素数
   * @param spriteBuffer スプライトバッファ (キー抽出用)
   */
  public sortAlphaBin(count: number, spriteBuffer: SpriteBuffer): void {
    if (count <= 1) return;
    const baseOffset = this.maxSprites;
    const u32 = spriteBuffer.u32View;
    const f32 = spriteBuffer.f32View;

    for (let i = 0; i < count; i++) {
      const slot = this.cullOutput[baseOffset + i];
      this.sortIndices[i] = slot;
      const wb = slot * SPRITE_STRIDE_WORDS;
      const layer = (u32[wb + SPRITE_WORD_ROT_LAYER] >>> 16) & 0x3ff;
      const sk = (f32[wb + SPRITE_WORD_SORT_KEY] * 1048576.0) | 0;
      this.sortKeys[i] = ((layer << 20) | (sk & 0xfffff)) >>> 0;
    }

    let srcI = this.sortIndices;
    let dstI = this.sortIndicesScratch;
    let srcK = this.sortKeys;
    let dstK = this.sortKeysScratch;

    for (let shift = 0; shift < 32; shift += 8) {
      this.bucketCounts.fill(0);
      for (let i = 0; i < count; i++) this.bucketCounts[(srcK[i] >>> shift) & 0xff]++;
      this.bucketOffsets[0] = 0;
      for (let b = 1; b < 256; b++) {
        this.bucketOffsets[b] = this.bucketOffsets[b - 1] + this.bucketCounts[b - 1];
      }
      for (let i = 0; i < count; i++) {
        const k = srcK[i];
        const t = this.bucketOffsets[(k >>> shift) & 0xff]++;
        dstK[t] = k;
        dstI[t] = srcI[i];
      }
      const tk = srcK;
      srcK = dstK;
      dstK = tk;
      const ti = srcI;
      srcI = dstI;
      dstI = ti;
    }

    for (let i = 0; i < count; i++) this.cullOutput[baseOffset + i] = srcI[i];
  }

  /**
   * 単一ビンの描画コマンド発行。
   * @hot
   */
  private drawBin(pass: RhiRenderPass, binIndex: number, baseOffset: number, count: number): void {
    if (count <= 0) return;
    if (this.visBuffers !== null) {
      this.device.writeBuffer(
        this.visBuffers[binIndex],
        0,
        this.cullOutput.subarray(baseOffset, baseOffset + count),
      );
    } else if (this.visTextures !== null) {
      const texHeight = Math.ceil(count / (DATA_TEXTURE_WIDTH * 4)) | 0;
      this.visData.set(this.cullOutput.subarray(baseOffset, baseOffset + count));
      this.writeTexDesc.height = texHeight > 0 ? texHeight : 1;
      this.device.writeTexture(this.visTextures[binIndex], this.writeTexDesc, this.visData);
    }
    pass.setBindGroup(0, this.bindGroups[binIndex]);
    pass.setPipeline(this.pipelines[binIndex]);
    pass.draw(6, count);
  }

  /**
   * スプライト描画を実行する。
   *
   * @hot
   * @param pass レンダーパス
   * @param world ECS ワールド
   * @param spriteBuffer スプライトバッファ
   * @param cameraData カメラ uniform データ (64 バイト Float32Array)
   * @param cullRect カメラカリング矩形 [minX, minY, maxX, maxY]
   */
  public execute(
    pass: RhiRenderPass,
    world: World,
    spriteBuffer: SpriteBuffer,
    cameraData: Float32Array,
    cullRect: readonly [number, number, number, number],
  ): void {
    this.cullCounters[0] = 0;
    this.cullCounters[1] = 0;
    this.cullCounters[2] = 0;
    this.device.writeBuffer(this.cameraBuffer, 0, cameraData);

    this.cullParams[0] = cullRect[0];
    this.cullParams[1] = cullRect[1];
    this.cullParams[2] = cullRect[2];
    this.cullParams[3] = cullRect[3];
    this.cullParams[4] = this.maxSprites;
    this.cullParams[5] = 128.0;

    world.query(SPRITE_QUERY_DESC).forEachChunk(this.onChunkCallback);
    this.sortAlphaBin(this.cullCounters[1], spriteBuffer);
    this.drawBin(pass, 0, 0, this.cullCounters[0]);
    this.drawBin(pass, 1, this.maxSprites, this.cullCounters[1]);
    this.drawBin(pass, 2, this.maxSprites * 2, this.cullCounters[2]);
  }
}
