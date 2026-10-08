import { describe, expect, it } from 'vitest';
import { ErrorCode, PlutoError } from '../../../src/core/debug';
import type { RhiCapabilities } from '../../../src/rhi/capabilities';
import type {
  RhiBindGroupLayout,
  RhiBuffer,
  RhiSampler,
  RhiTexture,
} from '../../../src/rhi/device';
import {
  BindingType,
  BlendMode,
  BufferUsage,
  LoadAction,
  ShaderStage,
  TextureDimension,
  TextureFormat,
  TextureUsage,
} from '../../../src/rhi/types';
import {
  validateBindGroupDesc,
  validateBindGroupLayoutDesc,
  validateBufferDesc,
  validateComputePipelineDesc,
  validateRenderPassDesc,
  validateRenderPipelineDesc,
  validateSamplerDesc,
  validateTextureDesc,
  validateTextureWriteDesc,
} from '../../../src/rhi/validate';

const WEBGPU: RhiCapabilities = {
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
  maxComputeInvocationsPerWorkgroup: 256,
  minUniformBufferOffsetAlignment: 256,
  minStorageBufferOffsetAlignment: 256,
  textureCompressionBC7: true,
  textureCompressionETC2: true,
  textureCompressionASTC: true,
};

/** 何もしない関数。モックは値だけ必要。 */
const NOOP = (): void => {
  // 記録しない。
};

/**
 * `WEBGPU` の一部を変えた実体を返す。
 * @param overrides 上書きするプロパティ
 * @returns 能力の値
 */
function caps(overrides: Partial<RhiCapabilities>): RhiCapabilities {
  return { ...WEBGPU, ...overrides };
}

/**
 * 検証が `PlutoError` を送出することを確認する。
 * @param fn 検証関数
 * @param code 期待するエラーコード
 */
function expectThrows(fn: () => void, code: ErrorCode): void {
  let caught: unknown;
  try {
    fn();
  } catch (e) {
    caught = e;
  }
  expect(caught).toBeInstanceOf(PlutoError);
  expect((caught as PlutoError).code).toBe(code);
}

/**
 * 検証が例外を出さないことを確認する。
 * @param fn 検証関数
 */
function expectPass(fn: () => void): void {
  expect(fn).not.toThrow();
}

/**
 * テクスチャのモックを作る。
 * @param over 上書きするプロパティ
 * @returns テクスチャ
 */
function tex(over: Partial<RhiTexture> = {}): RhiTexture {
  return {
    label: '',
    format: TextureFormat.RGBA8Unorm,
    width: 256,
    height: 256,
    dimension: TextureDimension.D2,
    layers: 1,
    usage: TextureUsage.RenderAttachment,
    destroy: NOOP,
    ...over,
  };
}

/** バッファのモック。 */
function buf(): RhiBuffer {
  return { label: '', sizeBytes: 1024, usage: BufferUsage.Storage, destroy: NOOP };
}

/** サンプラのモック。 */
function smp(): RhiSampler {
  return { destroy: NOOP };
}

/**
 * レイアウトのモックを作る。
 * @param entries エントリ
 * @returns レイアウト
 */
function layout(entries: { stage: number; type: number }[]): RhiBindGroupLayout {
  return { entries, destroy: NOOP };
}

/** シェーダのモック。 */
const SHADER = { name: 'sprite', wgsl: 'fn vs_main() -> vec4f { return vec4f(0); }' };

