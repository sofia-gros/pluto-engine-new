/**
 * @file render モジュールの公開窓口。
 */

export {
  WORKGROUP_SIZE,
  SPRITE_STRIDE_BYTES,
  SPRITE_STRIDE_WORDS,
  DEFAULT_MAX_SPRITES,
  MAX_LAYERS,
  ATLAS_PAGE_SIZE,
  MAX_ATLAS_PAGES,
  MAX_FRAMES,
  FRAME_STRIDE_BYTES,
  DATA_TEXTURE_WIDTH,
  GPU_GROUP_ALIGN,
  MAX_CAMERAS,
  BIN_COUNT,
  FRAME_PAGE_COMPRESSED_BIT,
  WHITE_FRAME_ID,
  TILEMAP_CHUNK_SIZE,
  GRAPHICS_MAX_VERTICES,
  TEXT_DEFAULT_MAX_GLYPHS,
  MAX_LIGHTS,
} from './render-constants';

export {
  AtlasPacker,
  type PackerImageInput,
  type PackedLocation,
  type AtlasPackerOptions,
} from './texture/atlas-packer';

export { FrameTable, type FrameDescriptor, type FrameInfo } from './texture/frame-table';

export {
  TextureArrayManager,
  selectCompressedTextureFormat,
  type TextureArrayManagerOptions,
} from './texture/texture-array-manager';

export {
  SPRITE_WORD_POS_X,
  SPRITE_WORD_POS_Y,
  SPRITE_WORD_SCALE,
  SPRITE_WORD_ROT_LAYER,
  SPRITE_WORD_FRAME_ID,
  SPRITE_WORD_TINT,
  SPRITE_WORD_FLAGS,
  SPRITE_WORD_SORT_KEY,
  FLAG_VISIBLE,
  FLAG_FLIP_X,
  FLAG_FLIP_Y,
  FLAG_OPAQUE,
  FLAG_ADDITIVE,
  FLAG_OCCLUDER,
  packSprite,
} from './sprite/sprite-instance-layout';

export { Sprite, SpriteSlot } from './sprite/sprite-components';

export { SpriteBuffer, MAX_UPLOAD_RANGES_PER_FRAME } from './sprite/sprite-buffer';

export { spritePackKernel, spritePackKernelFn } from './sprite/sprite-pack-kernel';

export { spriteCpuCullKernel, spriteCpuCullKernelFn } from './sprite/sprite-cpu-cull-kernel';

export { SpritePackSystem } from './sprite/sprite-pack-system';

export { SpritePathCpuAssisted, type SpritePathTextures } from './sprite/sprite-path-cpu-assisted';

export { SpriteRenderer, type SpriteRendererOptions } from './sprite/sprite-renderer';
