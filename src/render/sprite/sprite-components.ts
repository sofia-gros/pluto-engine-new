/**
 * @file スプライトコンポーネント定義 (docs/07-renderer.md §11)
 *
 * SoA ECS でスプライトを管理するための Sprite および SpriteSlot コンポーネントを定義する。
 */

import { defineComponent } from '../../core/ecs';
import { ScalarType } from '../../core/memory';

/**
 * スプライトコンポーネント (名前・型固定)。
 */
export const Sprite = defineComponent('Sprite', {
  frame: ScalarType.U32,
  tint: ScalarType.U32,
  layer: ScalarType.U16,
  flags: ScalarType.U16,
  sortKey: ScalarType.F32,
});

/**
 * スプライトスロットコンポーネント (GPU スロット割当番号)。
 */
export const SpriteSlot = defineComponent('SpriteSlot', {
  slot: ScalarType.U32,
});