describe('rhi 検証: バッファ', () => {
  it('sizeBytes が 1 未満と usage が 0 は InvalidArgument', () => {
    expectThrows(() => {
      validateBufferDesc({ sizeBytes: 0, usage: BufferUsage.Storage });
    }, ErrorCode.InvalidArgument);
    expectThrows(() => {
      validateBufferDesc({ sizeBytes: 64, usage: 0 });
    }, ErrorCode.InvalidArgument);
    expectPass(() => {
      validateBufferDesc({ sizeBytes: 64, usage: BufferUsage.Storage });
    });
  });

  it('MapRead は CopyDst 以外のビットと併用できない (D-22)', () => {
    expectPass(() => {
      validateBufferDesc({ sizeBytes: 64, usage: BufferUsage.MapRead });
    });
    expectPass(() => {
      validateBufferDesc({ sizeBytes: 64, usage: BufferUsage.MapRead | BufferUsage.CopyDst });
    });
    expectThrows(() => {
      validateBufferDesc({ sizeBytes: 64, usage: BufferUsage.MapRead | BufferUsage.Storage });
    }, ErrorCode.InvalidArgument);
    expectThrows(() => {
      validateBufferDesc({ sizeBytes: 64, usage: BufferUsage.MapRead | BufferUsage.Uniform });
    }, ErrorCode.InvalidArgument);
  });
});

describe('rhi 検証: テクスチャ', () => {
  it('幅と高さ・層数の下限と D2 の層数制限', () => {
    expectThrows(() => {
      validateTextureDesc({ format: 0, width: 0, height: 1, layers: 1, usage: 4 }, WEBGPU);
    }, ErrorCode.InvalidArgument);
    expectThrows(() => {
      validateTextureDesc({ format: 0, width: 1, height: 1, layers: 1, usage: 0 }, WEBGPU);
    }, ErrorCode.InvalidArgument);
    expectThrows(() => {
      validateTextureDesc({ format: 0, width: 1, height: 1, layers: 2, usage: 4 }, WEBGPU);
    }, ErrorCode.InvalidArgument);
    expectPass(() => {
      validateTextureDesc(
        {
          format: 0,
          width: 1,
          height: 1,
          dimension: TextureDimension.D2Array,
          layers: 2,
          usage: 4,
        },
        WEBGPU,
      );
    });
  });

  it('デバイス上限を超えると InvalidArgument', () => {
    expectThrows(() => {
      validateTextureDesc(
        { format: 0, width: 16384, height: 1, layers: 1, usage: 4 },
        caps({ maxTextureSize: 8192 }),
      );
    }, ErrorCode.InvalidArgument);
    expectThrows(() => {
      validateTextureDesc(
        {
          format: 0,
          width: 1,
          height: 1,
          dimension: TextureDimension.D2Array,
          layers: 512,
          usage: 4,
        },
        caps({ maxTextureArrayLayers: 256 }),
      );
    }, ErrorCode.InvalidArgument);
  });

  it('圧縮フォーマットはレンダーターゲットにもストレージにも使えない', () => {
    expectThrows(() => {
      validateTextureDesc(
        {
          format: TextureFormat.BC7RGBAUnorm,
          width: 64,
          height: 64,
          layers: 1,
          usage: TextureUsage.RenderAttachment,
        },
        WEBGPU,
      );
    }, ErrorCode.InvalidArgument);
    expectThrows(() => {
      validateTextureDesc(
        {
          format: TextureFormat.ETC2RGBA8Unorm,
          width: 64,
          height: 64,
          layers: 1,
          usage: TextureUsage.StorageBinding,
        },
        WEBGPU,
      );
    }, ErrorCode.InvalidArgument);
    expectPass(() => {
      validateTextureDesc(
        {
          format: TextureFormat.ASTC4x4Unorm,
          width: 64,
          height: 64,
          layers: 1,
          usage: TextureUsage.TextureBinding,
        },
        WEBGPU,
      );
    });
  });

  it('非対応デバイスでの圧縮フォーマットは UnsupportedFeature', () => {
    expectThrows(() => {
      validateTextureDesc(
        {
          format: TextureFormat.BC7RGBAUnorm,
          width: 64,
          height: 64,
          layers: 1,
          usage: TextureUsage.TextureBinding,
        },
        caps({ textureCompressionBC7: false }),
      );
    }, ErrorCode.UnsupportedFeature);
  });

  it('RGBA16Float は floatRenderTarget が false なら UnsupportedFeature', () => {
    const base = { width: 64, height: 64, layers: 1, usage: TextureUsage.RenderAttachment };
    expectPass(() => {
      validateTextureDesc({ ...base, format: TextureFormat.RGBA16Float }, WEBGPU);
    });
    expectThrows(() => {
      validateTextureDesc(
        { ...base, format: TextureFormat.RGBA16Float },
        caps({ floatRenderTarget: false }),
      );
    }, ErrorCode.UnsupportedFeature);
  });
});

