/**
 * @file テクスチャアトラス JSON ローダ・パーサ
 *
 * TexturePacker の JSON Hash 形式および Array 形式を解析し、
 * AtlasAsset オブジェクトを生成する。
 */

import { ErrorCode, PlutoError } from '../../core/debug';
import {
  AssetType,
  type AtlasAsset,
  type AtlasFrameData,
  type Point2D,
  type TexturePackerArrayJson,
  type TexturePackerHashJson,
  type TexturePackerJson,
  type TexturePackerRawArrayFrame,
  type TexturePackerRawFrame,
} from '../asset-types';

/**
 * TexturePackerRawFrame から標準の AtlasFrameData を構築する。
 *
 * @param raw 生のフレームデータ
 * @returns 正規化されたフレームデータ
 */
function parseRawFrame(raw: TexturePackerRawFrame): AtlasFrameData {
  if (
    typeof raw.frame.x !== 'number' ||
    typeof raw.frame.y !== 'number' ||
    typeof raw.frame.w !== 'number' ||
    typeof raw.frame.h !== 'number'
  ) {
    throw new PlutoError(
      ErrorCode.InvalidArgument,
      'フレームの矩形情報 (x, y, w, h) が不正または存在しません。',
    );
  }

  const { x, y, w, h } = raw.frame;
  const isRotated = Boolean(raw.rotated);
  const isTrimmed = Boolean(raw.trimmed);

  const spriteSourceSize =
    raw.spriteSourceSize !== undefined
      ? {
          x: raw.spriteSourceSize.x,
          y: raw.spriteSourceSize.y,
          w: raw.spriteSourceSize.w,
          h: raw.spriteSourceSize.h,
        }
      : { x: 0, y: 0, w, h };

  const sourceSize =
    raw.sourceSize !== undefined
      ? {
          w: raw.sourceSize.w,
          h: raw.sourceSize.h,
        }
      : { w, h };

  let pivot: Point2D | undefined = undefined;
  if (raw.pivot !== undefined) {
    pivot = { x: raw.pivot.x, y: raw.pivot.y };
  } else if (raw.anchor !== undefined) {
    pivot = { x: raw.anchor.x, y: raw.anchor.y };
  }

  let anchor: Point2D | undefined = undefined;
  if (raw.anchor !== undefined) {
    anchor = { x: raw.anchor.x, y: raw.anchor.y };
  } else if (raw.pivot !== undefined) {
    anchor = { x: raw.pivot.x, y: raw.pivot.y };
  }

  return {
    frame: { x, y, w, h },
    rotated: isRotated,
    trimmed: isTrimmed,
    spriteSourceSize,
    sourceSize,
    pivot,
    anchor,
  };
}

/**
 * Array 形式のフレーム一覧をパースする。
 */
function parseArrayFrames(
  list: readonly TexturePackerRawArrayFrame[],
  framesMap: Map<string, AtlasFrameData>,
): void {
  for (let i = 0; i < list.length; i++) {
    const item = list[i];
    if (typeof item.filename !== 'string') {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        `frames[${String(i)}] に filename が指定されていません。`,
      );
    }
    framesMap.set(item.filename, parseRawFrame(item));
  }
}

/**
 * Hash 形式のフレーム一覧をパースする。
 */
function parseHashFrames(
  hash: Record<string, TexturePackerRawFrame>,
  framesMap: Map<string, AtlasFrameData>,
): void {
  for (const [frameKey, item] of Object.entries(hash)) {
    framesMap.set(frameKey, parseRawFrame(item));
  }
}

/**
 * TexturePacker JSON (Hash または Array 形式) を解析し、AtlasAsset を生成する。
 *
 * @param key アトラスのアセットキー
 * @param jsonOrString TexturePacker の JSON オブジェクトまたは JSON 文字列
 * @param overrideImageKey 関連付ける画像アセットキー (未指定時は json.meta.image を使用)
 * @returns 解析された AtlasAsset
 * @throws {@link PlutoError} JSON が不正な場合
 */
export function parseAtlasJson(
  key: string,
  jsonOrString: string | TexturePackerJson,
  overrideImageKey?: string,
): AtlasAsset {
  let parsed: unknown;
  if (typeof jsonOrString === 'string') {
    try {
      parsed = JSON.parse(jsonOrString) as unknown;
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      throw new PlutoError(ErrorCode.InvalidArgument, `JSON の解析に失敗しました: ${msg}`);
    }
  } else {
    parsed = jsonOrString;
  }

  if (typeof parsed !== 'object' || parsed === null) {
    throw new PlutoError(ErrorCode.InvalidArgument, 'アトラスデータがオブジェクトではありません。');
  }

  const data = parsed as Partial<TexturePackerHashJson & TexturePackerArrayJson>;
  if (data.frames === undefined) {
    throw new PlutoError(
      ErrorCode.InvalidArgument,
      'アトラスデータに frames フィールドが存在しません。',
    );
  }

  const framesMap = new Map<string, AtlasFrameData>();

  if (Array.isArray(data.frames)) {
    parseArrayFrames(data.frames, framesMap);
  } else if (typeof data.frames === 'object') {
    parseHashFrames(data.frames, framesMap);
  } else {
    throw new PlutoError(
      ErrorCode.InvalidArgument,
      'frames フィールドはオブジェクトまたは配列である必要があります。',
    );
  }

  const imageKey = overrideImageKey ?? data.meta?.image ?? `${key}_image`;
  const size =
    data.meta?.size !== undefined ? { w: data.meta.size.w, h: data.meta.size.h } : { w: 0, h: 0 };

  return {
    key,
    type: AssetType.Atlas,
    imageKey,
    size,
    frames: framesMap,
  };
}

/**
 * URL からアトラス JSON をフェッチしてパースする。
 *
 * @param key アセットキー
 * @param url フェッチ先 URL
 * @param overrideImageKey 関連付ける画像アセットキー
 * @returns AtlasAsset の Promise
 */
export async function loadAtlasJson(
  key: string,
  url: string,
  overrideImageKey?: string,
): Promise<AtlasAsset> {
  let response: Response;
  try {
    response = await fetch(url);
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : String(e);
    throw new PlutoError(
      ErrorCode.AssetLoadFailed,
      `アトラス JSON のフェッチに失敗しました (${url}): ${msg}`,
    );
  }

  if (!response.ok) {
    throw new PlutoError(
      ErrorCode.AssetLoadFailed,
      `アトラス JSON のフェッチステータスエラー (${url}): HTTP ${String(response.status)}`,
    );
  }

  const text = await response.text();
  return parseAtlasJson(key, text, overrideImageKey);
}
