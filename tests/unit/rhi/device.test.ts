import { describe, expect, it } from 'vitest';
import { EventEmitter } from '../../../src/core/events';
import type { RhiCapabilities } from '../../../src/rhi/capabilities';
import type {
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
} from '../../../src/rhi/device';
import type { ShaderSource } from '../../../src/rhi/shader-source';
import { TextureFormat, TextureUsage } from '../../../src/rhi/types';

const CAPS: RhiCapabilities = {
  backend: 'webgpu',
  compute: true,
  indirectDraw: true,
  storageBuffers: true,
  timestampQuery: true,
  floatRenderTarget: true,
  floatBlend: true,
  maxTextureSize: 8192,
  maxTextureArrayLayers: 256,
  maxStorageBufferBytes: 134217728,
  maxComputeWorkgroupSize: 256,
  textureCompressionBC7: true,
  textureCompressionETC2: true,
  textureCompressionASTC: true,
};

/**
 * 記録されたコマンドを溜めるだけの `RhiDevice` のモック。
 * インターフェースが構造的に実現できることと、呼び順を確かめるために使う。
 */
class MockDevice implements RhiDevice {
  /** 記録された呼びの並び。 */
  public readonly calls: string[] = [];

  /** このモックが持つ能力。 */
  public readonly caps: RhiCapabilities;

  /**
   * モックを作る。
   * @param caps 返す能力。省略したらテスト用の WebGPU 値。
   */
  public constructor(caps: RhiCapabilities = CAPS) {
    this.caps = caps;
  }

  /** デバイス喪失の通知。 */
  public readonly onDeviceLost = new EventEmitter<{ lost: { reason: string } }>();

  /** submit されたエンコーダ。 */
  public readonly submitted: RhiCommandEncoder[] = [];

  /** 破棄された回数を数えるためのフラグ。 */
  public destroyCount = 0;

  public createBuffer(desc: { sizeBytes: number }): RhiBuffer {
    this.calls.push(`createBuffer:${String(desc.sizeBytes)}`);
    return {
      label: '',
      sizeBytes: desc.sizeBytes,
      usage: 0,
      destroy: (): void => {
        this.calls.push('buffer.destroy');
      },
    };
  }

  public createTexture(desc: { format: number }): RhiTexture {
    this.calls.push(`createTexture:${String(desc.format)}`);
    return {
      label: '',
      format: desc.format,
      width: 1,
      height: 1,
      dimension: 0,
      layers: 1,
      usage: 0,
      destroy: (): void => {
        this.calls.push('texture.destroy');
      },
    };
  }

  public createSampler(): RhiSampler {
    this.calls.push('createSampler');
    return {
      destroy: (): void => {
        this.calls.push('sampler.destroy');
      },
    };
  }

  public createBindGroupLayout(): RhiBindGroupLayout {
    this.calls.push('createBindGroupLayout');
    return {
      entries: [],
      destroy: (): void => {
        this.calls.push('layout.destroy');
      },
    };
  }

  public createBindGroup(): RhiBindGroup {
    this.calls.push('createBindGroup');
    return {
      layout: {
        entries: [],
        destroy: (): void => {
          this.calls.push('innerLayout.destroy');
        },
      },
      destroy: (): void => {
        this.calls.push('bindGroup.destroy');
      },
    };
  }

  public createRenderPipeline(): RhiRenderPipeline {
    this.calls.push('createRenderPipeline');
    return {
      label: '',
      destroy: (): void => {
        this.calls.push('renderPipeline.destroy');
      },
    };
  }

  public createComputePipeline(): RhiComputePipeline {
    this.calls.push('createComputePipeline');
    return {
      label: '',
      workgroupSize: [1, 1, 1],
      destroy: (): void => {
        this.calls.push('computePipeline.destroy');
      },
    };
  }

  public createQuerySet(count: number): RhiQuerySet | null {
    this.calls.push(`createQuerySet:${String(count)}`);
    if (!this.caps.timestampQuery) return null;
    return {
      count,
      destroy: (): void => {
        this.calls.push('querySet.destroy');
      },
    };
  }

  public writeBuffer(): void {
    this.calls.push('writeBuffer');
  }

  public writeTexture(): void {
    this.calls.push('writeTexture');
  }

  public readBufferAsync(): Promise<ArrayBuffer> {
    this.calls.push('readBufferAsync');
    return Promise.resolve(new ArrayBuffer(0));
  }

  public createCommandEncoder(): RhiCommandEncoder {
    this.calls.push('createCommandEncoder');
    const calls = this.calls;
    const render: RhiRenderPass = {
      setPipeline: (): void => {
        calls.push('renderPass.setPipeline');
      },
      setBindGroup: (index): void => {
        calls.push(`renderPass.setBindGroup:${String(index)}`);
      },
      setViewport: (): void => {
        calls.push('renderPass.setViewport');
      },
      setScissor: (): void => {
        calls.push('renderPass.setScissor');
      },
      draw: (): void => {
        calls.push('renderPass.draw');
      },
      drawIndirect: (): void => {
        calls.push('renderPass.drawIndirect');
      },
      end: (): void => {
        calls.push('renderPass.end');
      },
    };
    const compute: RhiComputePass = {
      setPipeline: (): void => {
        calls.push('computePass.setPipeline');
      },
      setBindGroup: (index): void => {
        calls.push(`computePass.setBindGroup:${String(index)}`);
      },
      dispatch: (): void => {
        calls.push('computePass.dispatch');
      },
      dispatchIndirect: (): void => {
        calls.push('computePass.dispatchIndirect');
      },
      end: (): void => {
        calls.push('computePass.end');
      },
    };
    return {
      beginRenderPass: (): RhiRenderPass => {
        calls.push('beginRenderPass');
        return render;
      },
      beginComputePass: (): RhiComputePass => {
        calls.push('beginComputePass');
        return compute;
      },
      copyBufferToBuffer: (): void => {
        calls.push('copyBufferToBuffer');
      },
      clearBuffer: (): void => {
        calls.push('clearBuffer');
      },
      writeTimestamp: (): void => {
        calls.push('writeTimestamp');
      },
    };
  }