describe('rhi 検証: サンプラとレイアウト', () => {
  it('サンプラの filter は 0 または 1', () => {
    expectPass(() => {
      validateSamplerDesc({});
    });
    expectPass(() => {
      validateSamplerDesc({ filter: 1, addressModeU: 1, addressModeV: 2 });
    });
    expectThrows(() => {
      validateSamplerDesc({ filter: 2 });
    }, ErrorCode.InvalidArgument);
  });

  it('レイアウトの stage が 0 は不可', () => {
    expectPass(() => {
      validateBindGroupLayoutDesc({ entries: [] });
    });
    expectPass(() => {
      validateBindGroupLayoutDesc({
        entries: [{ stage: ShaderStage.Vertex, type: BindingType.Texture }],
      });
    });
    expectThrows(() => {
      validateBindGroupLayoutDesc({ entries: [{ stage: 0, type: BindingType.Texture }] });
    }, ErrorCode.InvalidArgument);
  });
});

describe('rhi 検証: バインドグループ', () => {
  it('要素数と型がレイアウトと一致すること', () => {
    const lg = layout([
      { stage: ShaderStage.Vertex, type: BindingType.UniformBuffer },
      { stage: ShaderStage.Fragment, type: BindingType.Texture },
    ]);
    expectPass(() => {
      validateBindGroupDesc(
        {
          layout: lg,
          entries: [
            { type: BindingType.UniformBuffer, buffer: buf() },
            { type: BindingType.Texture, texture: tex() },
          ],
        },
        lg,
        WEBGPU,
      );
    });
    expectThrows(() => {
      validateBindGroupDesc({ layout: lg, entries: [] }, lg, WEBGPU);
    }, ErrorCode.InvalidArgument);
    expectThrows(() => {
      validateBindGroupDesc(
        {
          layout: lg,
          entries: [
            { type: BindingType.Texture, texture: tex() },
            { type: BindingType.Texture, texture: tex() },
          ],
        },
        lg,
        WEBGPU,
      );
    }, ErrorCode.InvalidArgument);
  });

  it('型に必要なリソースが欠けていれば InvalidArgument', () => {
    const lg = layout([{ stage: ShaderStage.Compute, type: BindingType.StorageBufferReadWrite }]);
    expectThrows(() => {
      validateBindGroupDesc(
        { layout: lg, entries: [{ type: BindingType.StorageBufferReadWrite }] },
        lg,
        WEBGPU,
      );
    }, ErrorCode.InvalidArgument);
    const lgSampler = layout([{ stage: ShaderStage.Fragment, type: BindingType.Sampler }]);
    expectThrows(() => {
      validateBindGroupDesc(
        { layout: lgSampler, entries: [{ type: BindingType.Sampler }] },
        lgSampler,
        WEBGPU,
      );
    }, ErrorCode.InvalidArgument);
    expectPass(() => {
      validateBindGroupDesc(
        { layout: lgSampler, entries: [{ type: BindingType.Sampler, sampler: smp() }] },
        lgSampler,
        WEBGPU,
      );
    });
  });

  it('offsetBytes は caps の整列値の倍数 (D-22)', () => {
    const uniform = layout([{ stage: ShaderStage.Vertex, type: BindingType.UniformBuffer }]);
    expectPass(() => {
      validateBindGroupDesc(
        {
          layout: uniform,
          entries: [{ type: BindingType.UniformBuffer, buffer: buf(), offsetBytes: 512 }],
        },
        uniform,
        WEBGPU,
      );
    });
    expectThrows(() => {
      validateBindGroupDesc(
        {
          layout: uniform,
          entries: [{ type: BindingType.UniformBuffer, buffer: buf(), offsetBytes: 100 }],
        },
        uniform,
        WEBGPU,
      );
    }, ErrorCode.InvalidArgument);
    const storage = layout([{ stage: ShaderStage.Vertex, type: BindingType.StorageBufferRead }]);
    expectThrows(() => {
      validateBindGroupDesc(
        {
          layout: storage,
          entries: [{ type: BindingType.StorageBufferRead, buffer: buf(), offsetBytes: 32 }],
        },
        storage,
        WEBGPU,
      );
    }, ErrorCode.InvalidArgument);
    expectPass(() => {
      validateBindGroupDesc(
        {
          layout: storage,
          entries: [{ type: BindingType.StorageBufferRead, buffer: buf(), offsetBytes: 32 }],
        },
        storage,
        caps({ minStorageBufferOffsetAlignment: 32 }),
      );
    });
  });
});

