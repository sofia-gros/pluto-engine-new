// @pluto-hot
/**
 * @file GPU LSD 基数ソート (docs/07-renderer.md §8, docs/02-directory-structure.md §16)
 *
 * 32bit キー / 32bit 値のペアを、4bit × 8 パス (16 バケット) で安定ソートする。
 * GpuPrefixSum を併用し、ヒストグラムの排他的プレフィックスサムを GPU 上で完結させる。
 */

import { ErrorCode, PlutoError } from '../core/debug';
import {
  BindingType,
  BufferUsage,
  ShaderStage,
  type RhiBindGroup,
  type RhiBindGroupLayout,
  type RhiBuffer,
  type RhiCommandEncoder,
  type RhiComputePipeline,
  type RhiDevice,
} from '../rhi';
import { getShader, preprocessWithBuiltins } from '../shaders';
import { GpuPrefixSum, PREFIX_SUM_BLOCK_SIZE, PREFIX_SUM_MAX_ELEMENTS } from './gpu-prefix-sum';

/** 最大対応要素数 (2^20)。 */
export const RADIX_SORT_MAX_ELEMENTS = PREFIX_SUM_MAX_ELEMENTS;
/** 1 ブロックあたりの要素数 (1024)。 */
export const RADIX_SORT_BLOCK_SIZE = PREFIX_SUM_BLOCK_SIZE;
/** バケット数 (4bit = 16)。 */
export const RADIX_SORT_BUCKETS = 16;
/** パス数 (32bit / 4bit = 8)。 */
export const RADIX_SORT_PASSES = 8;

/**
 * 基数ソート用バッファセット記述子。
 */
export interface RadixSortBuffers {
  /** 主キーバッファ (u32) */
  readonly keys: RhiBuffer;
  /** 主値バッファ (u32) */
  readonly values: RhiBuffer;
  /** スクラッチキーバッファ (u32, 同サイズ) */
  readonly scratchKeys: RhiBuffer;
  /** スクラッチ値バッファ (u32, 同サイズ) */
  readonly scratchValues: RhiBuffer;
}

/**
 * 事前構築されたソート用バインドグループペア。
 */
export interface RadixSortBindGroups {
  /** 偶数パス用 (keys -> scratch) */
  readonly forward: RhiBindGroup;
  /** 奇数パス用 (scratch -> keys) */
  readonly backward: RhiBindGroup;
}

/**
 * GPU LSD 基数ソート管理クラス。
 */
export class GpuRadixSort {
  /** RHI デバイス */
  public readonly device: RhiDevice;
  /** 最大要素数 */
  public readonly maxElements: number;
  /** 最大ブロック数 */
  public readonly maxBlocks: number;

  /** バインドグループレイアウト */
  public readonly bindGroupLayout: RhiBindGroupLayout;
  /** グローバルヒストグラムバッファ */
  public readonly histogramBuffer: RhiBuffer;

  private readonly prefixSum: GpuPrefixSum;
  private readonly prefixSumBindGroup: RhiBindGroup;
  private readonly histogramScratchBuffer: RhiBuffer;

  private readonly pipelineHistogram: RhiComputePipeline;
  private readonly pipelineScatter: RhiComputePipeline;

  // 各パスのパラメータバッファ (8 パス分事前確保)
  private readonly paramsBuffers: readonly RhiBuffer[];
  private readonly paramsScratch = new Uint32Array(4);

