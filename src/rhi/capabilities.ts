/**
 * @file RHI の能力 (docs/06-rhi.md §3、`docs/02` §12)。
 * 能力差は隠さない。上位層は初期化時に `RhiDevice.caps` を 1 回だけ読んで分岐する。
 */

/** デバイスの能力。WebGPU と WebGL2 で値が違う。 */
export interface RhiCapabilities {
  /** バックエンドの種類。 */
  readonly backend: 'webgpu' | 'webgl2';
  /** compute が使えるか。WebGPU は `true`、WebGL2 は `false`。 */
  readonly compute: boolean;
  /**間接描画が使えるか。WebGPU は `true`、WebGL2 は `false`。 */
  readonly indirectDraw: boolean;
  /** ストレージバッファが使えるか。WebGL2 はデータテクスチャで読み取り専用にエミュレートする。 */
  readonly storageBuffers: boolean;
  /** タイムスタンプクエリが使えるか。false のときは `createQuerySet` が `null` を返す。 */
  readonly timestampQuery: boolean;
  /** 浮動小数点のレンダーターゲットが使えるか。WebGL2 は `EXT_color_buffer_float` 次第。 */
  readonly floatRenderTarget: boolean;
  /** 浮動小数点のブレンドが使えるか。WebGL2 は `EXT_float_blend` 次第。 */
  readonly floatBlend: boolean;
  /** テクスチャの 1 辺の最大値 (px)。 */
  readonly maxTextureSize: number;
  /** テクスチャ配列の最大レイヤー数。 */
  readonly maxTextureArrayLayers: number;
  /** ストレージバッファの最大バイト数。WebGL2 はデータテクスチャの上限から算出する。 */
  readonly maxStorageBufferBytes: number;
  /** ワークグループの 1 次元あたりの最大要素数。WebGL2 は 0。 */
  readonly maxComputeWorkgroupSize: number;
  /** 1 ワークグループあたりの合計起動数の上限。WebGPU は adapter.limits、WebGL2 は 0。 */
  readonly maxComputeInvocationsPerWorkgroup: number;
  /** ユニフォームバッファの `offsetBytes` の最小の倍数。WebGPU は adapter.limits、WebGL2 は 256。 */
  readonly minUniformBufferOffsetAlignment: number;
  /** ストレージバッファの `offsetBytes` の最小の倍数。WebGPU は adapter.limits、WebGL2 は 256。 */
  readonly minStorageBufferOffsetAlignment: number;
  /** BC7 が使えるか。WebGPU は `texture-compression-bc`、WebGL2 は `EXT_texture_compression_bptc`。 */
  readonly textureCompressionBC7: boolean;
  /** ETC2 が使えるか。WebGPU は `texture-compression-etc2`、WebGL2 は `WEBGL_compressed_texture_etc`。 */
  readonly textureCompressionETC2: boolean;
  /** ASTC 4x4 (LDR) が使えるか。WebGPU は `texture-compression-astc`、WebGL2 は `WEBGL_compressed_texture_astc`。 */
  readonly textureCompressionASTC: boolean;
}
