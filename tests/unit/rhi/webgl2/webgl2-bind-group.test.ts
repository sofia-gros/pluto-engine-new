import { describe, expect, it } from 'vitest';
import { ErrorCode, PlutoError } from '../../../../src/core/debug';
import { BindingType, ShaderStage } from '../../../../src/rhi/types';
import {
  assignLayoutSlots,
  combineLayoutSlots,
} from '../../../../src/rhi/webgl2/webgl2-bind-group';

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

describe('webgl2 割り当て: 局所番号', () => {
  it('空のレイアウトは空になる', () => {
    expect(assignLayoutSlots([])).toEqual({ slots: [], bufferCount: 0, unitCount: 0 });
  });

  it('UBO は binding 順になる', () => {
    const out = assignLayoutSlots([
      { stage: ShaderStage.Vertex, type: BindingType.UniformBuffer },
      { stage: ShaderStage.Vertex, type: BindingType.UniformBuffer },
    ]);
    expect(out.slots).toEqual([
      { kind: 'buffer', binding: 0 },
      { kind: 'buffer', binding: 1 },
    ]);
    expect(out.bufferCount).toBe(2);
    expect(out.unitCount).toBe(0);
  });

  it('テクスチャとサンプラは同じユニットになる', () => {
    const out = assignLayoutSlots([
      { stage: ShaderStage.Fragment, type: BindingType.Texture },
      { stage: ShaderStage.Fragment, type: BindingType.Sampler },
    ]);
    expect(out.slots).toEqual([
      { kind: 'texture', binding: 0 },
      { kind: 'sampler', binding: 0 },
    ]);
    expect(out.unitCount).toBe(1);
  });

  it('データテクスチャ化した読み取りもユニットを消費する', () => {
    const out = assignLayoutSlots([
      { stage: ShaderStage.Vertex, type: BindingType.StorageBufferRead },
      { stage: ShaderStage.Fragment, type: BindingType.Texture },
      { stage: ShaderStage.Fragment, type: BindingType.Sampler },
    ]);
    expect(out.slots[0]).toEqual({ kind: 'texture', binding: 0 });
    expect(out.slots[1]).toEqual({ kind: 'texture', binding: 1 });
    expect(out.slots[2]).toEqual({ kind: 'sampler', binding: 1 });
    expect(out.unitCount).toBe(2);
  });

  it('組になっていないサンプラは InvalidArgument になる', () => {
    expectThrows(
      () => assignLayoutSlots([{ stage: ShaderStage.Fragment, type: BindingType.Sampler }]),
      ErrorCode.InvalidArgument,
    );
    expectThrows(
      () =>
        assignLayoutSlots([
          { stage: ShaderStage.Fragment, type: BindingType.Texture },
          { stage: ShaderStage.Fragment, type: BindingType.Sampler },
          { stage: ShaderStage.Fragment, type: BindingType.Sampler },
        ]),
      ErrorCode.InvalidArgument,
    );
  });

  it('書き込み系は UnsupportedFeature になる', () => {
    expectThrows(
      () =>
        assignLayoutSlots([
          { stage: ShaderStage.Compute, type: BindingType.StorageBufferReadWrite },
        ]),
      ErrorCode.UnsupportedFeature,
    );
    expectThrows(
      () => assignLayoutSlots([{ stage: ShaderStage.Fragment, type: BindingType.StorageTexture }]),
      ErrorCode.UnsupportedFeature,
    );
  });
});

describe('webgl2 割り当て: 全体番号', () => {
  it('前のレイアウトの個数を足す', () => {
    const a = assignLayoutSlots([
      { stage: ShaderStage.Vertex, type: BindingType.UniformBuffer },
      { stage: ShaderStage.Fragment, type: BindingType.Texture },
      { stage: ShaderStage.Fragment, type: BindingType.Sampler },
    ]);
    const b = assignLayoutSlots([
      { stage: ShaderStage.Vertex, type: BindingType.UniformBuffer },
      { stage: ShaderStage.Fragment, type: BindingType.Texture },
    ]);
    expect(combineLayoutSlots([a, b])).toEqual([
      [
        { kind: 'buffer', binding: 0 },
        { kind: 'texture', binding: 0 },
        { kind: 'sampler', binding: 0 },
      ],
      [
        { kind: 'buffer', binding: 1 },
        { kind: 'texture', binding: 1 },
      ],
    ]);
  });
});
