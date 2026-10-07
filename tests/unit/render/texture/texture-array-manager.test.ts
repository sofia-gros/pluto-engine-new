import { describe, expect, it } from 'vitest';
import {
  selectCompressedTextureFormat,
  TextureArrayManager,
} from '../../../../src/render/texture/texture-array-manager';
import { FRAME_PAGE_COMPRESSED_BIT } from '../../../../src/render/render-constants';
import {
  FilterMode,
  TextureDimension,
  TextureFormat,
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
  type SamplerDesc,
  type TextureDesc,
  type TextureWriteDesc,
} from '../../../../src/rhi';
import { EventEmitter } from '../../../../src/core/events';
import { ErrorCode, PlutoError } from '../../../../src/core/debug';

interface WrittenTextureRecord {
  tex: RhiTexture;
  desc: TextureWriteDesc;
  data: ArrayBufferView | ImageBitmap;
}

class MockDeviceForTextureArray implements RhiDevice {
  public readonly caps: RhiCapabilities;
  public readonly onDeviceLost = new EventEmitter<{ lost: { reason: string } }>();

  public readonly createdTextures: TextureDesc[] = [];
  public readonly createdSamplers: SamplerDesc[] = [];
  public readonly writtenTextures: WrittenTextureRecord[] = [];

  public constructor(capsOverrides: Partial<RhiCapabilities> = {}) {
    this.caps = {
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
      ...capsOverrides,
    };
  }

  public createTexture(desc: TextureDesc): RhiTexture {
    this.createdTextures.push(desc);
    return {
      label: desc.label ?? '',
      format: desc.format,
      width: desc.width,
      height: desc.height,
      dimension: desc.dimension ?? TextureDimension.D2,
      layers: desc.layers,
      usage: desc.usage,
      destroy: (): void => {
        void 0;
      },
    };
  }

  public createSampler(desc: SamplerDesc): RhiSampler {
    this.createdSamplers.push(desc);
    return {
      destroy: (): void => {
        void 0;
      },
    };
  }

  public writeTexture(
    tex: RhiTexture,
    desc: TextureWriteDesc,
    data: ArrayBufferView | ImageBitmap,
  ): void {
    this.writtenTextures.push({ tex, desc, data });
  }

