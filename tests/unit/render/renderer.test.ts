/**
 * @file Renderer の単体テスト (docs/07-renderer.md §12)
 */
import { describe, expect, it } from 'vitest';
import { EventEmitter } from '../../../src/core/events';
import { World } from '../../../src/core/ecs';
import { Renderer } from '../../../src/render/renderer';
import { SpriteRenderer } from '../../../src/render/sprite/sprite-renderer';
import { SpriteBuffer } from '../../../src/render/sprite/sprite-buffer';
import { FrameTable } from '../../../src/render/texture/frame-table';
import {
  TextureDimension,
  TextureFormat,
  type BindGroupDesc,
  type BindGroupLayoutDesc,
  type BufferDesc,
  type RenderPipelineDesc,
  type RhiBindGroup,
  type RhiBindGroupLayout,
  type RhiBuffer,
  type RhiCapabilities,
  type RhiCommandEncoder,
  type RhiComputePipeline,
  type RhiDevice,
  type RhiQuerySet,
  type RhiRenderPass,
  type RhiRenderPipeline,
  type RhiSampler,
  type RhiTexture,
  type TextureDesc,
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

class MockDeviceForRenderer implements RhiDevice {
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
  public readonly submitted: RhiCommandEncoder[] = [];
  public renderPassCount = 0;

  private readonly currentTexture = new MockTexture({
    width: 800,
    height: 600,
    format: TextureFormat.RGBA8Unorm,
    usage: 0,
    layers: 1,
  });

  public createBuffer(desc: BufferDesc): RhiBuffer {
    return new MockBuffer(desc);
  }
  public createTexture(desc: TextureDesc): RhiTexture {
    return new MockTexture(desc);
  }
  public createBindGroupLayout(desc: BindGroupLayoutDesc): RhiBindGroupLayout {
    return { entries: desc.entries, destroy: () => void 0 };
  }
  public createBindGroup(desc: BindGroupDesc): RhiBindGroup {
    return { layout: desc.layout, destroy: () => void 0 };
  }
  public createSampler(): RhiSampler {
    return { destroy: () => void 0 };
  }
  public createRenderPipeline(desc: RenderPipelineDesc): RhiRenderPipeline {
    return { label: desc.vertexShader.name, destroy: () => void 0 };
  }
  public createComputePipeline(): RhiComputePipeline {
    throw new Error('unused in test');
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
    const dummyRenderPass: RhiRenderPass = {
      setPipeline: () => void 0,
      setBindGroup: () => void 0,
      setViewport: () => void 0,
      setScissor: () => void 0,
      draw: () => void 0,
      drawIndirect: () => void 0,
      end: () => void 0,
    };
    return {
      beginRenderPass: () => {
        this.renderPassCount++;
        return dummyRenderPass;
      },
      beginComputePass: () => {
        throw new Error('unused');
      },
      copyBufferToBuffer: () => void 0,
      clearBuffer: () => void 0,
    };
  }
  public submit(encoder: RhiCommandEncoder): void {
    this.submitted.push(encoder);
  }
  public getCurrentTexture(): RhiTexture {
    return this.currentTexture;
  }
  public resize(): void {
    void 0;
  }
  public destroy(): void {
    void 0;
  }
}

function createTestSpriteRenderer(device: RhiDevice): {
  spriteRenderer: SpriteRenderer;
  calls: { flushed: boolean; renderCount: number };
} {
  const spriteBuffer = new SpriteBuffer(64);
  const frameTable = new FrameTable();
  const dummyTex = device.createTexture({
    width: 16,
    height: 16,
    format: TextureFormat.RGBA8Unorm,
    usage: 0,
    layers: 1,
  });

  const calls = { flushed: false, renderCount: 0 };
  const origFlush = spriteBuffer.flushToGpu.bind(spriteBuffer);
  spriteBuffer.flushToGpu = (d: RhiDevice): void => {
    calls.flushed = true;
    origFlush(d);
  };

  const spriteRenderer = new SpriteRenderer(
    device,
    spriteBuffer,
    frameTable,
    { colorTexture: dummyTex, compressedTexture: dummyTex },
    { maxSprites: 64, forceCpuAssisted: true },
  );

  const origRender = spriteRenderer.render.bind(spriteRenderer);
  spriteRenderer.render = (pass, cameraData, cullRect, world, encoder): void => {
    calls.renderCount++;
    origRender(pass, cameraData, cullRect, world, encoder);
  };

  return { spriteRenderer, calls };
}

describe('Renderer', () => {
  it('初期化時にメインカメラ 0 が設定され、スプライト描画パスが登録される', () => {
    const device = new MockDeviceForRenderer();
    const { spriteRenderer, calls } = createTestSpriteRenderer(device);

    const renderer = new Renderer(device, spriteRenderer, { width: 1024, height: 768 });

    expect(renderer.cameraStore.isActive(0)).toBe(true);
    expect(renderer.cameraStore.activeCount).toBe(1);
    expect(renderer.graph.getPass('sprite:draw')).toBeDefined();

    const world = new World();
    renderer.render(world);

    expect(calls.flushed).toBe(true);
    expect(calls.renderCount).toBe(1);

    renderer.destroy();
  });

  it('複数カメラが有効な場合は各カメラのパスが実行される', () => {
    const device = new MockDeviceForRenderer();
    const { spriteRenderer, calls } = createTestSpriteRenderer(device);

    const renderer = new Renderer(device, spriteRenderer);

    // カメラ 1 を追加
    const cam1 = renderer.cameraStore.allocate(400, 300);
    renderer.cameraStore.setViewport(cam1, 400, 0, 400, 300);

    const world = new World();
    renderer.render(world);

    expect(calls.renderCount).toBe(2);
    expect(device.submitted.length).toBe(1);

    renderer.destroy();
  });

  it('resize でビューポートが更新される', () => {
    const device = new MockDeviceForRenderer();
    const { spriteRenderer } = createTestSpriteRenderer(device);

    const renderer = new Renderer(device, spriteRenderer, { width: 800, height: 600 });
    renderer.resize(1920, 1080);

    const vp = { x: 0, y: 0, width: 0, height: 0 };
    renderer.cameraStore.getViewport(0, vp);
    expect(vp.width).toBe(1920);
    expect(vp.height).toBe(1080);

    renderer.destroy();
  });
});
