/**
 * @file sprite-path-gpu-driven の単体テスト (docs/07-renderer.md §8, docs/12-roadmap.md T-4.6)
 */

import { describe, expect, it } from 'vitest';
import { ErrorCode, PlutoError } from '../../../../src/core/debug';
import { EventEmitter } from '../../../../src/core/events';
import { SpriteBuffer, SpritePathGpuDriven } from '../../../../src/render';
import { FrameTable } from '../../../../src/render/texture/frame-table';
import type {
  BindGroupDesc,
  BufferDesc,
  ComputePipelineDesc,
  RenderPipelineDesc,
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
} from '../../../../src/rhi';

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

class MockRenderPass implements RhiRenderPass {
  public pipelines: RhiRenderPipeline[] = [];
  public bindGroups: { slot: number; group: RhiBindGroup }[] = [];
  public indirectDraws: [RhiBuffer, number][] = [];

  public setPipeline(pipeline: RhiRenderPipeline): void {
    this.pipelines.push(pipeline);
  }
  public setBindGroup(slot: number, group: RhiBindGroup): void {
    this.bindGroups.push({ slot, group });
  }
  public setViewport(): void {
    void 0;
  }
  public setScissor(): void {
    void 0;
  }
  public draw(): void {
    void 0;
  }
  public drawIndirect(args: RhiBuffer, offsetBytes: number): void {
    this.indirectDraws.push([args, offsetBytes]);
  }
  public end(): void {
    void 0;
  }
}

class MockEncoder implements RhiCommandEncoder {
  public readonly computePasses: MockComputePass[] = [];
  public readonly renderPasses: MockRenderPass[] = [];

  public beginRenderPass(): RhiRenderPass {
    const pass = new MockRenderPass();
    this.renderPasses.push(pass);
    return pass;
  }
  public beginComputePass(): RhiComputePass {
    const pass = new MockComputePass();
    this.computePasses.push(pass);
    return pass;
  }
  public copyBufferToBuffer(): void {
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
    return {
      width: 2048,
      height: 2048,
      dimension: 1,
      layers: 4,
      usage: 4,
      label: '',
      format: 0,
      destroy: () => void 0,
    };
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
  public createRenderPipeline(desc: RenderPipelineDesc): RhiRenderPipeline {
    return { label: desc.vertexShader.name, destroy: () => void 0 };
  }
  public createComputePipeline(desc: ComputePipelineDesc): RhiComputePipeline {
    return {
      label: desc.computeShader.name,
      workgroupSize: desc.workgroupSize,
      destroy: () => void 0,
    };
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

describe('SpritePathGpuDriven', () => {
  function createFixture(overrides?: { compute?: boolean; indirectDraw?: boolean }) {
    const dev = new MockDevice();
    if (overrides?.compute !== undefined) {
      (dev.caps as { compute: boolean }).compute = overrides.compute;
    }
    if (overrides?.indirectDraw !== undefined) {
      (dev.caps as { indirectDraw: boolean }).indirectDraw = overrides.indirectDraw;
    }

    const sb = new SpriteBuffer(1024);
    const ft = new FrameTable(64);
    const texs = {
      colorTexture: dev.createTexture(),
      compressedTexture: dev.createTexture(),
    };

    return { dev, sb, ft, texs };
  }

  it('caps.compute が false の場合は UnsupportedFeature 例外を送出する', () => {
    const { dev, sb, ft, texs } = createFixture({ compute: false });
    expect(() => new SpritePathGpuDriven(dev, 1024, sb, ft, texs)).toThrow(PlutoError);
    try {
      new SpritePathGpuDriven(dev, 1024, sb, ft, texs);
    } catch (e) {
      expect((e as PlutoError).code).toBe(ErrorCode.UnsupportedFeature);
    }
  });

  it('caps.indirectDraw が false の場合は UnsupportedFeature 例外を送出する', () => {
    const { dev, sb, ft, texs } = createFixture({ indirectDraw: false });
    expect(() => new SpritePathGpuDriven(dev, 1024, sb, ft, texs)).toThrow(PlutoError);
    try {
      new SpritePathGpuDriven(dev, 1024, sb, ft, texs);
    } catch (e) {
      expect((e as PlutoError).code).toBe(ErrorCode.UnsupportedFeature);
    }
  });

  it('highWater === 0 のときは早期リターンする', () => {
    const { dev, sb, ft, texs } = createFixture();
    const gpuPath = new SpritePathGpuDriven(dev, 1024, sb, ft, texs);

    const encoder = new MockEncoder();
    const renderPass = new MockRenderPass();

    gpuPath.execute(encoder, renderPass, 0);

    expect(encoder.computePasses).toHaveLength(0);
    expect(renderPass.indirectDraws).toHaveLength(0);
  });

  it('highWater <= 1024 (単一ブロック) のときに全コンピュートパスと間接描画が実行される', () => {
    const { dev, sb, ft, texs } = createFixture();
    const gpuPath = new SpritePathGpuDriven(dev, 1024, sb, ft, texs);

    const encoder = new MockEncoder();
    const renderPass = new MockRenderPass();

    gpuPath.execute(encoder, renderPass, 256);

    // 1 つのコンピュートパス (Reset, Cull, Scan, Scatter, SortKeys) + RadixSort の 24 パス
    expect(encoder.computePasses.length).toBeGreaterThan(1);
    const mainPass = encoder.computePasses[0];

    // Reset, Cull, Scan, Scatter で 4 回の dispatch
    expect(mainPass.dispatches).toHaveLength(4);
    // SortKeys で 1 回の dispatchIndirect
    expect(mainPass.indirectDispatches).toHaveLength(1);

    // レンダーパス: 3 ビン (Opaque, Alpha, Additive) の drawIndirect
    expect(renderPass.indirectDraws).toHaveLength(3);
    expect(renderPass.indirectDraws[0][1]).toBe(0);
    expect(renderPass.indirectDraws[1][1]).toBe(16);
    expect(renderPass.indirectDraws[2][1]).toBe(32);
  });

  it('highWater > 1024 (複数ブロック) のときに ScanSums と ScanAdd が実行される', () => {
    const { dev, sb, ft, texs } = createFixture();
    const gpuPath = new SpritePathGpuDriven(dev, 4096, sb, ft, texs);

    const encoder = new MockEncoder();
    const renderPass = new MockRenderPass();

    gpuPath.execute(encoder, renderPass, 2048);

    const mainPass = encoder.computePasses[0];
    // Reset (1), Cull (1), ScanBlock (1), ScanSums (1), ScanAdd (1), Scatter (1) = 6 回の dispatch
    expect(mainPass.dispatches).toHaveLength(6);
  });
});