  public createBuffer(desc: BufferDesc): RhiBuffer {
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
    void 0;
  }
  public readBufferAsync(): Promise<ArrayBuffer> {
    return Promise.resolve(new ArrayBuffer(0));
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

describe('TextureArrayManager', () => {
  describe('圧縮形式の選択順序 (BC7 → ASTC → ETC2)', () => {
    it('BC7, ASTC, ETC2 すべて true の場合、BC7 が選ばれる', () => {
      const device = new MockDeviceForTextureArray({
        textureCompressionBC7: true,
        textureCompressionASTC: true,
        textureCompressionETC2: true,
      });
      expect(selectCompressedTextureFormat(device)).toBe(TextureFormat.BC7RGBAUnorm);
    });

    it('BC7 が false、ASTC と ETC2 が true の場合、ASTC が選ばれる', () => {
      const device = new MockDeviceForTextureArray({
        textureCompressionBC7: false,
        textureCompressionASTC: true,
        textureCompressionETC2: true,
      });
      expect(selectCompressedTextureFormat(device)).toBe(TextureFormat.ASTC4x4Unorm);
    });

    it('BC7 と ASTC が false、ETC2 が true の場合、ETC2 が選ばれる', () => {
      const device = new MockDeviceForTextureArray({
        textureCompressionBC7: false,
        textureCompressionASTC: false,
        textureCompressionETC2: true,
      });
      expect(selectCompressedTextureFormat(device)).toBe(TextureFormat.ETC2RGBA8Unorm);
    });

    it('すべて false の場合、undefined が返る', () => {
      const device = new MockDeviceForTextureArray({
        textureCompressionBC7: false,
        textureCompressionASTC: false,
        textureCompressionETC2: false,
      });
      expect(selectCompressedTextureFormat(device)).toBeUndefined();
    });
  });

  describe('初期化とリソース管理', () => {
    it('RGBA8 配列とサンプラが生成され、層 0 の白ピクセルが書き込まれる', () => {
      const device = new MockDeviceForTextureArray();
      const manager = new TextureArrayManager(device, { pixelArt: false });

      expect(manager.rgbaTexture).toBeDefined();
      expect(device.createdTextures.length).toBe(1);
      expect(device.createdSamplers.length).toBe(1);
      const samplerDesc = device.createdSamplers[0];
      expect(samplerDesc.filter).toBe(FilterMode.Linear);

      // 白ピクセル 4x4 の初期化書き込みが行われていること
      expect(device.writtenTextures.length).toBe(1);
      const write = device.writtenTextures[0];
      expect(write.desc).toEqual({
        offsetX: 0,
        offsetY: 0,
        layer: 0,
        width: 4,
        height: 4,
      });
      if (write.data instanceof Uint8Array) {
        expect(write.data[0]).toBe(255);
      }
    });

    it('pixelArt: true の場合 Nearest サンプラが生成される', () => {
      const device = new MockDeviceForTextureArray();
      new TextureArrayManager(device, { pixelArt: true });
      const samplerDesc = device.createdSamplers[0];
      expect(samplerDesc.filter).toBe(FilterMode.Nearest);
    });

    it('圧縮配列が未生成のときはダミー配列を返す', () => {
      const device = new MockDeviceForTextureArray();
      const manager = new TextureArrayManager(device);

      // 初回は RGBA8 配列のみ
      expect(device.createdTextures.length).toBe(1);

      const dummy = manager.compressedTexture;
      expect(dummy).toBeDefined();
      // ダミー配列が生成されたこと (1x1x1)
      expect(device.createdTextures.length).toBe(2);
      const dummyDesc = device.createdTextures[1];
      expect(dummyDesc.width).toBe(1);
      expect(dummyDesc.height).toBe(1);
      expect(dummyDesc.layers).toBe(1);
      expect(dummyDesc.dimension).toBe(TextureDimension.D2Array);
    });
  });

  describe('ページ割り当て', () => {
    it('RGBA8 ページの割り当てと上限チェック', () => {
      const device = new MockDeviceForTextureArray();
      const manager = new TextureArrayManager(device, { maxRgbaLayers: 2 });

      expect(manager.allocateRgbaPage()).toBe(0);
      expect(manager.allocateRgbaPage()).toBe(1);
      expect(() => manager.allocateRgbaPage()).toThrow(PlutoError);

      try {
        manager.allocateRgbaPage();
      } catch (e: unknown) {
        expect((e as PlutoError).code).toBe(ErrorCode.CapacityExceeded);
      }
    });

    it('圧縮テクスチャページの割り当てと遅延生成', () => {
      const device = new MockDeviceForTextureArray({
        textureCompressionBC7: true,
      });
      const manager = new TextureArrayManager(device, {
        maxCompressedLayers: 2,
      });

      // 割り当て時に圧縮配列が実生成される
      const page1 = manager.allocateCompressedPage();
      expect(page1).toBe(0 | FRAME_PAGE_COMPRESSED_BIT);
      expect(device.createdTextures.some((t) => t.label === 'TextureArray_Compressed')).toBe(true);

      const page2 = manager.allocateCompressedPage();
      expect(page2).toBe(1 | FRAME_PAGE_COMPRESSED_BIT);

      expect(() => manager.allocateCompressedPage()).toThrow(PlutoError);
    });

    it('圧縮形式非対応デバイスでの圧縮ページ割り当ては UnsupportedFeature', () => {
      const device = new MockDeviceForTextureArray({
        textureCompressionBC7: false,
        textureCompressionASTC: false,
        textureCompressionETC2: false,
      });
      const manager = new TextureArrayManager(device);

      expect(() => manager.allocateCompressedPage()).toThrow(PlutoError);
      try {
        manager.allocateCompressedPage();
      } catch (e: unknown) {
        expect((e as PlutoError).code).toBe(ErrorCode.UnsupportedFeature);
      }
    });
  });
});
