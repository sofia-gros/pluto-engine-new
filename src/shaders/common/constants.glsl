// 共通定数定義 (docs/07-renderer.md §2)

// コンピュートの 1D ワークグループサイズ
const uint WORKGROUP_SIZE = 256u;

// スプライト 1 個のバイト数
const uint SPRITE_STRIDE_BYTES = 32u;

// スプライト 1 個の u32 ワード数
const uint SPRITE_STRIDE_WORDS = 8u;

// スプライト最大数の既定値
const uint DEFAULT_MAX_SPRITES = 1048576u;

// レイヤー上限 (排他)
const uint MAX_LAYERS = 1024u;

// テクスチャ配列 1 層の幅・高さ (px)
const uint ATLAS_PAGE_SIZE = 2048u;

// テクスチャ配列の最大層数
const uint MAX_ATLAS_PAGES = 64u;

// フレームテーブルの最大要素数
const uint MAX_FRAMES = 65536u;

// フレーム 1 個のバイト数
const uint FRAME_STRIDE_BYTES = 32u;

// WebGL2 データテクスチャの幅 (texel)
const uint DATA_TEXTURE_WIDTH = 2048u;

// GPU Tier グループのスロット範囲の整列単位 (= データテクスチャ 1 行)
const uint GPU_GROUP_ALIGN = 1024u;

// 同時カメラ数
const uint MAX_CAMERAS = 8u;

// 描画ビン数 (Opaque / Alpha / Additive)
const uint BIN_COUNT = 3u;

// フレームの page でこのビットが立っていれば圧縮テクスチャ配列を参照
const uint FRAME_PAGE_COMPRESSED_BIT = 0x10000u;

// 初期化時に予約する白一色のフレーム ID
const uint WHITE_FRAME_ID = 0u;

// タイルマップのチャンク 1 辺のタイル数
const uint TILEMAP_CHUNK_SIZE = 32u;

// 図形描画の頂点ストレージの総容量
const uint GRAPHICS_MAX_VERTICES = 262144u;

// TextHandle 1 個が既定で確保するグリフ数
const uint TEXT_DEFAULT_MAX_GLYPHS = 256u;

// 同時に有効な光源数
const uint MAX_LIGHTS = 4096u;
