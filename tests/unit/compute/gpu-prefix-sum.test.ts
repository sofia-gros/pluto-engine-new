/**
 * @file GpuPrefixSum の単体テスト (docs/07-renderer.md §8, docs/10-testing-strategy.md §4)。
 */

import { describe, expect, it } from 'vitest';
import { ErrorCode, PlutoError } from '../../../src/core/debug';
import { EventEmitter } from '../../../src/core/events';
import { GpuPrefixSum, PREFIX_SUM_BLOCK_SIZE, PREFIX_SUM_MAX_ELEMENTS } from '../../../src/compute';
import type {
  BindGroupDesc,
  BufferDesc,
  ComputePipelineDesc,
  RhiBindGroup,
  RhiBindGroupLayout,
  RhiBuffer,
  RhiCommandEncoder,
  RhiComputePass,
  RhiComputePipeline,
  RhiDevice,
  RhiQuerySet,
  RhiRenderPass,
  RhiRenderPipeline,
  RhiSampler,
  RhiTexture,
} from '../../../src/rhi';

class MockBuffer implements RhiBuffer {
  public readonly sizeBytes: number;
  public readonly usage: number;
  public readonly label: string;
  public constructor(desc: BufferDesc) {
    this.sizeBytes = desc.sizeBytes;
    this.usage = desc.usage;
    this.label = desc.label ?? '';
  }
  public destroy(): void {
    void 0;
  }
}

class MockComputePass implements RhiComputePass {
  public pipelines: RhiComputePipeline[] = [];
  public bindGroups: { slot: number; group: RhiBindGroup }[] = [];
  public dispatches: [number, number, number][] = [];

  public setPipeline(pipeline: RhiComputePipeline): void {
    this.pipelines.push(pipeline);
  }
  public setBindGroup(_slot: number, group: RhiBindGroup): void {
    this.bindGroups.push({ slot: _slot, group });
  }
  public dispatch(workgroupCountX: number, workgroupCountY = 1, workgroupCountZ = 1): void {
    this.dispatches.push([workgroupCountX, workgroupCountY, workgroupCountZ]);
  }
  public dispatchIndirect(): void {
    void 0;
  }
  public end(): void {
    void 0;
  }
}

class MockEncoder implements RhiCommandEncoder {
  public readonly passes: MockComputePass[] = [];
  public beginRenderPass(): RhiRenderPass {
    throw new Error('not used');
  }
  public beginComputePass(): RhiComputePass {
    const pass = new MockComputePass();
    this.passes.push(pass);
    return pass;
  }
  public copyBufferToBuffer(): void {
    void 0;
  }
  public copyTextureToTexture(): void {
    void 0;
  }
  public copyBufferToTexture(): void {
    void 0;
  }
  public copyTextureToBuffer(): void {
    void 0;
  }
  public clearBuffer(): void {
    void 0;
  }
  public finish(): unknown {
    return {};
  }
}

class MockDevice implements RhiDevice {
  public readonly caps = {
    backend: 'webgpu' as const,
    compute: true,
    indirectDraw: true,
    storageBuffers: true,
    timestampQuery: false,
    floatRenderTarget: true,
    floatBlend: true,
    maxTextureSize: 4096,
    maxTextureArrayLayers: 64,
    maxStorageBufferBytes: 128 * 1024 * 1024,
    maxComputeWorkgroupSize: 256,
    maxComputeInvocationsPerWorkgroup: 256,
    minUniformBufferOffsetAlignment: 256,
    minStorageBufferOffsetAlignment: 256,
    textureCompressionBC7: false,
    textureCompressionETC2: false,
    textureCompressionASTC: false,
  };

  public writeBufferCallCount = 0;

