/**
 * @file 2D テクスチャ配列マネージャ
 *
 * RGBA8 テクスチャ配列およびデバイスが対応する圧縮テクスチャ配列 (BC7 / ASTC / ETC2)
 * の層割当、画像アップロード、サンプラ管理を行う。
 */

import { ErrorCode, PlutoError } from '../../core/debug';
import {
  AddressMode,
  FilterMode,
  TextureDimension,
  TextureFormat,
  TextureUsage,
  type RhiDevice,
  type RhiSampler,
  type RhiTexture,
} from '../../rhi';
import { ATLAS_PAGE_SIZE, FRAME_PAGE_COMPRESSED_BIT, MAX_ATLAS_PAGES } from '../render-constants';

/**
 * テクスチャ配列マネージャの設定オプション。
 */
export interface TextureArrayManagerOptions {
  /** ピクセルアート向けサンプリング (Nearest) を使用するか (既定: false) */
  readonly pixelArt?: boolean;
  /** RGBA8 配列の最大層数 (既定: MAX_ATLAS_PAGES) */
  readonly maxRgbaLayers?: number;
  /** 圧縮配列の最大層数 (既定: MAX_ATLAS_PAGES) */
  readonly maxCompressedLayers?: number;
}

/**
 * デバイスの能力に基づき、最適な圧縮テクスチャ形式を選択する。
 * 優先順: BC7 → ASTC 4x4 → ETC2。
 *
 * @param device RHI デバイス
 * @returns 選択された TextureFormat、または未対応なら undefined
 */
export function selectCompressedTextureFormat(device: RhiDevice): number | undefined {
  const caps = device.caps;
  if (caps.textureCompressionBC7) {
    return TextureFormat.BC7RGBAUnorm;
  }
  if (caps.textureCompressionASTC) {
    return TextureFormat.ASTC4x4Unorm;
  }
  if (caps.textureCompressionETC2) {
    return TextureFormat.ETC2RGBA8Unorm;
  }
  return undefined;
}

/**
 * 2D テクスチャ配列マネージャクラス。
 */
export class TextureArrayManager {
  private readonly device: RhiDevice;
  private readonly maxRgbaPages: number;
  private readonly maxCompressedPages: number;
  private readonly supportedCompressedFormat: number | undefined;

  private rgbaPageCount = 0;
  private compressedPageCount = 0;

  private readonly rgbaTextureResource: RhiTexture;
  private compressedTextureResource: RhiTexture | undefined = undefined;
  private dummyTextureResource: RhiTexture | undefined = undefined;
  private readonly samplerResource: RhiSampler;

  /**
   * @param device RHI デバイス
   * @param options 設定オプション
   */
  public constructor(device: RhiDevice, options: TextureArrayManagerOptions = {}) {
    this.device = device;
    const caps = device.caps;

    const requestedRgba = options.maxRgbaLayers ?? MAX_ATLAS_PAGES;
    const requestedCompressed = options.maxCompressedLayers ?? MAX_ATLAS_PAGES;

    this.maxRgbaPages = Math.min(requestedRgba, caps.maxTextureArrayLayers);
    this.maxCompressedPages = Math.min(requestedCompressed, caps.maxTextureArrayLayers);

    this.supportedCompressedFormat = selectCompressedTextureFormat(device);

    // 1. RGBA8 テクスチャ配列の生成
    this.rgbaTextureResource = this.device.createTexture({
      format: TextureFormat.RGBA8Unorm,
      width: ATLAS_PAGE_SIZE,
      height: ATLAS_PAGE_SIZE,
      dimension: TextureDimension.D2Array,
      layers: this.maxRgbaPages,
      usage: TextureUsage.TextureBinding | TextureUsage.CopyDst,
      label: 'TextureArray_RGBA8',
    });

    // 2. サンプラの生成
    const filter = options.pixelArt ? FilterMode.Nearest : FilterMode.Linear;
    this.samplerResource = this.device.createSampler({
      filter,
      addressModeU: AddressMode.ClampToEdge,
      addressModeV: AddressMode.ClampToEdge,
    });

    // 3. 白フレーム (WHITE_FRAME_ID) 用のピクセル初期化 (層 0 の左上 4x4)
    this.initWhitePixels();
  }

  /**
   * サポートされている圧縮テクスチャ形式を取得する。
   *
   * @returns TextureFormat、または未対応なら undefined
   */
  public get compressedFormat(): number | undefined {
    return this.supportedCompressedFormat;
  }

  /**
   * RGBA8 テクスチャ配列リソースを取得する。
   *
   * @returns RHI テクスチャ
   */
  public get rgbaTexture(): RhiTexture {
    return this.rgbaTextureResource;
  }

  /**
   * 圧縮テクスチャ配列リソースを取得する。
   * 未生成時はダミーテクスチャ配列を返す。
   *
   * @returns RHI テクスチャ
   */
  public get compressedTexture(): RhiTexture {
    if (this.compressedTextureResource !== undefined) {
      return this.compressedTextureResource;
    }
    this.dummyTextureResource ??= this.device.createTexture({
      format: TextureFormat.RGBA8Unorm,
      width: 1,
      height: 1,
      dimension: TextureDimension.D2Array,
      layers: 1,
      usage: TextureUsage.TextureBinding | TextureUsage.CopyDst,
      label: 'DummyCompressedTextureArray',
    });
    return this.dummyTextureResource;
  }

