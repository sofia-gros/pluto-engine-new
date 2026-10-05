import { describe, expect, it } from 'vitest';
import { Column } from '../../../../src/core/ecs/column';
import { ScalarType } from '../../../../src/core/memory/scalar-type';

describe('Column', () => {
  it('initializes correctly', () => {
    const col = new Column(ScalarType.F32, 10000);
    expect(col.type).toBe(ScalarType.F32);
    expect(col.data).toBeInstanceOf(Float32Array);
    // currentRows == 1024 なので要素数は 1024 になるはず
    expect(col.data.length).toBe(1024);
  });

  it('grows buffer and copies data', () => {
    const col = new Column(ScalarType.I32, 10000);
    col.data[0] = 42;
    col.data[1023] = 99;

    col.grow(1025);

    // nextRows は currentRows(1024) * 2 = 2048
    expect(col.data.length).toBe(2048);
    expect(col.data[0]).toBe(42);
    expect(col.data[1023]).toBe(99);
  });

  it('does not grow if newRows <= currentRows', () => {
    const col = new Column(ScalarType.F32, 10000);
    const originalData = col.data;
    col.grow(100);
    expect(col.data).toBe(originalData); // 同じ参照のまま
  });

  it('caps at maxRows', () => {
    const col = new Column(ScalarType.F32, 1500);
    col.grow(1500); // 1024 * 2 = 2048 だが、1500 に丸められるはず
    expect(col.data.length).toBe(1500);
  });

  it('supports all scalar types', () => {
    expect(new Column(ScalarType.I32, 10).data).toBeInstanceOf(Int32Array);
    expect(new Column(ScalarType.U32, 10).data).toBeInstanceOf(Uint32Array);
    expect(new Column(ScalarType.I16, 10).data).toBeInstanceOf(Int16Array);
    expect(new Column(ScalarType.U16, 10).data).toBeInstanceOf(Uint16Array);
    expect(new Column(ScalarType.I8, 10).data).toBeInstanceOf(Int8Array);
    expect(new Column(ScalarType.U8, 10).data).toBeInstanceOf(Uint8Array);
  });
});
