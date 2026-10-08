// @pluto-hot
/**
 * @file GPU 排他的プレフィックスサム (docs/07-renderer.md §8, docs/02-directory-structure.md §16)
 *
 * 3 パス方式 (ブロック内スキャン → ブロック和スキャン → ブロック和加算) により、
 * 最大 1,048,576 (2^20) 要素の排他的プレフィックスサムを GPU 上で高速に計算する。
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

/** 1 ブロックあたりの要素数 (256 スレッド × 4 要素)。 */
export const PREFIX_SUM_BLOCK_SIZE = 1024;
/** 最大対応要素数 (2^20)。 */
export const PREFIX_SUM_MAX_ELEMENTS = 1048576;

/**
 * プレフィックスサム用バインドグループ記述子。
 */
export interface PrefixSumBindGroupDesc {
  /** 入力データバッファ (u32 配列) */
  readonly inputBuffer: RhiBuffer;
  /** 出力データバッファ (u32 配列) */
  readonly outputBuffer: RhiBuffer;
}

/**
 * GPU 排他的プレフィックスサム管理クラス。
 */
export class GpuPrefixSum {
  /** RHI デバイス */
  public readonly device: RhiDevice;
  /** 最大対応要素数 */
  public readonly maxElements: number;
  /** 最大ブロック数 */
  public readonly maxBlocks: number;

  /** バインドグループレイアウト */
  public readonly bindGroupLayout: RhiBindGroupLayout;
  /** ブロック和内部バッファ */
  public readonly blockSumsBuffer: RhiBuffer;
  /** パラメータ uniform バッファ */
  public readonly paramsBuffer: RhiBuffer;

  private readonly pipelineBlockScan: RhiComputePipeline;
  private readonly pipelineScanBlockSums: RhiComputePipeline;
  private readonly pipelineAddBlockSums: RhiComputePipeline;

  private readonly paramsData = new Uint32Array(4);

  /**
   * @param device RHI デバイス (caps.compute === true 必須)
   * @param maxElements 最大要素数 (既定 1,048,576)
   */
  public constructor(device: RhiDevice, maxElements = PREFIX_SUM_MAX_ELEMENTS) {
    if (!device.caps.compute) {
      throw new PlutoError(
        ErrorCode.UnsupportedFeature,
        'GpuPrefixSum は compute 非対応のデバイスでは使用できません',
      );
    }
    if (maxElements > PREFIX_SUM_MAX_ELEMENTS || maxElements <= 0) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        `maxElements は 1 〜 ${String(PREFIX_SUM_MAX_ELEMENTS)} の範囲で指定してください: ${String(maxElements)}`,
      );
    }

    this.device = device;
    this.maxElements = maxElements;
    this.maxBlocks = Math.ceil(maxElements / PREFIX_SUM_BLOCK_SIZE) | 0;

    this.paramsBuffer = device.createBuffer({
      sizeBytes: 16,
      usage: BufferUsage.Uniform | BufferUsage.CopyDst,
      label: 'PrefixSumParamsUniform',
    });

    this.blockSumsBuffer = device.createBuffer({
      sizeBytes: Math.max(16, this.maxBlocks * 4),
      usage: BufferUsage.Storage | BufferUsage.CopyDst,
      label: 'PrefixSumBlockSums',
    });

    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        { stage: ShaderStage.Compute, type: BindingType.UniformBuffer },
        { stage: ShaderStage.Compute, type: BindingType.StorageBufferRead },
        { stage: ShaderStage.Compute, type: BindingType.StorageBufferReadWrite },
        { stage: ShaderStage.Compute, type: BindingType.StorageBufferReadWrite },
      ],
    });

    const shaderRaw = getShader('scan/prefix-sum');
    if (!shaderRaw.wgsl) {
      throw new PlutoError(
        ErrorCode.InvalidState,
        'scan/prefix-sum の WGSL ソースが見つかりません',
      );
    }
    const wgslBlockScan = preprocessWithBuiltins(shaderRaw.wgsl, {
      defines: { ENTRY_BLOCK_SCAN: true },
    });
    const wgslScanSums = preprocessWithBuiltins(shaderRaw.wgsl, {
      defines: { ENTRY_SCAN_BLOCK_SUMS: true },
    });
    const wgslAddSums = preprocessWithBuiltins(shaderRaw.wgsl, {
      defines: { ENTRY_ADD_BLOCK_SUMS: true },
    });

    this.pipelineBlockScan = device.createComputePipeline({
      computeShader: { name: 'prefix-sum-block-scan', wgsl: wgslBlockScan },
      layouts: [this.bindGroupLayout],
      workgroupSize: [256, 1, 1],
    });

    this.pipelineScanBlockSums = device.createComputePipeline({
      computeShader: { name: 'prefix-sum-scan-sums', wgsl: wgslScanSums },
      layouts: [this.bindGroupLayout],
      workgroupSize: [256, 1, 1],
    });

    this.pipelineAddBlockSums = device.createComputePipeline({
      computeShader: { name: 'prefix-sum-add-sums', wgsl: wgslAddSums },
      layouts: [this.bindGroupLayout],
      workgroupSize: [256, 1, 1],
    });
  }

  /**
   * 指定した入出力バッファに対するバインドグループを作成する。
   *
   * @cold
   * @param desc 入出力バッファ記述子
   * @returns 生成されたバインドグループ
   */
  public createBindGroup(desc: PrefixSumBindGroupDesc): RhiBindGroup {
    return this.device.createBindGroup({
      layout: this.bindGroupLayout,
      entries: [
        { type: BindingType.UniformBuffer, buffer: this.paramsBuffer },
        { type: BindingType.StorageBufferRead, buffer: desc.inputBuffer },
        { type: BindingType.StorageBufferReadWrite, buffer: desc.outputBuffer },
        { type: BindingType.StorageBufferReadWrite, buffer: this.blockSumsBuffer },
      ],
    });
  }

  /**
   * 排他的プレフィックスサムを実行する。
   *
   * @hot
   * @param encoder コマンドエンコーダ
   * @param bindGroup 事前作成されたバインドグループ
   * @param count 処理要素数
   */
  public execute(encoder: RhiCommandEncoder, bindGroup: RhiBindGroup, count: number): void {
    if (count <= 0) {
      return;
    }
    const numBlocks = Math.ceil(count / PREFIX_SUM_BLOCK_SIZE) | 0;

    this.paramsData[0] = count;
    this.paramsData[1] = numBlocks;
    this.paramsData[2] = 0;
    this.paramsData[3] = 0;
    this.device.writeBuffer(this.paramsBuffer, 0, this.paramsData);

    const pass = encoder.beginComputePass();
    pass.setBindGroup(0, bindGroup);

    // パス 1: ブロック内スキャン
    pass.setPipeline(this.pipelineBlockScan);
    pass.dispatch(numBlocks);

    // 複数ブロックの場合はパス 2 とパス 3 を実行
    if (numBlocks > 1) {
      pass.setPipeline(this.pipelineScanBlockSums);
      pass.dispatch(1);

      pass.setPipeline(this.pipelineAddBlockSums);
      pass.dispatch(numBlocks);
    }

    pass.end();
  }
}
