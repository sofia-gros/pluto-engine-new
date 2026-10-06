import { describe, expect, it } from 'vitest';
import {
  Column,
  INITIAL_ARCHETYPE_ROWS,
  createTrackingView,
} from '../../../../src/core/ecs/column';
import { ScalarType } from '../../../../src/core/memory/scalar-type';
import { PlutoError } from '../../../../src/core/debug/pluto-error';

describe('Column', () => {
  it('初期容量は INITIAL_ARCHETYPE_ROWS (maxRows がそれより小さければ maxRows)', () => {
    expect(new Column(ScalarType.F32, 100_000).capacity).toBe(INITIAL_ARCHETYPE_ROWS);
    expect(new Column(ScalarType.U8, 10).capacity).toBeGreaterThanOrEqual(10);
    expect(new Column(ScalarType.U8, 10).capacity).toBeLessThan(INITIAL_ARCHETYPE_ROWS);
  });

  it('伸長すると新しいバッファへコピーして差し替え、true を返す (固定長バッファ、E-002)', () => {
    const col = new Column(ScalarType.F32, 10_000);
    const oldView = col.data;
    oldView[5] = 1.5;
    expect(col.grow(3000)).toBe(true);
    expect(col.data).not.toBe(oldView);
    expect(col.capacity).toBeGreaterThanOrEqual(3000);
    expect(col.data[5]).toBe(1.5);
    expect(col.data.buffer).toBe(col.buffer);
    expect(col.buffer instanceof ArrayBuffer && col.buffer.resizable).toBe(false);
  });

  it('rebind で共有バッファに差し替えると、そのバッファのビューになる', () => {
    const src = new Column(ScalarType.I32, 100);
    src.data[3] = 9;
    const mirror = new Column(ScalarType.I32, 100, new ArrayBuffer(8));
    mirror.rebind(src.buffer);
    expect(mirror.data[3]).toBe(9);
  });

  it('伸長は 2 倍ずつで maxRows を上限とし、必要量以下なら何もしない', () => {
    const col = new Column(ScalarType.I32, 1500);
    expect(col.grow(10)).toBe(false);
    expect(col.capacity).toBe(INITIAL_ARCHETYPE_ROWS);
    col.grow(1100);
    expect(col.capacity).toBe(1500);
  });

  it('maxRows を超える伸長は assert で失敗する', () => {
    const col = new Column(ScalarType.I32, 100);
    expect(() => {
      col.grow(101);
    }).toThrow(PlutoError);
  });

  it('全スカラ型の TypedArray を作れる', () => {
    const types = [
      [ScalarType.F32, Float32Array],
      [ScalarType.I32, Int32Array],
      [ScalarType.U32, Uint32Array],
      [ScalarType.I16, Int16Array],
      [ScalarType.U16, Uint16Array],
      [ScalarType.I8, Int8Array],
      [ScalarType.U8, Uint8Array],
    ] as const;
    for (const [type, ctor] of types) {
      expect(createTrackingView(type, new ArrayBuffer(8))).toBeInstanceOf(ctor);
    }
  });

  it('不正なスカラ型は PlutoError', () => {
    expect(() => createTrackingView(99 as ScalarType, new ArrayBuffer(8))).toThrow(PlutoError);
  });
});
