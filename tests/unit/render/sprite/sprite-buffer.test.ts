import { describe, expect, it } from 'vitest';
import { SpriteBuffer } from '../../../../src/render/sprite/sprite-buffer';
import { GPU_GROUP_ALIGN, SPRITE_STRIDE_WORDS } from '../../../../src/render/render-constants';
import { SPRITE_WORD_FLAGS } from '../../../../src/render/sprite/sprite-instance-layout';
import { ErrorCode, PlutoError } from '../../../../src/core/debug';
import { EventEmitter } from '../../../../src/core/events';
import type {
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

class MockDeviceForSpriteBuffer implements RhiDevice {
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
  public createBufferCalls = 0;
  public writeBufferCalls = 0;

  public createBuffer(desc: BufferDesc): RhiBuffer {
    this.createBufferCalls++;
    return {
      label: desc.label ?? '',
      sizeBytes: desc.sizeBytes,
      usage: desc.usage,
      destroy: (): void => {
        void 0;
      },
    };
  }

  public writeBuffer(): void {
    this.writeBufferCalls++;
  }

  public createTexture(): RhiTexture {
    throw new Error('not implemented in mock');
  }
  public createSampler(): RhiSampler {
    throw new Error('not implemented in mock');
  }
  public createBindGroupLayout(): RhiBindGroupLayout {
    throw new Error('not implemented in mock');
  }
  public createBindGroup(): RhiBindGroup {
    throw new Error('not implemented in mock');
  }
  public createRenderPipeline(): RhiRenderPipeline {
    throw new Error('not implemented in mock');
  }
  public createComputePipeline(): RhiComputePipeline {
    throw new Error('not implemented in mock');
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
    throw new Error('not implemented in mock');
  }
  public submit(): void {
    void 0;
  }
  public getCurrentTexture(): RhiTexture {
    throw new Error('not implemented in mock');
  }
  public resize(): void {
    void 0;
  }
  public destroy(): void {
    void 0;
  }
}

describe('SpriteBuffer', () => {
  it('スロット割当と highWater の追跡が正しく機能する', () => {
    const buffer = new SpriteBuffer(2048);
    expect(buffer.highWater).toBe(0);

    const slot0 = buffer.allocateSlot();
    expect(slot0).toBe(0);
    expect(buffer.highWater).toBe(1);

    const slot1 = buffer.allocateSlot();
    expect(slot1).toBe(1);
    expect(buffer.highWater).toBe(2);

    expect(buffer.dirtyBlocks.test(0)).toBe(true);
  });

  it('GPU Tier グループ割当で GPU_GROUP_ALIGN (1024) 整列される', () => {
    const buffer = new SpriteBuffer(4096);
    // スロット 0〜9 を消費
    for (let i = 0; i < 10; i++) {
      buffer.allocateSlot();
    }
    expect(buffer.highWater).toBe(10);

    // 1024 整列のグループ割当
    const groupStart = buffer.allocateGroup(100);
    expect(groupStart % GPU_GROUP_ALIGN).toBe(0);
    expect(groupStart).toBe(GPU_GROUP_ALIGN);
    expect(buffer.highWater).toBe(GPU_GROUP_ALIGN + 100);
  });

  it('スロット解放時に flags = 0 が書き込まれ dirty になる', () => {
    const buffer = new SpriteBuffer(256);
    const slot = buffer.allocateSlot();

    // フラグにダミー値を書き込む
    buffer.u32View[slot * SPRITE_STRIDE_WORDS + SPRITE_WORD_FLAGS] = 0xff;
    buffer.dirtyBlocks.clearAll();

    buffer.freeSlot(slot);
    expect(buffer.u32View[slot * SPRITE_STRIDE_WORDS + SPRITE_WORD_FLAGS]).toBe(0);
    expect(buffer.dirtyBlocks.test(slot >> 6)).toBe(true);
  });

  it('容量超過時に PlutoError(CapacityExceeded) を投げる', () => {
    const buffer = new SpriteBuffer(2);
    buffer.allocateSlot();
    buffer.allocateSlot();

    expect(() => buffer.allocateSlot()).toThrow(PlutoError);
    try {
      buffer.allocateSlot();
    } catch (e: unknown) {
      expect((e as PlutoError).code).toBe(ErrorCode.CapacityExceeded);
    }
  });

  it('flushToGpu で GPU バッファ作成と writeBuffer 呼び出しが行われる', () => {
    const buffer = new SpriteBuffer(256);
    const mockDevice = new MockDeviceForSpriteBuffer();

    buffer.allocateSlot();
    expect(mockDevice.writeBufferCalls).toBe(0);

    buffer.flushToGpu(mockDevice);
    expect(mockDevice.createBufferCalls).toBe(1);
    expect(mockDevice.writeBufferCalls).toBe(1);

    // 次のフレームで変更がなければ writeBuffer は呼ばれない
    buffer.flushToGpu(mockDevice);
    expect(mockDevice.writeBufferCalls).toBe(1);
  });
});
