/**
 * @file GpuRadixSort の単体テスト (docs/07-renderer.md §8, docs/10-testing-strategy.md §4)。
 */

import { describe, expect, it } from 'vitest';
import { ErrorCode, PlutoError } from '../../../src/core/debug';
import { EventEmitter } from '../../../src/core/events';
import {
  GpuRadixSort,
  RADIX_SORT_BLOCK_SIZE,
  RADIX_SORT_MAX_ELEMENTS,
  RADIX_SORT_PASSES,
} from '../../../src/compute';
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
  public indirectDispatches: [RhiBuffer, number][] = [];

  public setPipeline(pipeline: RhiComputePipeline): void {
    this.pipelines.push(pipeline);
  }
  public setBindGroup(slot: number, group: RhiBindGroup): void {
    this.bindGroups.push({ slot, group });
  }
  public dispatch(workgroupCountX: number, workgroupCountY = 1, workgroupCountZ = 1): void {
    this.dispatches.push([workgroupCountX, workgroupCountY, workgroupCountZ]);
  }
  public dispatchIndirect(indirectBuffer: RhiBuffer, indirectOffsetBytes = 0): void {
    this.indirectDispatches.push([indirectBuffer, indirectOffsetBytes]);
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

describe('GpuRadixSort', () => {
  it('caps.compute が false の場合は UnsupportedFeature 例外を送出する', () => {
    const dev = new MockDevice();
    (dev.caps as { compute: boolean }).compute = false;

    expect(() => new GpuRadixSort(dev)).toThrow(PlutoError);
    try {
      new GpuRadixSort(dev);
    } catch (err) {
      expect((err as PlutoError).code).toBe(ErrorCode.UnsupportedFeature);
    }
  });

  it('maxElements の境界値検証が正しく機能する', () => {
    const dev = new MockDevice();
    expect(() => new GpuRadixSort(dev, 0)).toThrow(PlutoError);
    expect(() => new GpuRadixSort(dev, RADIX_SORT_MAX_ELEMENTS + 1)).toThrow(PlutoError);

    const valid = new GpuRadixSort(dev, 2048);
    expect(valid.maxElements).toBe(2048);
    expect(valid.maxBlocks).toBe(2);
  });

  it('createBindGroups で forward/backward のバインドグループが構築される', () => {
    const dev = new MockDevice();
    const radixSort = new GpuRadixSort(dev, 4096);

    const b = {
      keys: dev.createBuffer({ sizeBytes: 16384, usage: 1 }),
      values: dev.createBuffer({ sizeBytes: 16384, usage: 1 }),
      scratchKeys: dev.createBuffer({ sizeBytes: 16384, usage: 1 }),
      scratchValues: dev.createBuffer({ sizeBytes: 16384, usage: 1 }),
    };

    const bgs = radixSort.createBindGroups(b);
    expect(bgs.forward).toBeDefined();
    expect(bgs.backward).toBeDefined();
  });

  it('execute で 8 パスの Histogram, PrefixSum, Scatter が実行される', () => {
    const dev = new MockDevice();
    const radixSort = new GpuRadixSort(dev, 4096);
    const b = {
      keys: dev.createBuffer({ sizeBytes: 16384, usage: 1 }),
      values: dev.createBuffer({ sizeBytes: 16384, usage: 1 }),
      scratchKeys: dev.createBuffer({ sizeBytes: 16384, usage: 1 }),
      scratchValues: dev.createBuffer({ sizeBytes: 16384, usage: 1 }),
    };
    const bgs = radixSort.createBindGroups(b);

    const encoder = new MockEncoder();
    radixSort.execute(encoder, bgs, RADIX_SORT_BLOCK_SIZE);

    // 8 パス × (Histogram 1 pass + PrefixSum 1 pass + Scatter 1 pass) = 24 passes
    expect(encoder.passes).toHaveLength(RADIX_SORT_PASSES * 3);
  });

  it('executeIndirect で dispatchWorkgroupsIndirect が正しく呼ばれる', () => {
    const dev = new MockDevice();
    const radixSort = new GpuRadixSort(dev, 4096);
    const b = {
      keys: dev.createBuffer({ sizeBytes: 16384, usage: 1 }),
      values: dev.createBuffer({ sizeBytes: 16384, usage: 1 }),
      scratchKeys: dev.createBuffer({ sizeBytes: 16384, usage: 1 }),
      scratchValues: dev.createBuffer({ sizeBytes: 16384, usage: 1 }),
    };
    const bgs = radixSort.createBindGroups(b);
    const indirectBuf = dev.createBuffer({ sizeBytes: 16, usage: 1 });

    const encoder = new MockEncoder();
    radixSort.executeIndirect(encoder, bgs, RADIX_SORT_BLOCK_SIZE, indirectBuf, 0);

    expect(encoder.passes).toHaveLength(RADIX_SORT_PASSES * 3);
    // 最初のパス (Histogram) が indirectDispatch を呼んでいるか確認
    expect(encoder.passes[0].indirectDispatches).toEqual([[indirectBuf, 0]]);
  });
});
