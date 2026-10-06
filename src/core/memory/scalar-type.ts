/**
 * @file スカラー型の定義。
 */

/**
 * ECS フィールドで使用可能なスカラー型。
 * f64 は帯域節約および GPU 非互換のため提供しない。
 */
export const ScalarType = {
  F32: 0,
  I32: 1,
  U32: 2,
  I16: 3,
  U16: 4,
  I8: 5,
  U8: 6,
} as const;

/** {@link ScalarType} の値の型。 */
export type ScalarType = (typeof ScalarType)[keyof typeof ScalarType];

/**
 * 各スカラー型のバイトサイズ。
 */
export const SCALAR_BYTES: Readonly<Record<ScalarType, number>> = {
  [ScalarType.F32]: 4,
  [ScalarType.I32]: 4,
  [ScalarType.U32]: 4,
  [ScalarType.I16]: 2,
  [ScalarType.U16]: 2,
  [ScalarType.I8]: 1,
  [ScalarType.U8]: 1,
};

/**
 * スカラー型に対応する TypedArray の型。
 */
export type TypedArrayOf<T extends ScalarType> = T extends typeof ScalarType.F32
  ? Float32Array
  : T extends typeof ScalarType.I32
    ? Int32Array
    : T extends typeof ScalarType.U32
      ? Uint32Array
      : T extends typeof ScalarType.I16
        ? Int16Array
        : T extends typeof ScalarType.U16
          ? Uint16Array
          : T extends typeof ScalarType.I8
            ? Int8Array
            : T extends typeof ScalarType.U8
              ? Uint8Array
              : never;
