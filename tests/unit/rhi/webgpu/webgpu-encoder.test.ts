import { describe, expect, it } from 'vitest';
import { ErrorCode, PlutoError } from '../../../../src/core/debug';
import { WebGpuTexture } from '../../../../src/rhi/webgpu/webgpu-texture';
import { WebGpuCommandEncoder } from '../../../../src/rhi/webgpu/webgpu-encoder';

/** 何もしない。スタブは値だけ必要。実定義の戻り値に合わせて `undefined` を返す。 */
function noop(): undefined {
  return undefined;
}

/** 記録された呼び出し。 */
const calls: string[] = [];

/**
 * `GPUTextureView` の偽物。
 * @returns 偽物のビュー
 */
function fakeView(): GPUTextureView {
  return { __brand: 'GPUTextureView' as const, label: 'void' };
}

/**
 * `GPUTexture` の偽物。
 * @returns 偽物のテクスチャ
 */
function fakeGpuTexture(): GPUTexture {
  const stub = { __brand: 'GPUTexture' as const, createView: fakeView, destroy: noop };
  return stub as GPUTexture;
}

/**
 * 描画先テクスチャを作る。
 * @returns 描画先
 */
function colorTarget(): WebGpuTexture {
  return new WebGpuTexture(fakeGpuTexture(), {
    label: 'swapchain',
    format: 1,
    width: 256,
    height: 256,
    dimension: 0,
    layers: 1,
    usage: 8,
  });
}

/**
 * `GPURenderPassEncoder` の偽物。
 * @returns 偽物のパス
 */
function fakeRenderPass(): GPURenderPassEncoder {
  const stub: Pick<
    GPURenderPassEncoder,
    | '__brand'
    | 'setPipeline'
    | 'setBindGroup'
    | 'setViewport'
    | 'setScissorRect'
    | 'draw'
    | 'drawIndirect'
    | 'end'
  > = {
    __brand: 'GPURenderPassEncoder',
    setPipeline: (): undefined => {
      calls.push('setPipeline');
      return undefined;
    },
    setBindGroup: (): undefined => {
      calls.push('setBindGroup');
      return undefined;
    },
    setViewport: (): undefined => {
      calls.push('setViewport');
      return undefined;
    },
    setScissorRect: (): undefined => {
      calls.push('setScissorRect');
      return undefined;
    },
    draw: (): undefined => {
      calls.push('draw');
      return undefined;
    },
    drawIndirect: (): undefined => {
      calls.push('drawIndirect');
      return undefined;
    },
    end: noop,
  };
  return stub as GPURenderPassEncoder;
}

/**
 * `GPUComputePassEncoder` の偽物。
 * @returns 偽物のパス
 */
function fakeComputePass(): GPUComputePassEncoder {
  const stub: Pick<
    GPUComputePassEncoder,
    | '__brand'
    | 'setPipeline'
    | 'setBindGroup'
    | 'dispatchWorkgroups'
    | 'dispatchWorkgroupsIndirect'
    | 'end'
  > = {
    __brand: 'GPUComputePassEncoder' as const,
    setPipeline: noop,
    setBindGroup: noop,
    dispatchWorkgroups: (): undefined => {
      calls.push('dispatch');
      return undefined;
    },
    dispatchWorkgroupsIndirect: noop,
    end: noop,
  };
  return stub as GPUComputePassEncoder;
}

/**
 * `GPUCommandEncoder` の偽物。
 * @returns 偽物のエンコーダ
 */
function fakeEncoder(): GPUCommandEncoder {
  const stub: Pick<
    GPUCommandEncoder,
    | '__brand'
    | 'beginRenderPass'
    | 'beginComputePass'
    | 'copyBufferToBuffer'
    | 'clearBuffer'
    | 'finish'
  > = {
    __brand: 'GPUCommandEncoder' as const,
    beginRenderPass: (): GPURenderPassEncoder => fakeRenderPass(),
    beginComputePass: (): GPUComputePassEncoder => fakeComputePass(),
    copyBufferToBuffer: noop,
    clearBuffer: noop,
    finish: (): GPUCommandBuffer => ({ __brand: 'GPUCommandBuffer' as const, label: 'done' }),
  };
  return stub as GPUCommandEncoder;
}

/**
 * `GPUDevice` の偽物。
 * @returns 偽物のデバイス
 */
function fakeDevice(): GPUDevice {
  const stub = { __brand: 'GPUDevice' as const, createCommandEncoder: fakeEncoder };
  return stub as GPUDevice;
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

describe('webgpu エンコーダ', () => {
  it('begin の前に記録すると InvalidState になる', () => {
    const enc = new WebGpuCommandEncoder(fakeDevice(), fakeView());
    expectThrows(
      () =>
        enc.beginRenderPass({
          colorAttachments: [{ view: colorTarget(), load: 0, store: true }],
        }),
      ErrorCode.InvalidState,
    );
  });

  it('レンダーパスは開いて描いて閉じる', () => {
    calls.length = 0;
    const enc = new WebGpuCommandEncoder(fakeDevice(), fakeView());
    enc.begin();
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: colorTarget(), load: 0, store: true }],
    });
    pass.setViewport(0, 0, 256, 256);
    pass.setScissor(0, 0, 128, 128);
    pass.draw(6, 1);
    pass.end();
    expect(calls).toEqual(['setViewport', 'setScissorRect', 'draw']);
  });

  it('firstVertex が 0 でないと InvalidArgument になる', () => {
    const enc = new WebGpuCommandEncoder(fakeDevice(), fakeView());
    enc.begin();
    const pass = enc.beginRenderPass({
      colorAttachments: [{ view: colorTarget(), load: 0, store: true }],
    });
    expectThrows(() => {
      pass.draw(6, 1, 1);
    }, ErrorCode.InvalidArgument);
  });

  it('閉じていないパスを閉じると InvalidState になる', () => {
    const enc = new WebGpuCommandEncoder(fakeDevice(), fakeView());
    enc.begin();
    const pass = enc.beginComputePass();
    pass.end();
    expectThrows(() => {
      pass.end();
    }, ErrorCode.InvalidState);
  });

  it('コンピュートパスは開いて起動して閉じる', () => {
    calls.length = 0;
    const enc = new WebGpuCommandEncoder(fakeDevice(), fakeView());
    enc.begin();
    const pass = enc.beginComputePass();
    pass.dispatch(64, 16);
    pass.end();
    expect(calls).toEqual(['dispatch']);
  });

  it('エンコーダは 2 個までで、使い切ると InvalidState になる', () => {
    const enc = new WebGpuCommandEncoder(fakeDevice(), fakeView());
    enc.begin();
    enc.begin();
    expectThrows(() => {
      enc.begin();
    }, ErrorCode.InvalidState);
  });

  it('submit すると解放されて再利用できる', () => {
    const submitted: undefined[] = [];
    const queue: { submit: GPUQueue['submit'] } = {
      submit: (): undefined => {
        submitted.push(undefined);
        return undefined;
      },
    };
    const gpuQueue = queue as GPUQueue;
    const enc = new WebGpuCommandEncoder(fakeDevice(), fakeView());
    enc.begin();
    enc
      .beginRenderPass({
        colorAttachments: [{ view: colorTarget(), load: 0, store: true }],
      })
      .end();
    enc.submitTo(gpuQueue);
    expect(submitted).toHaveLength(1);
    enc.begin();
    enc.beginComputePass().end();
    enc.submitTo(gpuQueue);
    expect(submitted).toHaveLength(2);
  });
});