describe('rhi 検証: レンダーパイプライン', () => {
  it('layouts は 4 個まで、colorTargets は 1 から 2 個', () => {
    const mk = (nLayouts: number, nTargets: number) => ({
      vertexShader: SHADER,
      fragmentShader: SHADER,
      layouts: new Array(nLayouts).fill(layout([])),
      colorTargets: new Array(nTargets).fill({ format: TextureFormat.BGRA8Unorm }),
    });
    expectPass(() => {
      validateRenderPipelineDesc(mk(4, 2), WEBGPU);
    });
    expectThrows(() => {
      validateRenderPipelineDesc(mk(5, 1), WEBGPU);
    }, ErrorCode.InvalidArgument);
    expectThrows(() => {
      validateRenderPipelineDesc(mk(0, 0), WEBGPU);
    }, ErrorCode.InvalidArgument);
    expectThrows(() => {
      validateRenderPipelineDesc(mk(0, 3), WEBGPU);
    }, ErrorCode.InvalidArgument);
  });

  it('float のターゲットは能力に合わせる', () => {
    const mk = (format: number, blend: number) => ({
      vertexShader: SHADER,
      fragmentShader: SHADER,
      layouts: [],
      colorTargets: [{ format, blend }],
    });
    expectPass(() => {
      validateRenderPipelineDesc(mk(TextureFormat.RGBA32Float, BlendMode.Alpha), WEBGPU);
    });
    expectThrows(() => {
      validateRenderPipelineDesc(
        mk(TextureFormat.RGBA32Float, BlendMode.Alpha),
        caps({ floatBlend: false }),
      );
    }, ErrorCode.UnsupportedFeature);
    expectPass(() => {
      validateRenderPipelineDesc(
        mk(TextureFormat.RGBA32Float, BlendMode.Opaque),
        caps({ floatBlend: false }),
      );
    });
    expectThrows(() => {
      validateRenderPipelineDesc(
        mk(TextureFormat.RGBA32Float, BlendMode.Alpha),
        caps({ floatRenderTarget: false }),
      );
    }, ErrorCode.UnsupportedFeature);
  });

  it('depthStencil.format は深さの書式だけ', () => {
    const base = {
      vertexShader: SHADER,
      fragmentShader: SHADER,
      layouts: [],
      colorTargets: [{ format: TextureFormat.BGRA8Unorm }],
    };
    expectPass(() => {
      validateRenderPipelineDesc(
        {
          ...base,
          depthStencil: { format: TextureFormat.Depth24Plus, compare: 2, writeEnabled: true },
        },
        WEBGPU,
      );
    });
    expectThrows(() => {
      validateRenderPipelineDesc(
        {
          ...base,
          depthStencil: { format: TextureFormat.RGBA8Unorm, compare: 2, writeEnabled: true },
        },
        WEBGPU,
      );
    }, ErrorCode.InvalidArgument);
  });
});

