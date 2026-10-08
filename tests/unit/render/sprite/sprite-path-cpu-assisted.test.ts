/**
 * @file sprite-path-cpu-assisted の単体テスト (docs/07-renderer.md §9)
 */

import { describe, expect, it } from 'vitest';
import { World } from '../../../../src/core/ecs';
import {
  FLAG_ADDITIVE,
  FLAG_OPAQUE,
  FLAG_VISIBLE,
  packSprite,
  Sprite,
  SpriteBuffer,
  SpritePathCpuAssisted,
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
    void 0;
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

describe('SpritePathCpuAssisted', () => {
  it('初期化が成功し、各リソースとパイプラインが構築される', () => {
    const device = new MockDevice();
    const spriteBuffer = new SpriteBuffer(256);
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

    const path = new SpritePathCpuAssisted(device, 256, spriteBuffer, frameTable, {
      colorTexture,
      compressedTexture,
    });

    expect(path).toBeDefined();
    expect(path.maxSprites).toBe(256);
  });

  it('sortAlphaBin が layer と sortKey の昇順に正しく基数ソートする', () => {
    const device = new MockDevice();
    const maxSprites = 64;
    const spriteBuffer = new SpriteBuffer(maxSprites);
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

    const path = new SpritePathCpuAssisted(device, maxSprites, spriteBuffer, frameTable, {
      colorTexture,
      compressedTexture,
    });

    // 4 つのスロットにスプライトデータをパック
    // slot 0: layer 5, sortKey 0.2
    // slot 1: layer 1, sortKey 0.9
    // slot 2: layer 5, sortKey 0.1
    // slot 3: layer 10, sortKey 0.0
    packSprite(
      spriteBuffer.u32View,
      spriteBuffer.f32View,
      0,
      0,
      0,
      1,
      1,
      0,
      5,
      0,
      0,
      FLAG_VISIBLE,
      0.2,
    );
    packSprite(
      spriteBuffer.u32View,
      spriteBuffer.f32View,
      1,
      0,
      0,
      1,
      1,
      0,
      1,
      0,
      0,
      FLAG_VISIBLE,
      0.9,
    );
    packSprite(
      spriteBuffer.u32View,
      spriteBuffer.f32View,
      2,
      0,
      0,
      1,
      1,
      0,
      5,
      0,
      0,
      FLAG_VISIBLE,
      0.1,
    );
    packSprite(
      spriteBuffer.u32View,
      spriteBuffer.f32View,
      3,
      0,
      0,
      1,
      1,
      0,
      10,
      0,
      0,
      FLAG_VISIBLE,
      0.0,
    );

    // cullOutput の Alpha ビン (オフセット maxSprites = 64) に初期登録
    const cullOutput = path.cullOutput;
    cullOutput[64 + 0] = 0;
    cullOutput[64 + 1] = 1;
    cullOutput[64 + 2] = 2;
    cullOutput[64 + 3] = 3;

    path.sortAlphaBin(4, spriteBuffer);
    expect(Array.from(cullOutput.slice(64, 68))).toEqual([1, 2, 0, 3]);
  });

  it('execute がカリング・ソート・描画コマンド (Opaque / Alpha / Additive) を正しく発行する', () => {
    const device = new MockDevice();
    const maxSprites = 64;
    const spriteBuffer = new SpriteBuffer(maxSprites);
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

    const path = new SpritePathCpuAssisted(device, maxSprites, spriteBuffer, frameTable, {
      colorTexture,
      compressedTexture,
    });

    const world = new World();
    // 1. Opaque スプライト (画面内)
    const eOpaque = world.spawn(WorldTransform, Sprite, SpriteSlot);
    world.set(eOpaque, WorldTransform.tx, 0);
    world.set(eOpaque, WorldTransform.ty, 0);
    world.set(eOpaque, WorldTransform.a, 1.0);
    world.set(eOpaque, WorldTransform.d, 1.0);
    world.set(eOpaque, Sprite.flags, FLAG_VISIBLE | FLAG_OPAQUE);
    world.set(eOpaque, SpriteSlot.slot, 0);
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
      FLAG_VISIBLE | FLAG_OPAQUE,
      0,
    );

    // 2. Alpha スプライト (画面内)
    const eAlpha = world.spawn(WorldTransform, Sprite, SpriteSlot);
    world.set(eAlpha, WorldTransform.tx, 50);
    world.set(eAlpha, WorldTransform.ty, 50);
    world.set(eAlpha, WorldTransform.a, 1.0);
    world.set(eAlpha, WorldTransform.d, 1.0);
    world.set(eAlpha, Sprite.flags, FLAG_VISIBLE);
    world.set(eAlpha, SpriteSlot.slot, 1);
    packSprite(
      spriteBuffer.u32View,
      spriteBuffer.f32View,
      1,
      50,
      50,
      1,
      1,
      0,
      0,
      0,
      0,
      FLAG_VISIBLE,
      0.5,
    );

    // 3. Additive スプライト (画面内)
    const eAdditive = world.spawn(WorldTransform, Sprite, SpriteSlot);
    world.set(eAdditive, WorldTransform.tx, -50);
    world.set(eAdditive, WorldTransform.ty, -50);
    world.set(eAdditive, WorldTransform.a, 1.0);
    world.set(eAdditive, WorldTransform.d, 1.0);
    world.set(eAdditive, Sprite.flags, FLAG_VISIBLE | FLAG_ADDITIVE);
    world.set(eAdditive, SpriteSlot.slot, 2);
    packSprite(
      spriteBuffer.u32View,
      spriteBuffer.f32View,
      2,
      -50,
      -50,
      1,
      1,
      0,
      0,
      0,
      0,
      FLAG_VISIBLE | FLAG_ADDITIVE,
      0,
    );

    // 4. カリングされるスプライト (画面外)
    const eCulled = world.spawn(WorldTransform, Sprite, SpriteSlot);
    world.set(eCulled, WorldTransform.tx, 1000);
    world.set(eCulled, WorldTransform.ty, 1000);
    world.set(eCulled, WorldTransform.a, 1.0);
    world.set(eCulled, WorldTransform.d, 1.0);
    world.set(eCulled, Sprite.flags, FLAG_VISIBLE);
    world.set(eCulled, SpriteSlot.slot, 3);
    packSprite(
      spriteBuffer.u32View,
      spriteBuffer.f32View,
      3,
      1000,
      1000,
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

    path.execute(pass, world, spriteBuffer, cameraData, cullRect);

    // 各ビンの描画コールが発行されていることを検証
    expect(pass.drawCalls.length).toBe(3);
    // Opaque (1 個)
    expect(pass.drawCalls[0]).toEqual({
      vertexCount: 6,
      instanceCount: 1,
      firstVertex: 0,
      firstInstance: 0,
    });
    // Alpha (1 個)
    expect(pass.drawCalls[1]).toEqual({
      vertexCount: 6,
      instanceCount: 1,
      firstVertex: 0,
      firstInstance: 0,
    });
    // Additive (1 個)
    expect(pass.drawCalls[2]).toEqual({
      vertexCount: 6,
      instanceCount: 1,
      firstVertex: 0,
      firstInstance: 0,
    });
  });

  it('WebGL2 バックエンド時でも正常に初期化され execute できる', () => {
    const device = new MockDevice();
    // backend を webgl2 に書き換え
    (device.caps as { backend: 'webgl2' | 'webgpu' }).backend = 'webgl2';

    const maxSprites = 64;
    const spriteBuffer = new SpriteBuffer(maxSprites);
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

    const path = new SpritePathCpuAssisted(device, maxSprites, spriteBuffer, frameTable, {
      colorTexture,
      compressedTexture,
    });

    const world = new World();
    const eOpaque = world.spawn(WorldTransform, Sprite, SpriteSlot);
    world.set(eOpaque, WorldTransform.tx, 0);
    world.set(eOpaque, WorldTransform.ty, 0);
    world.set(eOpaque, WorldTransform.a, 1.0);
    world.set(eOpaque, WorldTransform.d, 1.0);
    world.set(eOpaque, Sprite.flags, FLAG_VISIBLE | FLAG_OPAQUE);
    world.set(eOpaque, SpriteSlot.slot, 0);

    const pass = new MockRenderPass();
    const cameraData = new Float32Array(16);
    const cullRect = [-100, -100, 100, 100] as const;

    path.execute(pass, world, spriteBuffer, cameraData, cullRect);

    expect(pass.drawCalls.length).toBe(1);
    expect(pass.drawCalls[0]).toEqual({
      vertexCount: 6,
      instanceCount: 1,
      firstVertex: 0,
      firstInstance: 0,
    });
  });
});
