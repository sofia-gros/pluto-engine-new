/**
 * @file スプライトパックシステム (docs/07-renderer.md §11)
 *
 * Phase.PostUpdate において、WorldTransform, Sprite, SpriteSlot を持つ
 * エンティティのチャンクに対して spritePackKernel をスケジュールする。
 */

import { defineSystem, Phase, type SystemDef } from '../../core/ecs';
import { WorldTransform } from '../../transform';
import { Sprite, SpriteSlot } from './sprite-components';
import { spritePackKernel } from './sprite-pack-kernel';

/**
 * スプライトパックシステム定義。
 * Transform 計算後 (PostUpdate, order: 10) に実行される。
 */
export const SpritePackSystem: SystemDef = defineSystem({
  name: 'Sprite.Pack',
  phase: Phase.PostUpdate,
  query: { all: [WorldTransform, Sprite, SpriteSlot] },
  kernel: spritePackKernel,
  order: 10,
});
