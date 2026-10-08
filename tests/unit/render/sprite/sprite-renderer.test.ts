/**
 * @file SpriteRenderer の単体テスト (docs/07-renderer.md §8, §9)
 */

import { describe, expect, it } from 'vitest';
import { World } from '../../../../src/core/ecs';
import {
  FLAG_VISIBLE,
  packSprite,
  Sprite,
  SpriteBuffer,
  SpriteRenderer,
  SpriteSlot,
} from '../../../../src/render';
import { FrameTable } from '../../../../src/render/texture/frame-table';
import type {
  BindGroupDesc,
  BufferDesc,
  RhiBindGroup,
  RhiBindGroupLayout,
  RhiBuffer,
  RhiCommandEncoder,
  RhiComputePipeline,
  RhiDevice,
  RhiQuerySet,
  RhiRenderPass,
  RhiRenderPipeline,
  RhiSampler,
  RhiTexture,
  TextureDesc,
} from '../../../../src/rhi';
import { EventEmitter } from '../../../../src/core/events';
import { WorldTransform } from '../../../../src/transform';

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

class MockTexture implements RhiTexture {
  public readonly width: number;
  public readonly height: number;
  public readonly layers: number;
  public readonly format: number;
  public readonly usage: number;
  public readonly dimension: number;
  public readonly label: string;
  public constructor(desc: TextureDesc) {
    this.width = desc.width;
    this.height = desc.height;
    this.layers = desc.layers;
    this.format = desc.format;
    this.usage = desc.usage;
    this.dimension = desc.dimension ?? 2;
    this.label = desc.label ?? '';
  }
  public destroy(): void {
    void 0;
  }
}

class MockRenderPass implements RhiRenderPass {
  public pipelines: RhiRenderPipeline[] = [];
  public bindGroups: { slot: number; group: RhiBindGroup }[] = [];
  public drawCalls: {
    vertexCount: number;
    instanceCount: number;
    firstVertex: number;
    firstInstance: number;
  }[] = [];

  public setPipeline(pipeline: RhiRenderPipeline): void {
    this.pipelines.push(pipeline);
  }
  public setBindGroup(slot: number, group: RhiBindGroup): void {
    this.bindGroups.push({ slot, group });
  }
  public setVertexBuffer(): void {
    void 0;
  }
  public setIndexBuffer(): void {
    void 0;
  }
  public setViewport(): void {
    void 0;
  }
  public setScissor(): void {
    void 0;
  }
  public draw(vertexCount: number, instanceCount = 1, firstVertex = 0, firstInstance = 0): void {
    this.drawCalls.push({ vertexCount, instanceCount, firstVertex, firstInstance });
  }
  public drawIndexed(): void {
    void 0;
  }
  public drawIndirect(): void {
    void 0;
  }
  public end(): void {
    void 0;
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
  public createTexture(desc: TextureDesc): RhiTexture {
    return new MockTexture(desc);
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
  public createComputePipeline(): RhiComputePipeline {
    return { label: '', workgroupSize: [1, 1, 1], destroy: () => void 0 };
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
    throw new Error('not used');
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

describe('SpriteRenderer', () => {
  it('初期化が成功し、各プロパティが設定される', () => {
    const device = new MockDevice();
    const spriteBuffer = new SpriteBuffer(128);
    const frameTable = new FrameTable(64);
    const colorTexture = new MockTexture({
      width: 2048,
      height: 2048,
      layers: 2,
      format: 0,
      usage: 1,
    });
    const compressedTexture = new MockTexture({
      width: 2048,
      height: 2048,
      layers: 1,
      format: 0,
      usage: 1,
    });

    const renderer = new SpriteRenderer(device, spriteBuffer, frameTable, {
      colorTexture,
      compressedTexture,
    });

    expect(renderer).toBeDefined();
    expect(renderer.device).toBe(device);
    expect(renderer.spriteBuffer).toBe(spriteBuffer);
    expect(renderer.frameTable).toBe(frameTable);
  });

  it('render 呼び出し時に flush およびパスの execute が行われる', () => {
    const device = new MockDevice();
    const spriteBuffer = new SpriteBuffer(128);
    const frameTable = new FrameTable(64);
    const colorTexture = new MockTexture({
      width: 2048,
      height: 2048,
      layers: 2,
      format: 0,
      usage: 1,
    });
    const compressedTexture = new MockTexture({
      width: 2048,
      height: 2048,
      layers: 1,
      format: 0,
      usage: 1,
    });

    const renderer = new SpriteRenderer(device, spriteBuffer, frameTable, {
      colorTexture,
      compressedTexture,
    });

    const world = new World();
    const e = world.spawn(WorldTransform, Sprite, SpriteSlot);
    world.set(e, WorldTransform.tx, 0);
    world.set(e, WorldTransform.ty, 0);
    world.set(e, WorldTransform.a, 1.0);
    world.set(e, WorldTransform.d, 1.0);
    world.set(e, Sprite.flags, FLAG_VISIBLE);
    world.set(e, SpriteSlot.slot, 0);
    packSprite(
      spriteBuffer.u32View,
      spriteBuffer.f32View,
      0,
      0,
      0,
      1,
      1,
      0,
      0,
      0,
      0,
      FLAG_VISIBLE,
      0,
    );

    const pass = new MockRenderPass();
    const cameraData = new Float32Array(16);
    const cullRect = [-100, -100, 100, 100] as const;

    renderer.render(pass, cameraData, cullRect, world);

    // Alpha スプライトが 1 つ描画される
    expect(pass.drawCalls.length).toBe(1);
    expect(pass.drawCalls[0]).toEqual({
      vertexCount: 6,
      instanceCount: 1,
      firstVertex: 0,
      firstInstance: 0,
    });
  });
});