  /**
   * テクスチャサンプラを取得する。
   *
   * @returns RHI サンプラ
   */
  public get sampler(): RhiSampler {
    return this.samplerResource;
  }

  /**
   * 新しい RGBA8 ページを割り当てる。
   *
   * @returns 割り当てられた層インデックス
   * @throws {@link PlutoError} 最大層数を超過した場合
   */
  public allocateRgbaPage(): number {
    if (this.rgbaPageCount >= this.maxRgbaPages) {
      throw new PlutoError(
        ErrorCode.CapacityExceeded,
        `RGBA8 テクスチャ配列の最大層数 (${String(this.maxRgbaPages)}) を超過しました。`,
      );
    }
    const page = this.rgbaPageCount;
    this.rgbaPageCount += 1;
    return page;
  }

  /**
   * 新しい圧縮テクスチャページを割り当てる。
   * 戻り値には FRAME_PAGE_COMPRESSED_BIT が設定される。
   *
   * @returns FRAME_PAGE_COMPRESSED_BIT が設定されたページ番号
   * @throws {@link PlutoError} 圧縮テクスチャが未サポート、または最大層数を超過した場合
   */
  public allocateCompressedPage(): number {
    if (this.supportedCompressedFormat === undefined) {
      throw new PlutoError(
        ErrorCode.UnsupportedFeature,
        '現在のデバイスは圧縮テクスチャ形式 (BC7 / ASTC / ETC2) に対応していません。',
      );
    }

    if (this.compressedPageCount >= this.maxCompressedPages) {
      throw new PlutoError(
        ErrorCode.CapacityExceeded,
        `圧縮テクスチャ配列の最大層数 (${String(this.maxCompressedPages)}) を超過しました。`,
      );
    }

    // 遅延生成
    this.compressedTextureResource ??= this.device.createTexture({
      format: this.supportedCompressedFormat,
      width: ATLAS_PAGE_SIZE,
      height: ATLAS_PAGE_SIZE,
      dimension: TextureDimension.D2Array,
      layers: this.maxCompressedPages,
      usage: TextureUsage.TextureBinding | TextureUsage.CopyDst,
      label: 'TextureArray_Compressed',
    });

    const pageIndex = this.compressedPageCount;
    this.compressedPageCount += 1;
    return pageIndex | FRAME_PAGE_COMPRESSED_BIT;
  }

  /**
   * RGBA8 画像データをテクスチャ配列の指定位置にアップロードする。
   *
   * @param page 層番号
   * @param offsetX X 座標 (px)
   * @param offsetY Y 座標 (px)
   * @param width 幅 (px)
   * @param height 高さ (px)
   * @param data 画像データ (ArrayBufferView または ImageBitmap)
   */
  public uploadRgba(
    page: number,
    offsetX: number,
    offsetY: number,
    width: number,
    height: number,
    data: ArrayBufferView | ImageBitmap,
  ): void {
    if (page < 0 || page >= this.maxRgbaPages) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        `無効な RGBA8 ページ番号です: ${String(page)}`,
      );
    }

    this.device.writeTexture(
      this.rgbaTextureResource,
      {
        offsetX,
        offsetY,
        layer: page,
        width,
        height,
      },
      data,
    );
  }

  /**
   * 圧縮テクスチャデータをテクスチャ配列の指定層にアップロードする。
   *
   * @param rawPage ページ番号 (FRAME_PAGE_COMPRESSED_BIT を含むか素の番号)
   * @param width 幅 (px, 4の倍数)
   * @param height 高さ (px, 4の倍数)
   * @param data 圧縮データ
   */
  public uploadCompressed(
    rawPage: number,
    width: number,
    height: number,
    data: ArrayBufferView,
  ): void {
    const page = rawPage & ~FRAME_PAGE_COMPRESSED_BIT;
    if (this.compressedTextureResource === undefined) {
      throw new PlutoError(ErrorCode.InvalidState, '圧縮テクスチャ配列が初期化されていません。');
    }

    if (page < 0 || page >= this.maxCompressedPages) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        `無効な圧縮テクスチャページ番号です: ${String(page)}`,
      );
    }

    this.device.writeTexture(
      this.compressedTextureResource,
      {
        offsetX: 0,
        offsetY: 0,
        layer: page,
        width,
        height,
      },
      data,
    );
  }

  /**
   * 白フレーム (WHITE_FRAME_ID) 用に、層 0 の左上 4x4 を白ピクセルで埋める。
   */
  private initWhitePixels(): void {
    const whiteData = new Uint8Array(4 * 4 * 4);
    whiteData.fill(255);

    this.device.writeTexture(
      this.rgbaTextureResource,
      {
        offsetX: 0,
        offsetY: 0,
        layer: 0,
        width: 4,
        height: 4,
      },
      whiteData,
    );
  }
}
