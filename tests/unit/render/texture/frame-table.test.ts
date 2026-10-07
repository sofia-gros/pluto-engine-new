import { describe, expect, it } from 'vitest';
import { FrameTable } from '../../../../src/render/texture/frame-table';
import { WHITE_FRAME_ID } from '../../../../src/render/render-constants';
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

class MockDeviceForFrameTable implements RhiDevice {
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

describe('FrameTable', () => {
  it('WHITE_FRAME_ID (0) が初期化時に予約されている', () => {
    const table = new FrameTable();
    expect(table.count).toBe(1);

    const whiteFrame = table.getFrame(WHITE_FRAME_ID);
    expect(whiteFrame).toBeDefined();
    expect(whiteFrame?.page).toBe(0);
    expect(whiteFrame?.anchorX).toBe(0.5);
    expect(whiteFrame?.anchorY).toBe(0.5);
  });

  it('フレームを追加でき、連番の frameId が発行される', () => {
    const table = new FrameTable();
    const frameId1 = table.addFrame({
      uvMinX: 0,
      uvMinY: 0,
      uvMaxX: 0.5,
      uvMaxY: 0.5,
      width: 32,
      height: 32,
      anchorX: 0.5,
      anchorY: 1.0,
      page: 1,
    });

    expect(frameId1).toBe(1);
    expect(table.count).toBe(2);

    const info = table.getFrame(frameId1);
    expect(info).toBeDefined();
    expect(info?.width).toBe(32);
    expect(info?.height).toBe(32);
    expect(info?.anchorX).toBe(0.5);
    expect(info?.anchorY).toBe(1.0);
    expect(info?.page).toBe(1);
  });

  it('getDerivedFrame は同一 (baseFrameId, anchorX, anchorY) に対して同じ ID を返す', () => {
    const table = new FrameTable();
    const baseId = table.addFrame({
      uvMinX: 0.1,
      uvMinY: 0.1,
      uvMaxX: 0.2,
      uvMaxY: 0.2,
      width: 64,
      height: 64,
      anchorX: 0.5,
      anchorY: 0.5,
      page: 0,
    });

    // 元と同じアンカーなら baseId 自身が返る
    const sameDerived = table.getDerivedFrame(baseId, 0.5, 0.5);
    expect(sameDerived).toBe(baseId);

    // 異なるアンカー
    const derived1 = table.getDerivedFrame(baseId, 0.0, 0.0);
    expect(derived1).not.toBe(baseId);

    // 再度同じ組み合わせで呼び出した場合はキャッシュから同一 ID が返る
    const derived2 = table.getDerivedFrame(baseId, 0.0, 0.0);
    expect(derived2).toBe(derived1);

    // フレーム情報が UV やサイズ、page を維持しつつアンカーだけ変更されていること
    const derivedInfo = table.getFrame(derived1);
    expect(derivedInfo?.uvMinX).toBe(0.1);
    expect(derivedInfo?.width).toBe(64);
    expect(derivedInfo?.anchorX).toBe(0.0);
    expect(derivedInfo?.anchorY).toBe(0.0);
  });

  it('maxFrames 超過時に PlutoError(CapacityExceeded) を投げる', () => {
    // 最大 2 フレームのテーブル (0: 白フレーム, 1: 追加用)
    const table = new FrameTable(2);
    const id1 = table.addFrame({
      uvMinX: 0,
      uvMinY: 0,
      uvMaxX: 1,
      uvMaxY: 1,
      width: 16,
      height: 16,
      page: 0,
    });
    expect(id1).toBe(1);

    // 3 フレーム目の追加は容量超過
    expect(() =>
      table.addFrame({
        uvMinX: 0,
        uvMinY: 0,
        uvMaxX: 1,
        uvMaxY: 1,
        width: 16,
        height: 16,
        page: 0,
      }),
    ).toThrow(PlutoError);

    try {
      table.addFrame({
        uvMinX: 0,
        uvMinY: 0,
        uvMaxX: 1,
        uvMaxY: 1,
        width: 16,
        height: 16,
        page: 0,
      });
    } catch (e: unknown) {
      expect((e as PlutoError).code).toBe(ErrorCode.CapacityExceeded);
    }

    // 派生フレーム作成時も容量超過になること
    expect(() => table.getDerivedFrame(id1, 0.1, 0.1)).toThrow(PlutoError);
    try {
      table.getDerivedFrame(id1, 0.1, 0.1);
    } catch (e: unknown) {
      expect((e as PlutoError).code).toBe(ErrorCode.CapacityExceeded);
    }
  });

  it('flush で GPU バッファへの転送が実行される', () => {
    const table = new FrameTable(10);
    const mockDevice = new MockDeviceForFrameTable();

    // 初回 flush
    table.flush(mockDevice);
    expect(mockDevice.createBufferCalls).toBe(1);
    expect(mockDevice.writeBufferCalls).toBe(1);

    // 変更がなければ次の flush では転送されない
    table.flush(mockDevice);
    expect(mockDevice.writeBufferCalls).toBe(1);

    // フレームを追加すると再度転送される
    table.addFrame({
      uvMinX: 0,
      uvMinY: 0,
      uvMaxX: 1,
      uvMaxY: 1,
      width: 10,
      height: 10,
      page: 0,
    });
    table.flush(mockDevice);
    expect(mockDevice.writeBufferCalls).toBe(2);
  });
});
