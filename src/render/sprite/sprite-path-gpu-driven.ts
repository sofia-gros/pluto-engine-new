// @pluto-hot
/**
 * @file 完全 GPU 駆動スプライト描画パス (docs/07-renderer.md §8, docs/12-roadmap.md T-4.6)。
 * GPU カリング → Prefix Sum → Scatter → Sort Keys → GpuRadixSort → drawIndirect の
 * 完全 GPU 駆動パイプラインを管理・実行する。
 */

import { GpuRadixSort, RADIX_SORT_BLOCK_SIZE } from '../../compute';
import { ErrorCode, PlutoError } from '../../core/debug';
import {
  BindingType,
  BlendMode,
  BufferUsage,
  CompareFunc,
  FilterMode,
  SWAPCHAIN_FORMAT,
  ShaderStage,
  TextureFormat,
  type RhiBindGroup,
  type RhiBindGroupLayout,
  type RhiBuffer,
  type RhiCommandEncoder,
  type RhiComputePipeline,
  type RhiDevice,
  type RhiRenderPass,
  type RhiRenderPipeline,
  type ShaderSource,
} from '../../rhi';
import { getShader, preprocessWithBuiltins } from '../../shaders';
import type { FrameTable } from '../texture/frame-table';
import type { SpriteBuffer } from './sprite-buffer';
import type { SpritePathTextures } from './sprite-path-cpu-assisted';

/** バッファ生成ヘルパー (@cold) */
function mkBuf(d: RhiDevice, size: number, usage: number, label: string): RhiBuffer {
  return d.createBuffer({ sizeBytes: size, usage, label });
}

/** コンピュート用レイアウト生成ヘルパー (@cold) */
function mkLayout(d: RhiDevice, types: readonly number[]): RhiBindGroupLayout {
  const entries = types.map((type) => ({ stage: ShaderStage.Compute, type }));
  return d.createBindGroupLayout({ entries });
}

/** コンピュートパイプライン生成ヘルパー (@cold) */
function mkCompute(
  d: RhiDevice,
  name: string,
  wgsl: string,
  layouts: readonly RhiBindGroupLayout[],
  workgroupSize: readonly [number, number, number] = [256, 1, 1],
): RhiComputePipeline {
  return d.createComputePipeline({
    computeShader: { name, wgsl },
    layouts,
    workgroupSize,
  });
}

