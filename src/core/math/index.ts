/**
 * @file core/math モジュールの公開窓口。
 */

export {
  DEG_TO_RAD,
  RAD_TO_DEG,
  EPSILON,
  clamp,
  lerp,
  inverseLerp,
  smoothstep,
  wrap,
  approxEqual,
} from './scalar';
export {
  create as vec2Create,
  set as vec2Set,
  copy as vec2Copy,
  add as vec2Add,
  sub as vec2Sub,
  scale as vec2Scale,
  dot as vec2Dot,
  cross as vec2Cross,
  lenSq as vec2LenSq,
  len as vec2Len,
  normalize as vec2Normalize,
} from './vec2';
export {
  create as affine2dCreate,
  identity as affine2dIdentity,
  copy as affine2dCopy,
  multiply as affine2dMultiply,
  invert as affine2dInvert,
  transformVec2 as affine2dTransformVec2,
} from './affine2d';
export {
  create as aabbCreate,
  set as aabbSet,
  copy as aabbCopy,
  intersects as aabbIntersects,
  containsPoint as aabbContainsPoint,
} from './aabb';
export { nextPow2, isPow2, popcount32, ctz32, log2Floor } from './bits';
export { packHalf2x16, unpackHalf2x16 } from './half';
export { packColor, hexToColor, unpackR, unpackG, unpackB, unpackA } from './color';
export { createRng } from './rng';
export type { Rng } from './rng';
