/**
 * @file レンダラ共通定数定義
 *
 * docs/07-renderer.md §2 およびシェーダ共通定数と一致する定数群を定義する。
 */

/** コンピュートの 1D ワークグループサイズ */
export const WORKGROUP_SIZE = 256;

/** スプライト 1 個のバイト数 */
export const SPRITE_STRIDE_BYTES = 32;

/** スプライト 1 個の u32 ワード数 */
export const SPRITE_STRIDE_WORDS = 8;

/** GameConfig.maxSprites の既定値 (上限 4,194,304) */
export const DEFAULT_MAX_SPRITES = 1_048_576;

/** レイヤー上限 (排他) */
export const MAX_LAYERS = 1024;

/** テクスチャ配列 1 層の幅・高さ (px) */
export const ATLAS_PAGE_SIZE = 2048;

/** テクスチャ配列の最大層数 */
export const MAX_ATLAS_PAGES = 64;

/** フレームテーブルの最大要素数 */
export const MAX_FRAMES = 65_536;

/** フレーム 1 個のバイト数 */
export const FRAME_STRIDE_BYTES = 32;

/** WebGL2 データテクスチャの幅 (texel) */
export const DATA_TEXTURE_WIDTH = 2048;

/** GPU Tier グループのスロット範囲の整列単位 (= データテクスチャ 1 行) */
export const GPU_GROUP_ALIGN = 1024;

/** 同時カメラ数 */
export const MAX_CAMERAS = 8;

/** 描画ビン数 (Opaque / Alpha / Additive) */
export const BIN_COUNT = 3;

/** フレームの page で圧縮テクスチャ配列を参照していることを示すビット */
export const FRAME_PAGE_COMPRESSED_BIT = 0x10000;

/** 初期化時に予約する白一色のフレーム ID */
export const WHITE_FRAME_ID = 0;

/** タイルマップのチャンク 1 辺のタイル数 */
export const TILEMAP_CHUNK_SIZE = 32;

/** 図形描画の頂点ストレージの総容量 */
export const GRAPHICS_MAX_VERTICES = 262_144;

/** TextHandle 1 個が既定で確保するグリフ数 */
export const TEXT_DEFAULT_MAX_GLYPHS = 256;

/** 同時に有効な光源数 */
export const MAX_LIGHTS = 4096;