/** 描画パイプライン群を生成する (@cold) */
function createDrawPipelines(
  device: RhiDevice,
  layout: RhiBindGroupLayout,
): readonly [RhiRenderPipeline, RhiRenderPipeline, RhiRenderPipeline] {
  const r = getShader('sprite');
  const sh: ShaderSource = {
    name: 'sprite-gpu-driven',
    ...(r.wgsl ? { wgsl: preprocessWithBuiltins(r.wgsl) } : {}),
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
 * GPU 駆動スプライト描画パス。
 */
export class SpritePathGpuDriven {
  /** RHI デバイス */
  public readonly device: RhiDevice;
  /** 最大スプライト数 */
  public readonly maxSprites: number;
  /** 最大ブロック数 (1024 要素/ブロック) */
  public readonly maxBlocks: number;
  /** カメラ用 Uniform バッファ (64 バイト) */
  public readonly cameraBuffer: RhiBuffer;

  private readonly indirectArgsBuffer: RhiBuffer;
  private readonly cullParamsBuffer: RhiBuffer;
  private readonly scanParamsBuffer: RhiBuffer;
  private readonly binFlagsBuffer: RhiBuffer;
  private readonly scannedOffsetsBuffer: RhiBuffer;
  private readonly blockSumsBuffer: RhiBuffer;
  private readonly visibleIndicesBuffer: RhiBuffer;
  private readonly alphaSortValuesBuffer: RhiBuffer;

  private readonly radixSort: GpuRadixSort;
  private readonly radixSortBgs: ReturnType<GpuRadixSort['createBindGroups']>;
  private readonly cPipes: readonly RhiComputePipeline[];
  private readonly cBgs: readonly RhiBindGroup[];
  private readonly drawPipelines: readonly [
    RhiRenderPipeline,
    RhiRenderPipeline,
    RhiRenderPipeline,
  ];
  private readonly drawBgs: readonly [RhiBindGroup, RhiBindGroup, RhiBindGroup];
  private readonly cullParamsArray = new Uint32Array(4);
  private readonly scanParamsArray = new Uint32Array(4);

  /**
   * @cold
   * @param device RHI デバイス
   * @param maxSprites 最大スプライト数
   * @param spriteBuffer スプライトバッファ
   * @param frameTable フレームテーブル
   * @param textures テクスチャセット
   */
  public constructor(
    device: RhiDevice,
    maxSprites: number,
    spriteBuffer: SpriteBuffer,
    frameTable: FrameTable,
    textures: SpritePathTextures,
  ) {
    if (!device.caps.compute || !device.caps.indirectDraw) {
      throw new PlutoError(
        ErrorCode.UnsupportedFeature,
        'GPU 駆動描画パスには caps.compute と caps.indirectDraw が必要です',
      );
    }

    this.device = device;
    this.maxSprites = maxSprites;
    this.maxBlocks = Math.max(1, Math.ceil(maxSprites / 1024));

    const uU = BufferUsage.Uniform | BufferUsage.CopyDst;
    const uS = BufferUsage.Storage;
    this.cameraBuffer = mkBuf(device, 64, uU, 'GpuPathCamera');
    this.cullParamsBuffer = mkBuf(device, 16, uU, 'GpuPathCullParams');
    const sortKeysParamsBuf = mkBuf(device, 16, uU, 'GpuPathSortKeysParams');
    this.scanParamsBuffer = mkBuf(device, 16, uU, 'GpuPathScanParams');
    this.indirectArgsBuffer = mkBuf(device, 64, uS | BufferUsage.Indirect, 'GpuPathIndirectArgs');

    this.binFlagsBuffer = mkBuf(device, maxSprites * 16, uS, 'GpuPathBinFlags');
    this.scannedOffsetsBuffer = mkBuf(device, maxSprites * 16, uS, 'GpuPathScannedOffsets');
    this.blockSumsBuffer = mkBuf(device, Math.max(16, this.maxBlocks * 16), uS, 'GpuPathBlockSums');
    this.visibleIndicesBuffer = mkBuf(device, maxSprites * 12, uS, 'GpuPathVisibleIndices');

    const sortKeys = mkBuf(device, maxSprites * 4, uS, 'GpuPathSortKeys');
    this.alphaSortValuesBuffer = mkBuf(device, maxSprites * 4, uS, 'GpuPathSortVals');
    const sortScratchK = mkBuf(device, maxSprites * 4, uS, 'GpuPathScratchKeys');
    const sortScratchV = mkBuf(device, maxSprites * 4, uS, 'GpuPathScratchVals');

    device.writeBuffer(sortKeysParamsBuf, 0, new Uint32Array([maxSprites, 0, 0, 0]));

    this.radixSort = new GpuRadixSort(device, maxSprites);
    this.radixSortBgs = this.radixSort.createBindGroups({
      keys: sortKeys,
      values: this.alphaSortValuesBuffer,
      scratchKeys: sortScratchK,
      scratchValues: sortScratchV,
    });

    const UB = BindingType.UniformBuffer;
    const SR = BindingType.StorageBufferRead;
    const SW = BindingType.StorageBufferReadWrite;

    // 1. Reset
    const lReset = mkLayout(device, [SW]);
    const pReset = mkCompute(
      device,
      'cull-reset',
      preprocessWithBuiltins(getShader('cull/reset-args').wgsl ?? ''),
      [lReset],
      [1, 1, 1],
    );
    const bgReset = device.createBindGroup({
      layout: lReset,
      entries: [{ type: SW, buffer: this.indirectArgsBuffer }],
    });

    // 2. Cull & Scatter
    const cullRaw = getShader('cull/sprite-cull').wgsl ?? '';
    const lCull = mkLayout(device, [UB, UB, SR, SR, SW, SR, SW, SW]);
    const pCull = mkCompute(
      device,
      'cull-cull',
      preprocessWithBuiltins(cullRaw, { defines: { ENTRY_CULL: true } }),
      [lCull],
    );
    const pScatter = mkCompute(
      device,
      'cull-scatter',
      preprocessWithBuiltins(cullRaw, { defines: { ENTRY_SCATTER: true } }),
      [lCull],
    );

    spriteBuffer.flushToGpu(device);
    frameTable.flush(device);
    const gSpr = spriteBuffer.getGpuBuffer() ?? this.cameraBuffer;
    const gFrm = frameTable.getGpuBuffer() ?? this.cameraBuffer;
    const bgCull = device.createBindGroup({
      layout: lCull,
      entries: [
        { type: UB, buffer: this.cullParamsBuffer },
        { type: UB, buffer: this.cameraBuffer },
        { type: SR, buffer: gSpr },
        { type: SR, buffer: gFrm },
        { type: SW, buffer: this.binFlagsBuffer },
        { type: SR, buffer: this.scannedOffsetsBuffer },
        { type: SW, buffer: this.visibleIndicesBuffer },
        { type: SW, buffer: this.indirectArgsBuffer },
      ],
    });

    // 3. Scan
    const scanRaw = getShader('scan/prefix-sum').wgsl ?? '';
    const defScan = (d: string) => ({ defines: { PREFIX_SUM_VEC4: true, [d]: true } });
    const lScan = mkLayout(device, [UB, SR, SW, SW]);
    const pScanB = mkCompute(
      device,
      'scan-b',
      preprocessWithBuiltins(scanRaw, defScan('ENTRY_BLOCK_SCAN')),
      [lScan],
    );
    const pScanS = mkCompute(
      device,
      'scan-s',
      preprocessWithBuiltins(scanRaw, defScan('ENTRY_SCAN_BLOCK_SUMS')),
      [lScan],
    );
    const pScanA = mkCompute(
      device,
      'scan-a',
      preprocessWithBuiltins(scanRaw, defScan('ENTRY_ADD_BLOCK_SUMS')),
      [lScan],
    );
    const bgScan = device.createBindGroup({
      layout: lScan,
      entries: [
        { type: UB, buffer: this.scanParamsBuffer },
        { type: SR, buffer: this.binFlagsBuffer },
        { type: SW, buffer: this.scannedOffsetsBuffer },
        { type: SW, buffer: this.blockSumsBuffer },
      ],
    });

    // 4. Sort Keys
    const lKeys = mkLayout(device, [UB, SR, SR, SR, SW, SW]);
    const pKeys = mkCompute(
      device,
      'sort-keys',
      preprocessWithBuiltins(getShader('cull/sort-keys').wgsl ?? ''),
      [lKeys],
    );
    const bgKeys = device.createBindGroup({
      layout: lKeys,
      entries: [
        { type: UB, buffer: sortKeysParamsBuf },
        { type: SR, buffer: this.indirectArgsBuffer },
        { type: SR, buffer: this.visibleIndicesBuffer },
        { type: SR, buffer: gSpr },
        { type: SW, buffer: sortKeys },
        { type: SW, buffer: this.alphaSortValuesBuffer },
      ],
    });

    this.cPipes = [pReset, pCull, pScanB, pScanS, pScanA, pScatter, pKeys];
    this.cBgs = [bgReset, bgCull, bgScan, bgKeys];

    // 5. Draw
    const smp = textures.sampler ?? device.createSampler({ filter: FilterMode.Nearest });
    const lDraw = device.createBindGroupLayout({
      entries: [
        { stage: ShaderStage.Vertex, type: UB },
        { stage: ShaderStage.Vertex, type: SR },
        { stage: ShaderStage.Vertex, type: SR },
        { stage: ShaderStage.Vertex, type: SR },
        { stage: ShaderStage.Fragment, type: BindingType.Texture },
        { stage: ShaderStage.Fragment, type: BindingType.Texture },
        { stage: ShaderStage.Fragment, type: BindingType.Sampler },
      ],
    });
    this.drawPipelines = createDrawPipelines(device, lDraw);

    const mkDrawBg = (buf: RhiBuffer, offsetBytes: number): RhiBindGroup =>
      device.createBindGroup({
        layout: lDraw,
        entries: [
          { type: UB, buffer: this.cameraBuffer },
          { type: SR, buffer: gSpr },
          { type: SR, buffer: gFrm },
          { type: SR, buffer: buf, offsetBytes, sizeBytes: maxSprites * 4 },
          { type: BindingType.Texture, texture: textures.colorTexture },
          { type: BindingType.Texture, texture: textures.compressedTexture },
          { type: BindingType.Sampler, sampler: smp },
        ],
      });

    this.drawBgs = [
      mkDrawBg(this.visibleIndicesBuffer, 0),
      mkDrawBg(this.alphaSortValuesBuffer, 0),
      mkDrawBg(this.visibleIndicesBuffer, maxSprites * 8),
    ];
  }

  /**
   * GPU 駆動描画を実行する。
   *
   * @hot
   * @param encoder コマンドエンコーダ
   * @param renderPass レンダーパス
   * @param highWater スロット使用数上限
   */
  public execute(encoder: RhiCommandEncoder, renderPass: RhiRenderPass, highWater: number): void {
    if (highWater <= 0) return;
    const n = highWater;
    const numBlocks = Math.max(1, Math.ceil(n / 1024));

    this.cullParamsArray[0] = n;
    this.cullParamsArray[1] = this.maxSprites;
    this.device.writeBuffer(this.cullParamsBuffer, 0, this.cullParamsArray);

    this.scanParamsArray[0] = n;
    this.scanParamsArray[1] = numBlocks;
    this.device.writeBuffer(this.scanParamsBuffer, 0, this.scanParamsArray);

    const cp = encoder.beginComputePass();
    cp.setPipeline(this.cPipes[0]);
    cp.setBindGroup(0, this.cBgs[0]);
    cp.dispatch(1, 1, 1);

    const cullBlocks = Math.max(1, Math.ceil(n / 256));
    cp.setPipeline(this.cPipes[1]);
    cp.setBindGroup(0, this.cBgs[1]);
    cp.dispatch(cullBlocks, 1, 1);

    cp.setBindGroup(0, this.cBgs[2]);
    cp.setPipeline(this.cPipes[2]);
    cp.dispatch(numBlocks, 1, 1);
    if (numBlocks > 1) {
      cp.setPipeline(this.cPipes[3]);
      cp.dispatch(1, 1, 1);
      cp.setPipeline(this.cPipes[4]);
      cp.dispatch(numBlocks, 1, 1);
    }

    cp.setPipeline(this.cPipes[5]);
    cp.setBindGroup(0, this.cBgs[1]);
    cp.dispatch(cullBlocks, 1, 1);

    cp.setPipeline(this.cPipes[6]);
    cp.setBindGroup(0, this.cBgs[3]);
    cp.dispatchIndirect(this.indirectArgsBuffer, 48);
    cp.end();

    this.radixSort.executeIndirect(
      encoder,
      this.radixSortBgs,
      RADIX_SORT_BLOCK_SIZE,
      this.indirectArgsBuffer,
      48,
    );

    renderPass.setPipeline(this.drawPipelines[0]);
    renderPass.setBindGroup(0, this.drawBgs[0]);
    renderPass.drawIndirect(this.indirectArgsBuffer, 0);

    renderPass.setPipeline(this.drawPipelines[1]);
    renderPass.setBindGroup(0, this.drawBgs[1]);
    renderPass.drawIndirect(this.indirectArgsBuffer, 16);

    renderPass.setPipeline(this.drawPipelines[2]);
    renderPass.setBindGroup(0, this.drawBgs[2]);
    renderPass.drawIndirect(this.indirectArgsBuffer, 32);
  }
}
