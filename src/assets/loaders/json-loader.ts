/**
 * @file 汎用 JSON ローダ
 *
 * URL から JSON を取得し、JsonAsset を生成する。
 */

import { ErrorCode, PlutoError } from '../../core/debug';
import { AssetType, type AssetKey, type JsonAsset } from '../asset-types';

/**
 * URL から JSON を非同期に読み込み、JsonAsset を生成する。
 *
 * @param key アセットキー
 * @param url JSON の URL
 * @returns 読み込まれた JsonAsset
 * @throws {@link PlutoError} 読み込み・解析に失敗した場合
 */
export async function loadJson(key: AssetKey, url: string): Promise<JsonAsset> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new PlutoError(
      ErrorCode.AssetLoadFailed,
      `JSON のフェッチに失敗しました (${url}): ${msg}`,
    );
  }
  if (!response.ok) {
    throw new PlutoError(
      ErrorCode.AssetLoadFailed,
      `JSON のフェッチに失敗しました (${url}): HTTP ${String(response.status)}`,
    );
  }
  let data: unknown;
  try {
    data = (await response.json()) as unknown;
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new PlutoError(ErrorCode.AssetLoadFailed, `JSON の解析に失敗しました (${url}): ${msg}`);
  }
  return { key, type: AssetType.Json, data };
}