describe('rhi 検証: コンピュートパイプライン', () => {
  const mk = (workgroupSize: [number, number, number]) => ({
    computeShader: SHADER,
    layouts: [],
    workgroupSize,
  });

  it('compute が無いデバイスは UnsupportedFeature', () => {
    expectPass(() => {
      validateComputePipelineDesc(mk([64, 1, 1]), WEBGPU);
    });
    expectThrows(() => {
      validateComputePipelineDesc(mk([64, 1, 1]), caps({ compute: false }));
    }, ErrorCode.UnsupportedFeature);
  });

  it('workgroupSize は caps の上限まで (D-22)', () => {
    expectPass(() => {
      validateComputePipelineDesc(mk([256, 1, 1]), WEBGPU);
    });
    expectPass(() => {
      validateComputePipelineDesc(mk([16, 16, 1]), WEBGPU);
    });
    expectThrows(() => {
      validateComputePipelineDesc(mk([0, 1, 1]), WEBGPU);
    }, ErrorCode.InvalidArgument);
    expectThrows(() => {
      validateComputePipelineDesc(mk([256, 2, 1]), WEBGPU);
    }, ErrorCode.InvalidArgument);
    expectThrows(() => {
      validateComputePipelineDesc(mk([257, 1, 1]), WEBGPU);
    }, ErrorCode.InvalidArgument);
    expectPass(() => {
      validateComputePipelineDesc(mk([32, 1, 1]), caps({ maxComputeInvocationsPerWorkgroup: 32 }));
    });
  });
});

describe('rhi 検証: 転送とレンダーパス', () => {
  it('writeTexture の範囲がテクスチャを超えると InvalidArgument', () => {
    const target = tex();
    expectPass(() => {
      validateTextureWriteDesc(
        { offsetX: 0, offsetY: 0, layer: 0, width: 256, height: 256 },
        target,
      );
    });
    expectThrows(() => {
      validateTextureWriteDesc({ offsetX: 1, offsetY: 0, layer: 0, width: 256, height: 1 }, target);
    }, ErrorCode.InvalidArgument);
    expectThrows(() => {
      validateTextureWriteDesc({ offsetX: 0, offsetY: 0, layer: 1, width: 1, height: 1 }, target);
    }, ErrorCode.InvalidArgument);
    expectThrows(() => {
      validateTextureWriteDesc({ offsetX: 0, offsetY: 0, layer: 0, width: 0, height: 1 }, target);
    }, ErrorCode.InvalidArgument);
  });

  it('レンダーパスのアタッチメント数は 1 から 2 個', () => {
    const view = tex();
    const mk = (n: number) => ({
      colorAttachments: new Array(n).fill({
        view,
        load: LoadAction.Clear,
        store: true,
        clearColor: [0, 0, 0, 1],
      }),
    });
    expectPass(() => {
      validateRenderPassDesc(mk(1));
    });
    expectPass(() => {
      validateRenderPassDesc(mk(2));
    });
    expectThrows(() => {
      validateRenderPassDesc(mk(0));
    }, ErrorCode.InvalidArgument);
    expectThrows(() => {
      validateRenderPassDesc(mk(3));
    }, ErrorCode.InvalidArgument);
  });

  it('Clear なら clearColor が必須', () => {
    const view = tex();
    expectThrows(() => {
      validateRenderPassDesc({ colorAttachments: [{ view, load: LoadAction.Clear, store: true }] });
    }, ErrorCode.InvalidArgument);
    expectPass(() => {
      validateRenderPassDesc({ colorAttachments: [{ view, load: LoadAction.Load, store: false }] });
    });
  });

  it('描画先に RenderAttachment が必要', () => {
    const plain = tex({ usage: TextureUsage.TextureBinding });
    expectThrows(() => {
      validateRenderPassDesc({
        colorAttachments: [
          { view: plain, load: LoadAction.Clear, store: true, clearColor: [0, 0, 0, 1] },
        ],
      });
    }, ErrorCode.InvalidArgument);
  });

  it('深度アタッチメントも同様に検査する', () => {
    const view = tex();
    expectThrows(() => {
      validateRenderPassDesc({
        colorAttachments: [{ view, load: LoadAction.Load, store: true }],
        depthStencil: { view, load: LoadAction.Clear, store: true },
      });
    }, ErrorCode.InvalidArgument);
    expectPass(() => {
      validateRenderPassDesc({
        colorAttachments: [{ view, load: LoadAction.Load, store: true }],
        depthStencil: { view, load: LoadAction.Clear, store: true, clearDepth: 1 },
      });
    });
  });
});
