/**
 * @file RenderGraph および TransientPool の単体テスト (docs/07-renderer.md §12)
 */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_PASS_ORDER,
  getPassOrderIndex,
  RenderGraph,
} from '../../../../src/render/graph/render-graph';
import type {
  RenderPassContext,
  RenderPassNode,
} from '../../../../src/render/graph/render-pass-node';
import { TransientPool } from '../../../../src/render/graph/transient-pool';
import { CameraStore } from '../../../../src/render/camera/camera-store';
import { CameraUniforms } from '../../../../src/render/camera/camera-uniforms';
import { EventEmitter } from '../../../../src/core/events';
import {
  TextureDimension,
  TextureFormat,
  TextureUsage,
  type BindGroupDesc,
  type BindGroupLayoutDesc,
  type BufferDesc,
  type RhiBindGroup,
  type RhiBindGroupLayout,
  type RhiBuffer,
  type RhiCapabilities,
  type RhiCommandEncoder,
  type RhiComputePipeline,
  type RhiDevice,
  type RhiQuerySet,
  type RhiRenderPipeline,
  type RhiSampler,
  type RhiTexture,
  type TextureDesc,
} from '../../../../src/rhi';

class MockTexture implements RhiTexture {
  public readonly width: number;
  public readonly height: number;
  public readonly format: number;
  public readonly usage: number;
  public readonly dimension: number;
  public readonly layers: number;
  public readonly label: string;

  public constructor(desc: TextureDesc) {
    this.width = desc.width;
    this.height = desc.height;
    this.format = desc.format;
    this.usage = desc.usage;
    this.dimension = desc.dimension ?? TextureDimension.D2;
    this.layers = desc.layers;
    this.label = desc.label ?? '';
  }

  public destroy(): void {
    void 0;
  }
}

class MockDeviceForGraph implements RhiDevice {
  public readonly caps: RhiCapabilities = {
    backend: 'webgpu',
    compute: true,
    indirectDraw: true,
    storageBuffers: true,
    timestampQuery: true,
    floatRenderTarget: true,
    floatBlend: true,
    maxTextureSize: 8192,
    maxTextureArrayLayers: 64,
    maxStorageBufferBytes: 134217728,
    maxComputeWorkgroupSize: 256,
    maxComputeInvocationsPerWorkgroup: 256,
    minUniformBufferOffsetAlignment: 256,
    minStorageBufferOffsetAlignment: 256,
    textureCompressionBC7: false,
    textureCompressionETC2: false,
    textureCompressionASTC: false,
  };
  public readonly onDeviceLost = new EventEmitter<{ lost: { reason: string } }>();
  public createdTextureCount = 0;

  public createTexture(desc: TextureDesc): RhiTexture {
    this.createdTextureCount++;
    return new MockTexture(desc);
  }

  public createBuffer(desc: BufferDesc): RhiBuffer {
    return {
      label: desc.label ?? '',
      sizeBytes: desc.sizeBytes,
      usage: desc.usage,
      destroy: () => void 0,
    };
  }
  public createSampler(): RhiSampler {
    throw new Error('unused');
  }
  public createBindGroupLayout(desc: BindGroupLayoutDesc): RhiBindGroupLayout {
    return { entries: desc.entries, destroy: () => void 0 };
  }
  public createBindGroup(desc: BindGroupDesc): RhiBindGroup {
    return { layout: desc.layout, destroy: () => void 0 };
  }
  public createRenderPipeline(): RhiRenderPipeline {
    throw new Error('unused');
  }
  public createComputePipeline(): RhiComputePipeline {
    throw new Error('unused');
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
    throw new Error('unused');
  }
  public submit(): void {
    void 0;
  }
  public getCurrentTexture(): RhiTexture {
    throw new Error('unused');
  }
  public resize(): void {
    void 0;
  }
  public destroy(): void {
    void 0;
  }
}

