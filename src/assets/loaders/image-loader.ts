/**
 * @file 画像アセットローダ
 *
 * 画像 URL または Blob から ImageBitmap / HTMLImageElement を読み込み、
 * ImageAsset を生成する。
 */

import { ErrorCode, PlutoError } from '../../core/debug';
import { AssetType, type ImageAsset } from '../asset-types';

/**
 * 画像読み込みオプション。
 */
export interface ImageLoaderOptions {
  /**
   * createImageBitmap を使用するかどうか (デフォルト: true)。
   * false の場合は HTMLImageElement を使用する。
   */
  readonly useImageBitmap?: boolean;
}

/**
 * URL または Blob から画像を非同期に読み込み、ImageAsset を生成する。
 *
 * @param key アセットキー
 * @param src 画像の URL または Blob
 * @param options 読み込みオプション
 * @returns 読み込まれた ImageAsset
 * @throws {@link PlutoError} 読み込みに失敗した場合、または画像 API が未サポートの場合
 */
export async function loadImage(
  key: string,
  src: string | Blob,
  options: ImageLoaderOptions = {},
): Promise<ImageAsset> {
  const shouldPreferImageBitmap = options.useImageBitmap ?? true;

  // 1. createImageBitmap が利用可能な場合 (最優先)
  if (shouldPreferImageBitmap && typeof createImageBitmap === 'function') {
    try {
      let blob: Blob;
      if (typeof src === 'string') {
        const response = await fetch(src);
        if (!response.ok) {
          throw new PlutoError(
            ErrorCode.AssetLoadFailed,
            `画像のフェッチに失敗しました (${src}): HTTP ${String(response.status)}`,
          );
        }
        blob = await response.blob();
      } else {
        blob = src;
      }

      const bitmap = await createImageBitmap(blob);
      return {
        key,
        type: AssetType.Image,
        source: bitmap,
        width: bitmap.width,
        height: bitmap.height,
      };
    } catch (e: unknown) {
      if (e instanceof PlutoError) {
        throw e;
      }
      const msg = e instanceof Error ? e.message : String(e);
      throw new PlutoError(ErrorCode.AssetLoadFailed, `ImageBitmap の生成に失敗しました: ${msg}`);
    }
  }

  // 2. HTMLImageElement (ブラウザ環境)
  if (typeof Image === 'function') {
    return new Promise<ImageAsset>((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';

      img.onload = () => {
        resolve({
          key,
          type: AssetType.Image,
          source: img,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
        });
      };

      img.onerror = () => {
        reject(
          new PlutoError(
            ErrorCode.AssetLoadFailed,
            `画像の読み込みに失敗しました (${typeof src === 'string' ? src : 'Blob'})`,
          ),
        );
      };

      if (typeof src === 'string') {
        img.src = src;
      } else {
        const url = URL.createObjectURL(src);
        img.src = url;
      }
    });
  }

  // 3. Node.js 等で画像 API が存在しない場合
  throw new PlutoError(
    ErrorCode.UnsupportedFeature,
    '現在の環境では画像デコード API (createImageBitmap または Image) がサポートされていません。',
  );
}
