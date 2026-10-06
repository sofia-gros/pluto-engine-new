import { describe, expect, it } from 'vitest';
import { SCALAR_BYTES, ScalarType } from '../../../../src/core/memory/scalar-type';

describe('scalar-type', () => {
  it('ScalarType の値は 04 §1.2 の表どおり (f64 は提供しない)', () => {
    expect(ScalarType).toEqual({ F32: 0, I32: 1, U32: 2, I16: 3, U16: 4, I8: 5, U8: 6 });
    expect(Object.keys(ScalarType)).not.toContain('F64');
  });

  it('SCALAR_BYTES は各型のバイト長', () => {
    expect(SCALAR_BYTES[ScalarType.F32]).toBe(4);
    expect(SCALAR_BYTES[ScalarType.I32]).toBe(4);
    expect(SCALAR_BYTES[ScalarType.U32]).toBe(4);
    expect(SCALAR_BYTES[ScalarType.I16]).toBe(2);
    expect(SCALAR_BYTES[ScalarType.U16]).toBe(2);
    expect(SCALAR_BYTES[ScalarType.I8]).toBe(1);
    expect(SCALAR_BYTES[ScalarType.U8]).toBe(1);
  });

  it('境界値: 全型が表に載っている (7 種類)', () => {
    expect(Object.keys(SCALAR_BYTES)).toHaveLength(7);
  });
});
