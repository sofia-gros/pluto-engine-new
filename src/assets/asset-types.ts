/**
 * @file アセットシステムの型定義
 *
 * 画像、アトラス、汎用アセットのインターフェースおよび
 * TexturePacker の JSON 構造を定義する。
 */

/**
 * アセットを識別する一意のキー型。
 */
export type AssetKey = string;

/**
 * アセットの種別定数。
 */
export const AssetType = {
  Image: 'image',
  Atlas: 'atlas',
  Audio: 'audio',
  Binary: 'binary',
  Json: 'json',
} as const;

/**
 * アセットの種別型。
 */
export type AssetType = (typeof AssetType)[keyof typeof AssetType];

/**
 * 基本アセットインターフェース。
 */
export interface BaseAsset {
  readonly key: AssetKey;
  readonly type: AssetType;
}

/**
 * 画像アセット。
 */
export interface ImageAsset extends BaseAsset {
  readonly type: typeof AssetType.Image;
  readonly source: TexImageSource;
  readonly width: number;
  readonly height: number;
}

/**
 * 2D 矩形領域。
 */
export interface Rect {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
}

/**
 * 2D サイズ。
 */
export interface Size {
  readonly w: number;
  readonly h: number;
}

/**
 * 2D ポイント / アンカー。
 */
export interface Point2D {
  readonly x: number;
  readonly y: number;
}

/**
 * アトラス内の 1 フレーム情報。
 */
export interface AtlasFrameData {
  readonly frame: Rect;
  readonly rotated: boolean;
  readonly trimmed: boolean;
  readonly spriteSourceSize: Rect;
  readonly sourceSize: Size;
  readonly pivot?: Point2D | undefined;
  readonly anchor?: Point2D | undefined;
}

/**
 * テクスチャアトラスアセット。
 */
export interface AtlasAsset extends BaseAsset {
  readonly type: typeof AssetType.Atlas;
  readonly imageKey: string;
  readonly size: Size;
  readonly frames: ReadonlyMap<string, AtlasFrameData>;
}

/**
 * TexturePacker のフレームデータ (生 JSON 形式)。
 */
export interface TexturePackerRawFrame {
  readonly frame: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  };
  readonly rotated?: boolean;
  readonly trimmed?: boolean;
  readonly spriteSourceSize?: {
    readonly x: number;
    readonly y: number;
    readonly w: number;
    readonly h: number;
  };
  readonly sourceSize?: {
    readonly w: number;
    readonly h: number;
  };
  readonly pivot?: {
    readonly x: number;
    readonly y: number;
  };
  readonly anchor?: {
    readonly x: number;
    readonly y: number;
  };
}

/**
 * TexturePacker Array 形式の 1 フレーム要素。
 */
export interface TexturePackerRawArrayFrame extends TexturePackerRawFrame {
  readonly filename: string;
}

/**
 * TexturePacker のメタ情報。
 */
export interface TexturePackerMeta {
  readonly image?: string;
  readonly size?: {
    readonly w: number;
    readonly h: number;
  };
  readonly scale?: string | number;
  readonly format?: string;
}

/**
 * TexturePacker Hash 形式のルートデータ。
 */
export interface TexturePackerHashJson {
  readonly frames: Readonly<Record<string, TexturePackerRawFrame>>;
  readonly meta?: TexturePackerMeta;
}

/**
 * TexturePacker Array 形式のルートデータ。
 */
export interface TexturePackerArrayJson {
  readonly frames: readonly TexturePackerRawArrayFrame[];
  readonly meta?: TexturePackerMeta;
}

/**
 * TexturePacker JSON (Hash または Array 形式)。
 */
export type TexturePackerJson = TexturePackerHashJson | TexturePackerArrayJson;
