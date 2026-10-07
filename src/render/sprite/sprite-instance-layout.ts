// @pluto-hot
/**
 * @file スプライト 32 バイトインスタンスレイアウトの SSOT
 *
 * docs/07-renderer.md §3 に基づき、スプライトインスタンスのワードオフセット、
 * フラグ定数、およびパック関数を提供する。
 */

import { f32ToF16, packHalf2x16 } from '../../core/math';
import { SPRITE_STRIDE_WORDS } from '../render-constants';

/** posX ワードオフセット */
export const SPRITE_WORD_POS_X = 0;
/** posY ワードオフセット */
export const SPRITE_WORD_POS_Y = 1;
/** scale (scaleX f16 + scaleY f16) ワードオフセット */
export const SPRITE_WORD_SCALE = 2;
/** rotLayer (rotation f16 + layer u16) ワードオフセット */
export const SPRITE_WORD_ROT_LAYER = 3;
/** frameId ワードオフセット */
export const SPRITE_WORD_FRAME_ID = 4;
/** tint (RGBA8) ワードオフセット */
export const SPRITE_WORD_TINT = 5;
/** flags ワードオフセット */
export const SPRITE_WORD_FLAGS = 6;
/** sortKey ワードオフセット */
export const SPRITE_WORD_SORT_KEY = 7;

/** 描画フラグ: 可視 (0 なら描画しない) */
export const FLAG_VISIBLE = 1;
/** 描画フラグ: 左右反転 */
export const FLAG_FLIP_X = 2;
/** 描画フラグ: 上下反転 */
export const FLAG_FLIP_Y = 4;
/** 描画フラグ: 不透明 (アルファテスト) */
export const FLAG_OPAQUE = 8;
/** 描画フラグ: 加算合成 */
export const FLAG_ADDITIVE = 16;
/** 描画フラグ: 2D GI 遮蔽物 (Radiance Cascades) */
export const FLAG_OCCLUDER = 32;

/**
 * スプライトパラメータを 32 バイトのインスタンスデータとしてバッファにパックする。
 *
 * @hot
 * @param dstU32 パック先 Uint32Array
 * @param dstF32 同一バッファを共有する Float32Array
 * @param slot スプライトのスロット番号
 * @param posX ワールド X 座標
 * @param posY ワールド Y 座標
 * @param scaleX X スケール (正値)
 * @param scaleY Y スケール (正値)
 * @param rotation 回転角 (ラジアン)
 * @param layer レイヤー (0〜1023)
 * @param frameId フレームテーブルのインデックス
 * @param tint RGBA8 ティントカラー
 * @param flags 描画フラグ
 * @param sortKey 同一レイヤー内のソートキー (0.0〜1.0 未満)
 */
export function packSprite(
  dstU32: Uint32Array,
  dstF32: Float32Array,
  slot: number,
  posX: number,
  posY: number,
  scaleX: number,
  scaleY: number,
  rotation: number,
  layer: number,
  frameId: number,
  tint: number,
  flags: number,
  sortKey: number,
): void {
  const base = (slot * SPRITE_STRIDE_WORDS) | 0;

  dstF32[base + SPRITE_WORD_POS_X] = posX;
  dstF32[base + SPRITE_WORD_POS_Y] = posY;
  dstU32[base + SPRITE_WORD_SCALE] = packHalf2x16(scaleX, scaleY);

  const rotF16 = f32ToF16(rotation);
  dstU32[base + SPRITE_WORD_ROT_LAYER] = (rotF16 | ((layer & 0xffff) << 16)) >>> 0;

  dstU32[base + SPRITE_WORD_FRAME_ID] = frameId >>> 0;
  dstU32[base + SPRITE_WORD_TINT] = tint >>> 0;
  dstU32[base + SPRITE_WORD_FLAGS] = flags >>> 0;
  dstF32[base + SPRITE_WORD_SORT_KEY] = sortKey;
}