  public createBuffer(desc: BufferDesc): RhiBuffer {
    return new MockBuffer(desc);
  }
  public createTexture(): RhiTexture {
    throw new Error('not used');
  }
  public createSampler(): RhiSampler {
    return { destroy: () => void 0 };
  }
  public createBindGroupLayout(): RhiBindGroupLayout {
    return { entries: [], destroy: () => void 0 };
  }
  public createBindGroup(desc: BindGroupDesc): RhiBindGroup {
    return { layout: desc.layout, destroy: () => void 0 };
  }
  public createRenderPipeline(): RhiRenderPipeline {
    return { label: '', destroy: () => void 0 };
  }
  public createComputePipeline(desc: ComputePipelineDesc): RhiComputePipeline {
    return { label: desc.computeShader.name, workgroupSize: [256, 1, 1], destroy: () => void 0 };
  }
  public createQuerySet(): RhiQuerySet | null {
    return null;
  }
  public writeBuffer(): void {
    this.writeBufferCallCount++;
  }
  public writeTexture(): void {
    void 0;
  }
  public readBufferAsync(): Promise<ArrayBuffer> {
    return Promise.resolve(new ArrayBuffer(0));
  }
  public createCommandEncoder(): RhiCommandEncoder {
    return new MockEncoder();
  }
  public submit(): void {
    void 0;
  }
  public getCurrentTexture(): RhiTexture {
    throw new Error('not used');
  }
  public resize(): void {
    void 0;
  }
  public readonly onDeviceLost = new EventEmitter<{ lost: { reason: string } }>();
  public destroy(): void {
    void 0;
  }
}

describe('GpuPrefixSum', () => {
  it('caps.compute が false の場合は UnsupportedFeature 例外を送出する', () => {
    const dev = new MockDevice();
    (dev.caps as { compute: boolean }).compute = false;

    expect(() => new GpuPrefixSum(dev)).toThrow(PlutoError);
    try {
      new GpuPrefixSum(dev);
    } catch (err) {
      expect((err as PlutoError).code).toBe(ErrorCode.UnsupportedFeature);
    }
  });

  it('maxElements の境界値検証が正しく機能する', () => {
    const dev = new MockDevice();
    expect(() => new GpuPrefixSum(dev, 0)).toThrow(PlutoError);
    expect(() => new GpuPrefixSum(dev, PREFIX_SUM_MAX_ELEMENTS + 1)).toThrow(PlutoError);

    const valid = new GpuPrefixSum(dev, 1024);
    expect(valid.maxElements).toBe(1024);
    expect(valid.maxBlocks).toBe(1);
  });

  it('createBindGroup でバインドグループが正常に構築される', () => {
    const dev = new MockDevice();
    const prefixSum = new GpuPrefixSum(dev, 4096);

    const inBuf = dev.createBuffer({ sizeBytes: 16384, usage: 1 });
    const outBuf = dev.createBuffer({ sizeBytes: 16384, usage: 1 });

    const bg = prefixSum.createBindGroup({ inputBuffer: inBuf, outputBuffer: outBuf });
    expect(bg).toBeDefined();
  });

  it('execute で 1 ブロック以下の場合は 1 回のディスパッチが実行される', () => {
    const dev = new MockDevice();
    const prefixSum = new GpuPrefixSum(dev, 4096);
    const inBuf = dev.createBuffer({ sizeBytes: 16384, usage: 1 });
    const outBuf = dev.createBuffer({ sizeBytes: 16384, usage: 1 });
    const bg = prefixSum.createBindGroup({ inputBuffer: inBuf, outputBuffer: outBuf });

    const encoder = new MockEncoder();
    prefixSum.execute(encoder, bg, PREFIX_SUM_BLOCK_SIZE);

    expect(encoder.passes).toHaveLength(1);
    expect(encoder.passes[0].dispatches).toEqual([[1, 1, 1]]);
  });

  it('execute で複数ブロックの場合は 3 回のディスパッチが実行される', () => {
    const dev = new MockDevice();
    const prefixSum = new GpuPrefixSum(dev, 8192);
    const inBuf = dev.createBuffer({ sizeBytes: 32768, usage: 1 });
    const outBuf = dev.createBuffer({ sizeBytes: 32768, usage: 1 });
    const bg = prefixSum.createBindGroup({ inputBuffer: inBuf, outputBuffer: outBuf });

    const encoder = new MockEncoder();
    // 3000 要素 = ceil(3000 / 1024) = 3 ブロック
    prefixSum.execute(encoder, bg, 3000);

    expect(encoder.passes).toHaveLength(1);
    const pass = encoder.passes[0];
    expect(pass.dispatches).toEqual([
      [3, 1, 1], // block_scan (3 ブロック)
      [1, 1, 1], // scan_block_sums (1 ワークグループ)
      [3, 1, 1], // add_block_sums (3 ブロック)
    ]);
  });
});
