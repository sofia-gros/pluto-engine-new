// 共通定数定義 (docs/07-renderer.md §2)

// コンピュートの 1D ワークグループサイズ
const WORKGROUP_SIZE: u32 = 256u;

// スプライト 1 個のバイト数
const SPRITE_STRIDE_BYTES: u32 = 32u;

// スプライト 1 個の u32 ワード数
const SPRITE_STRIDE_WORDS: u32 = 8u;

// スプライト最大数の既定値
const DEFAULT_MAX_SPRITES: u32 = 1048576u;

// レイヤー上限 (排他)
const MAX_LAYERS: u32 = 1024u;

// テクスチャ配列 1 層の幅・高さ (px)
const ATLAS_PAGE_SIZE: u32 = 2048u;

// テクスチャ配列の最大層数
const MAX_ATLAS_PAGES: u32 = 64u;

// フレームテーブルの最大要素数
const MAX_FRAMES: u32 = 65536u;

// フレーム 1 個のバイト数
const FRAME_STRIDE_BYTES: u32 = 32u;

// WebGL2 データテクスチャの幅 (texel)
const DATA_TEXTURE_WIDTH: u32 = 2048u;

// GPU Tier グループのスロット範囲の整列単位 (= データテクスチャ 1 行)
const GPU_GROUP_ALIGN: u32 = 1024u;

// 同時カメラ数
const MAX_CAMERAS: u32 = 8u;

// 描画ビン数 (Opaque / Alpha / Additive)
const BIN_COUNT: u32 = 3u;

// フレームの page でこのビットが立っていれば圧縮テクスチャ配列を参照
const FRAME_PAGE_COMPRESSED_BIT: u32 = 0x10000u;

// 初期化時に予約する白一色のフレーム ID
const WHITE_FRAME_ID: u32 = 0u;

// タイルマップのチャンク 1 辺のタイル数
const TILEMAP_CHUNK_SIZE: u32 = 32u;

// 図形描画の頂点ストレージの総容量
const GRAPHICS_MAX_VERTICES: u32 = 262144u;

// TextHandle 1 個が既定で確保するグリフ数
const TEXT_DEFAULT_MAX_GLYPHS: u32 = 256u;

// 同時に有効な光源数
const MAX_LIGHTS: u32 = 4096u;