  public submit(encoder: RhiCommandEncoder): void {
    this.submitted.push(encoder);
    this.calls.push('submit');
  }

  public getCurrentTexture(): RhiTexture {
    this.calls.push('getCurrentTexture');
    return {
      label: '',
      format: TextureFormat.BGRA8Unorm,
      width: 256,
      height: 256,
      dimension: 0,
      layers: 1,
      usage: TextureUsage.RenderAttachment,
      destroy: (): void => {
        this.calls.push('texture.destroy');
      },
    };
  }

  public resize(width: number, height: number): void {
    this.calls.push(`resize:${String(width)}x${String(height)}`);
  }

  public destroy(): void {
    this.destroyCount += 1;
    this.calls.push('destroy');
  }
}

describe('rhi デバイス', () => {
  it('バッファとテクスチャを生成すると説明どおりの大きさになる', () => {
    const dev = new MockDevice();
    expect(dev.createBuffer({ sizeBytes: 256 }).sizeBytes).toBe(256);
    expect(dev.createTexture({ format: TextureFormat.RGBA8Unorm }).format).toBe(
      TextureFormat.RGBA8Unorm,
    );
    expect(dev.calls).toEqual(['createBuffer:256', 'createTexture:0']);
  });

  it('各リソースに destroy がある', () => {
    const dev = new MockDevice();
    dev.createBuffer({ sizeBytes: 4 }).destroy();
    dev.createTexture({ format: TextureFormat.RGBA8Unorm }).destroy();
    dev.createSampler().destroy();
    dev.createBindGroupLayout().destroy();
    dev.createBindGroup().destroy();
    dev.createRenderPipeline().destroy();
    dev.createComputePipeline().destroy();
    expect(dev.calls).toContain('buffer.destroy');
    expect(dev.calls).toContain('layout.destroy');
    expect(dev.calls).toContain('computePipeline.destroy');
  });

  it('querySet は caps.timestampQuery の値 따라 null を返す (docs/06 §4)', () => {
    const dev = new MockDevice();
    expect(dev.createQuerySet(4)?.count).toBe(4);
    const noTimestamp = new MockDevice({ ...CAPS, timestampQuery: false });
    expect(noTimestamp.createQuerySet(4)).toBeNull();
  });

  it('レンダーパスは beginRenderPass と end で挟む (docs/06 §4)', () => {
    const dev = new MockDevice();
    const enc = dev.createCommandEncoder();
    const pass = enc.beginRenderPass({
      colorAttachments: [
        {
          view: dev.getCurrentTexture(),
          load: 0,
          store: true,
          clearColor: [0, 0, 0, 1],
        },
      ],
    });
    pass.setBindGroup(0, dev.createBindGroup());
    pass.draw(6, 1000);
    pass.end();
    dev.submit(enc);
    expect(dev.calls).toEqual([
      'createCommandEncoder',
      'getCurrentTexture',
      'beginRenderPass',
      'createBindGroup',
      'renderPass.setBindGroup:0',
      'renderPass.draw',
      'renderPass.end',
      'submit',
    ]);
    expect(dev.submitted).toHaveLength(1);
  });

  it('コンピュートパスは beginComputePass と dispatch で使う', () => {
    const dev = new MockDevice();
    const enc = dev.createCommandEncoder();
    const pass = enc.beginComputePass();
    pass.dispatch(64, 16);
    pass.end();
    dev.submit(enc);
    expect(dev.calls).toContain('beginComputePass');
    expect(dev.calls).toContain('computePass.dispatch');
    expect(dev.calls).toContain('computePass.end');
  });

  it('swapchain は getCurrentTexture と resize で扱う', () => {
    const dev = new MockDevice();
    const tex = dev.getCurrentTexture();
    expect(tex.format).toBe(TextureFormat.BGRA8Unorm);
    expect(tex.usage & TextureUsage.RenderAttachment).toBe(TextureUsage.RenderAttachment);
    dev.resize(1920, 1080);
    dev.destroy();
    expect(dev.destroyCount).toBe(1);
  });

  it('ShaderSource は WGSL と GLSL を同時に持てる (docs/06 §6)', () => {
    const src: ShaderSource = {
      name: 'sprite',
      wgsl: 'fn vs_main() -> vec4f { return vec4f(0); }',
      glslVertex: 'void main() {}',
      glslFragment: 'out vec4 fragColor; void main() { fragColor = vec4(1); }',
    };
    expect(Object.keys(src).sort()).toEqual(['glslFragment', 'glslVertex', 'name', 'wgsl']);
  });
});