  /**
   * @param device RHI デバイス (caps.compute === true 必須)
   * @param maxElements 最大要素数 (既定 1,048,576)
   */
  public constructor(device: RhiDevice, maxElements = RADIX_SORT_MAX_ELEMENTS) {
    if (!device.caps.compute) {
      throw new PlutoError(
        ErrorCode.UnsupportedFeature,
        'GpuRadixSort は compute 非対応のデバイスでは使用できません',
      );
    }
    if (maxElements > RADIX_SORT_MAX_ELEMENTS || maxElements <= 0) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        `maxElements は 1 〜 ${String(RADIX_SORT_MAX_ELEMENTS)} の範囲で指定してください: ${String(maxElements)}`,
      );
    }

    this.device = device;
    this.maxElements = maxElements;
    this.maxBlocks = Math.ceil(maxElements / RADIX_SORT_BLOCK_SIZE) | 0;

    const histCount = RADIX_SORT_BUCKETS * this.maxBlocks;
    const histBytes = histCount * 4;

    this.histogramBuffer = device.createBuffer({
      sizeBytes: histBytes,
      usage: BufferUsage.Storage | BufferUsage.CopyDst,
      label: 'RadixSortHistograms',
    });
    this.histogramScratchBuffer = device.createBuffer({
      sizeBytes: histBytes,
      usage: BufferUsage.Storage | BufferUsage.CopyDst,
      label: 'RadixSortHistogramScratch',
    });

    this.prefixSum = new GpuPrefixSum(device, histCount);
    this.prefixSumBindGroup = this.prefixSum.createBindGroup({
      inputBuffer: this.histogramBuffer,
      outputBuffer: this.histogramScratchBuffer,
    });

    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { stage: ShaderStage.Compute, type: BindingType.UniformBuffer },
        { stage: ShaderStage.Compute, type: BindingType.StorageBufferRead },
        { stage: ShaderStage.Compute, type: BindingType.StorageBufferRead },
        { stage: ShaderStage.Compute, type: BindingType.StorageBufferReadWrite },
        { stage: ShaderStage.Compute, type: BindingType.StorageBufferReadWrite },
        { stage: ShaderStage.Compute, type: BindingType.StorageBufferReadWrite },
      ],
    });

    const shaderRaw = getShader('sort/radix-sort');
    if (!shaderRaw.wgsl) {
      throw new PlutoError(
        ErrorCode.InvalidState,
        'sort/radix-sort の WGSL ソースが見つかりません',
      );
    }
    const wgslHistogram = preprocessWithBuiltins(shaderRaw.wgsl, {
      defines: { ENTRY_HISTOGRAM: true },
    });
    const wgslScatter = preprocessWithBuiltins(shaderRaw.wgsl, {
      defines: { ENTRY_SCATTER: true },
    });

    this.pipelineHistogram = device.createComputePipeline({
      computeShader: { name: 'radix-sort-histogram', wgsl: wgslHistogram },
      layouts: [this.bindGroupLayout],
      workgroupSize: [256, 1, 1],
    });

    this.pipelineScatter = device.createComputePipeline({
      computeShader: { name: 'radix-sort-scatter', wgsl: wgslScatter },
      layouts: [this.bindGroupLayout],
      workgroupSize: [256, 1, 1],
    });

    const pBuffers: RhiBuffer[] = [];
    for (let p = 0; p < RADIX_SORT_PASSES; p++) {
      pBuffers.push(
        device.createBuffer({
          sizeBytes: 16,
          usage: BufferUsage.Uniform | BufferUsage.CopyDst,
          label: `RadixSortParamsPass${String(p)}`,
        }),
      );
    }
    this.paramsBuffers = pBuffers;
  }

  /**
   * 指定した入出力バッファに対する順方向/逆方向のバインドグループを作成する。
   *
   * @cold
   * @param buffers ソート用バッファセット
   * @returns 順方向・逆方向のバインドグループ
   */
  public createBindGroups(buffers: RadixSortBuffers): RadixSortBindGroups {
    const mk = (
      pBuf: RhiBuffer,
      kIn: RhiBuffer,
      vIn: RhiBuffer,
      kOut: RhiBuffer,
      vOut: RhiBuffer,
    ): RhiBindGroup =>
      this.device.createBindGroup({
        layout: this.bindGroupLayout,
        entries: [
          { type: BindingType.UniformBuffer, buffer: pBuf },
          { type: BindingType.StorageBufferRead, buffer: kIn },
          { type: BindingType.StorageBufferRead, buffer: vIn },
          { type: BindingType.StorageBufferReadWrite, buffer: kOut },
          { type: BindingType.StorageBufferReadWrite, buffer: vOut },
          { type: BindingType.StorageBufferReadWrite, buffer: this.histogramScratchBuffer },
        ],
      });

    return {
      forward: mk(
        this.paramsBuffers[0],
        buffers.keys,
        buffers.values,
        buffers.scratchKeys,
        buffers.scratchValues,
      ),
      backward: mk(
        this.paramsBuffers[1],
        buffers.scratchKeys,
        buffers.scratchValues,
        buffers.keys,
        buffers.values,
      ),
    };
  }

  /**
   * 基数ソートを実行する (8 パス)。
   *
   * @hot
   * @param encoder コマンドエンコーダ
   * @param bindGroups 事前作成されたバインドグループペア
   * @param count ソート対象要素数
   */
  public execute(encoder: RhiCommandEncoder, bindGroups: RadixSortBindGroups, count: number): void {
    if (count <= 1) {
      return;
    }
    const numBlocks = Math.ceil(count / RADIX_SORT_BLOCK_SIZE) | 0;
    const histTotal = RADIX_SORT_BUCKETS * numBlocks;

    const pData = this.paramsScratch;
    for (let p = 0; p < RADIX_SORT_PASSES; p++) {
      pData[0] = count;
      pData[1] = numBlocks;
      pData[2] = p * 4;
      pData[3] = 0;
      this.device.writeBuffer(this.paramsBuffers[p], 0, pData);
    }

    for (let p = 0; p < RADIX_SORT_PASSES; p++) {
      const isEven = (p & 1) === 0;
      const bg = isEven ? bindGroups.forward : bindGroups.backward;

      // 1. ヒストグラム集計
      const passHist = encoder.beginComputePass();
      passHist.setBindGroup(0, bg);
      passHist.setPipeline(this.pipelineHistogram);
      passHist.dispatch(numBlocks);
      passHist.end();

      // 2. ヒストグラムの排他的プレフィックスサム
      this.prefixSum.execute(encoder, this.prefixSumBindGroup, histTotal);

      // 3. スキャッタ (安定再配置)
      const passScatter = encoder.beginComputePass();
      passScatter.setBindGroup(0, bg);
      passScatter.setPipeline(this.pipelineScatter);
      passScatter.dispatch(numBlocks);
      passScatter.end();
    }
  }

  /**
   * indirect 引数バッファを指定して基数ソートを実行する。
   *
   * @hot
   * @param encoder コマンドエンコーダ
   * @param bindGroups 事前作成されたバインドグループペア
   * @param count ソート対象要素数
   * @param indirectBuffer ディスパッチ引数バッファ
   * @param indirectOffsetBytes オフセット (バイト)
   */
  public executeIndirect(
    encoder: RhiCommandEncoder,
    bindGroups: RadixSortBindGroups,
    count: number,
    indirectBuffer: RhiBuffer,
    indirectOffsetBytes = 0,
  ): void {
    if (count <= 1) {
      return;
    }
    const numBlocks = Math.ceil(count / RADIX_SORT_BLOCK_SIZE) | 0;
    const histTotal = RADIX_SORT_BUCKETS * numBlocks;

    const pData = this.paramsScratch;
    for (let p = 0; p < RADIX_SORT_PASSES; p++) {
      pData[0] = count;
      pData[1] = numBlocks;
      pData[2] = p * 4;
      pData[3] = 0;
      this.device.writeBuffer(this.paramsBuffers[p], 0, pData);
    }

    for (let p = 0; p < RADIX_SORT_PASSES; p++) {
      const isEven = (p & 1) === 0;
      const bg = isEven ? bindGroups.forward : bindGroups.backward;

      const passHist = encoder.beginComputePass();
      passHist.setBindGroup(0, bg);
      passHist.setPipeline(this.pipelineHistogram);
      passHist.dispatchIndirect(indirectBuffer, indirectOffsetBytes);
      passHist.end();

      this.prefixSum.execute(encoder, this.prefixSumBindGroup, histTotal);

      const passScatter = encoder.beginComputePass();
      passScatter.setBindGroup(0, bg);
      passScatter.setPipeline(this.pipelineScatter);
      passScatter.dispatchIndirect(indirectBuffer, indirectOffsetBytes);
      passScatter.end();
    }
  }
}
