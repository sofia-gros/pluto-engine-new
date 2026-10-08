/**
 * @file CameraUniforms の単体テスト (docs/07-renderer.md §6)
 */
import { describe, expect, it } from 'vitest';
import { CameraStore } from '../../../../src/render/camera/camera-store';
import {
  CameraUniforms,
  CAMERA_UNIFORM_STRIDE_BYTES,
  CAMERA_UNIFORM_STRIDE_FLOATS,
} from '../../../../src/render/camera/camera-uniforms';
import { MAX_CAMERAS } from '../../../../src/render/render-constants';
import { EventEmitter } from '../../../../src/core/events';
import type {
  BindGroupDesc,
  BindGroupLayoutDesc,
  BufferDesc,
  RhiBindGroup,
  RhiBindGroupLayout,
  RhiBuffer,
  RhiCapabilities,
  RhiCommandEncoder,
  RhiComputePipeline,
  RhiDevice,
  RhiQuerySet,
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

class MockDevice implements RhiDevice {
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
  public readonly writtenBuffers: { buffer: RhiBuffer; offset: number; data: Uint8Array }[] = [];

  public createBuffer(desc: BufferDesc): RhiBuffer {
    return new MockBuffer(desc);
  }
  public createBindGroupLayout(desc: BindGroupLayoutDesc): RhiBindGroupLayout {
    return { entries: desc.entries, destroy: () => void 0 };
  }
  public createBindGroup(desc: BindGroupDesc): RhiBindGroup {
    return { layout: desc.layout, destroy: () => void 0 };
  }
  public writeBuffer(buffer: RhiBuffer, offsetBytes: number, data: ArrayBufferView): void {
    const u8 = new Uint8Array(data.buffer, data.byteOffset, data.byteLength);
    this.writtenBuffers.push({ buffer, offset: offsetBytes, data: new Uint8Array(u8) });
  }
  public createTexture(): RhiTexture {
    throw new Error('unused in test');
  }
  public createSampler(): RhiSampler {
    throw new Error('unused in test');
  }
  public createRenderPipeline(): RhiRenderPipeline {
    throw new Error('unused in test');
  }
  public createComputePipeline(): RhiComputePipeline {
    throw new Error('unused in test');
  }
  public createQuerySet(): RhiQuerySet | null {
    return null;
  }
  public writeTexture(): void {
    void 0;
  }
  public readBufferAsync(): Promise<ArrayBuffer> {
    return Promise.resolve(new ArrayBuffer(0));
  }
  public createCommandEncoder(): RhiCommandEncoder {
    throw new Error('unused in test');
  }
  public submit(): void {
    void 0;
  }
  public getCurrentTexture(): RhiTexture {
    throw new Error('unused in test');
  }
  public resize(): void {
    void 0;
  }
  public destroy(): void {
    void 0;
  }
}

describe('CameraUniforms', () => {
  it('初期化時にバッファとバインドグループが作成される', () => {
    const device = new MockDevice();
    const uniforms = new CameraUniforms(device);

    expect(uniforms.buffer.sizeBytes).toBe(MAX_CAMERAS * CAMERA_UNIFORM_STRIDE_BYTES);
    expect(uniforms.bindGroups.length).toBe(MAX_CAMERAS);
    expect(uniforms.staging.length).toBe(MAX_CAMERAS * CAMERA_UNIFORM_STRIDE_FLOATS);

    uniforms.destroy();
  });

  it('標準的な中心位置・画面サイズでのアフィン変換と cullRect の算出', () => {
    const device = new MockDevice();
    const uniforms = new CameraUniforms(device);
    const store = new CameraStore();

    const id = store.allocate(256, 256);
    store.setCenter(id, 128, 128);
    store.setViewport(id, 0, 0, 256, 256);

    uniforms.update(store, id);

    // staging の値を確認
    const offset = id * CAMERA_UNIFORM_STRIDE_FLOATS;
    // m00: 2/256
    expect(uniforms.staging[offset]).toBeCloseTo(2.0 / 256.0);
    // m10: 0
    expect(uniforms.staging[offset + 1]).toBeCloseTo(0.0);
    // m01: 0
    expect(uniforms.staging[offset + 2]).toBeCloseTo(0.0);
    // m11: -2/256
    expect(uniforms.staging[offset + 3]).toBeCloseTo(-2.0 / 256.0);
    // tx: -1.0
    expect(uniforms.staging[offset + 4]).toBeCloseTo(-1.0);
    // ty: 1.0
    expect(uniforms.staging[offset + 5]).toBeCloseTo(1.0);

    // cullRect: (0, 0, 256, 256)
    expect(uniforms.staging[offset + 8]).toBeCloseTo(0.0);
    expect(uniforms.staging[offset + 9]).toBeCloseTo(0.0);
    expect(uniforms.staging[offset + 10]).toBeCloseTo(256.0);
    expect(uniforms.staging[offset + 11]).toBeCloseTo(256.0);

    // screenResolution: (256, 256, 1/256, 1/256)
    expect(uniforms.staging[offset + 12]).toBeCloseTo(256.0);
    expect(uniforms.staging[offset + 13]).toBeCloseTo(256.0);
    expect(uniforms.staging[offset + 14]).toBeCloseTo(1.0 / 256.0);
    expect(uniforms.staging[offset + 15]).toBeCloseTo(1.0 / 256.0);

    // upload
    uniforms.upload();
    expect(device.writtenBuffers.length).toBe(1);
    expect(device.writtenBuffers[0]?.offset).toBe(id * CAMERA_UNIFORM_STRIDE_BYTES);
  });

  it('ズーム・回転時の cullRect 計算', () => {
    const device = new MockDevice();
    const uniforms = new CameraUniforms(device);
    const store = new CameraStore();

    const id = store.allocate(800, 600);
    store.setCenter(id, 0, 0);
    store.setZoom(id, 2.0, 2.0); // 2倍ズーム -> 表示範囲は半分 (400x300)
    store.setRotation(id, 0);

    uniforms.update(store, id);
    const offset = id * CAMERA_UNIFORM_STRIDE_FLOATS;
    // 画面中心 (0, 0) で幅400, 高さ300 -> [-200, -150, 200, 150]
    expect(uniforms.staging[offset + 8]).toBeCloseTo(-200);
    expect(uniforms.staging[offset + 9]).toBeCloseTo(-150);
    expect(uniforms.staging[offset + 10]).toBeCloseTo(200);
    expect(uniforms.staging[offset + 11]).toBeCloseTo(150);
  });
});