describe('TransientPool', () => {
  it('同一仕様のテクスチャを再利用する', () => {
    const mockDevice = new MockDeviceForGraph();
    const pool = new TransientPool(mockDevice);
    const desc: TextureDesc = {
      width: 256,
      height: 256,
      format: TextureFormat.RGBA8Unorm,
      usage: TextureUsage.RenderAttachment | TextureUsage.TextureBinding,
      dimension: TextureDimension.D2,
      layers: 1,
    };

    const tex1 = pool.acquire(desc);
    expect(mockDevice.createdTextureCount).toBe(1);

    // 返却前にもう 1 つ acquire すると新規作成
    const tex2 = pool.acquire(desc);
    expect(mockDevice.createdTextureCount).toBe(2);
    expect(tex1).not.toBe(tex2);

    // tex1 を release
    pool.release(tex1);

    // 再度 acquire すると tex1 が再利用される
    const tex3 = pool.acquire(desc);
    expect(mockDevice.createdTextureCount).toBe(2);
    expect(tex3).toBe(tex1);

    // reset で全解放
    pool.reset();
    const tex4 = pool.acquire(desc);
    expect(mockDevice.createdTextureCount).toBe(2);
    expect(tex4).toBe(tex1);

    pool.destroy();
  });
});

describe('RenderGraph', () => {
  it('既定パス順序定数が定義されている', () => {
    expect(DEFAULT_PASS_ORDER).toEqual([
      'sim',
      'sprite:cull',
      'tilemap:draw',
      'sprite:draw',
      'text:draw',
      'graphics:draw',
      'lighting',
      'camera:fx',
      'post',
      'present',
    ]);

    expect(getPassOrderIndex('sim:particles')).toBe(0);
    expect(getPassOrderIndex('sprite:cull')).toBe(1);
    expect(getPassOrderIndex('sprite:draw')).toBe(3);
    expect(getPassOrderIndex('unknown')).toBe(DEFAULT_PASS_ORDER.length);
  });

  it('addPassInOrder で既定の優先順位順にパスが挿入・実行される', () => {
    const graph = new RenderGraph();
    const executed: string[] = [];

    const makePass = (name: string): RenderPassNode => ({
      name,
      execute: () => {
        executed.push(name);
      },
    });

    // 順不同で登録
    graph.addPassInOrder(makePass('post:bloom'));
    graph.addPassInOrder(makePass('sprite:draw'));
    graph.addPassInOrder(makePass('sim:fluids'));
    graph.addPassInOrder(makePass('camera:fx'));

    const passes = graph.getPasses().map((p) => p.name);
    expect(passes).toEqual(['sim:fluids', 'sprite:draw', 'camera:fx', 'post:bloom']);

    const dummyEncoder: RhiCommandEncoder = {
      beginRenderPass: () => {
        throw new Error('unused');
      },
      beginComputePass: () => {
        throw new Error('unused');
      },
      copyBufferToBuffer: () => void 0,
      clearBuffer: () => void 0,
    };

    const mockDevice = new MockDeviceForGraph();
    const targetTexture = new MockTexture({
      width: 256,
      height: 256,
      format: TextureFormat.RGBA8Unorm,
      usage: TextureUsage.RenderAttachment,
      dimension: TextureDimension.D2,
      layers: 1,
    });
    const pool = new TransientPool(mockDevice);
    const cameraStore = new CameraStore();
    const cameraUniforms = new CameraUniforms(mockDevice);

    const dummyCtx: RenderPassContext = {
      device: mockDevice,
      cameraStore,
      cameraUniforms,
      transientPool: pool,
      currentCameraId: 0,
      targetTexture,
      getResource: () => undefined,
      setResource: () => void 0,
    };
    graph.execute(dummyEncoder, dummyCtx);

    expect(executed).toEqual(['sim:fluids', 'sprite:draw', 'camera:fx', 'post:bloom']);
  });
});
