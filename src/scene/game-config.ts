/**
 * @file ゲーム設定型定義、デフォルト値および検証 (docs/09-api-design.md §4.1, docs/02-directory-structure.md §22)
 */

import { ErrorCode, PlutoError } from '../core/debug';
import type { Scene } from './scene';

/** シーンのコンストラクタ型 */
export type SceneClass = new () => Scene;

/**
 * デバッグ用設定オプション。
 */
export interface GameDebugConfig {
  /** 統計オーバーレイ等の表示フラグ */
  readonly stats?: boolean;
}

/**
 * ゲーム初期化設定オプション。
 */
export interface GameConfig {
  /** 親 DOM 要素 */
  readonly parent?: HTMLElement;
  /** マウント先 HTMLCanvasElement */
  readonly canvas?: HTMLCanvasElement;
  /** ゲーム解像度の幅 (ピクセル) */
  readonly width: number;
  /** ゲーム解像度の高さ (ピクセル) */
  readonly height: number;
  /** 解像度スケール (既定: devicePixelRatio) */
  readonly resolution?: number;
  /** 背景色 (0xRRGGBB 数値, 既定: 0x000000) */
  readonly backgroundColor?: number;
  /** ピクセルパーフェクト描画 (テクスチャフィルタ nearest, 既定: false) */
  readonly pixelArt?: boolean;
  /** 使用バックエンド (既定: 'auto') */
  readonly backend?: 'auto' | 'webgpu' | 'webgl2';
  /** 最大スプライト数 (既定: 1,048,576) */
  readonly maxSprites?: number;
  /** 最大エンティティ数 (既定: 1,048,576) */
  readonly maxEntities?: number;
  /** 最大ワーカースレッド数 (既定: 7) */
  readonly maxWorkers?: number;
  /** 固定ステップシミュレーション周波数 (Hz, 既定: 60) */
  readonly fixedStepHz?: number;
  /** 1 フレームあたりの最大サブステップ数 (既定: 4) */
  readonly maxSubSteps?: number;
  /** シーンクラスの配列 (1 つ以上必須) */
  readonly scenes: readonly SceneClass[];
  /** デバッグオプション */
  readonly debug?: GameDebugConfig;
}

/**
 * 正規化済み確定ゲーム設定。
 */
export interface ResolvedGameConfig {
  readonly parent: HTMLElement | undefined;
  readonly canvas: HTMLCanvasElement | undefined;
  readonly width: number;
  readonly height: number;
  readonly resolution: number;
  readonly backgroundColor: number;
  readonly pixelArt: boolean;
  readonly backend: 'auto' | 'webgpu' | 'webgl2';
  readonly maxSprites: number;
  readonly maxEntities: number;
  readonly maxWorkers: number;
  readonly fixedStepHz: number;
  readonly maxSubSteps: number;
  readonly scenes: readonly SceneClass[];
  readonly debug: GameDebugConfig;
}

/**
 * 既定のゲーム設定値。
 */
export const DEFAULT_GAME_CONFIG: Readonly<
  Omit<ResolvedGameConfig, 'scenes' | 'parent' | 'canvas' | 'resolution' | 'debug'>
> = {
  width: 800,
  height: 600,
  backgroundColor: 0x000000,
  pixelArt: false,
  backend: 'auto',
  maxSprites: 1_048_576,
  maxEntities: 1_048_576,
  maxWorkers: 7,
  fixedStepHz: 60,
  maxSubSteps: 4,
};

/**
 * 入力された GameConfig を検証・正規化する。
 *
 * @param config ユーザー指定設定
 * @param defaultResolution resolution 省略時の既定値 (呼び出し側が devicePixelRatio 等を渡す)
 * @returns 正規化された確定設定オブジェクト
 * @throws {@link PlutoError} 不正な引数が指定された場合
 */
export function normalizeGameConfig(config: GameConfig, defaultResolution = 1): ResolvedGameConfig {
  if (config.scenes.length === 0) {
    throw new PlutoError(
      ErrorCode.InvalidArgument,
      'scenes には少なくとも 1 つの Scene クラスを指定する必要があります。',
    );
  }

  if (!(config.width >= 1) || !(config.height >= 1)) {
    throw new PlutoError(
      ErrorCode.InvalidArgument,
      'width と height は 1 以上の数値である必要があります。',
    );
  }

  const resolution = config.resolution ?? defaultResolution;

  return {
    parent: config.parent,
    canvas: config.canvas,
    width: config.width,
    height: config.height,
    resolution: requirePositiveNumber('resolution', resolution),
    backgroundColor: requireColor(
      'backgroundColor',
      config.backgroundColor ?? DEFAULT_GAME_CONFIG.backgroundColor,
    ),
    pixelArt: config.pixelArt ?? DEFAULT_GAME_CONFIG.pixelArt,
    backend: config.backend ?? DEFAULT_GAME_CONFIG.backend,
    maxSprites: requireIntInRange(
      'maxSprites',
      config.maxSprites ?? DEFAULT_GAME_CONFIG.maxSprites,
      1,
      4_194_304,
    ),
    maxEntities: requireIntInRange(
      'maxEntities',
      config.maxEntities ?? DEFAULT_GAME_CONFIG.maxEntities,
      1,
      4_194_303,
    ),
    maxWorkers: requireIntInRange(
      'maxWorkers',
      config.maxWorkers ?? DEFAULT_GAME_CONFIG.maxWorkers,
      0,
      1024,
    ),
    fixedStepHz: requirePositiveNumber(
      'fixedStepHz',
      config.fixedStepHz ?? DEFAULT_GAME_CONFIG.fixedStepHz,
    ),
    maxSubSteps: requireIntInRange(
      'maxSubSteps',
      config.maxSubSteps ?? DEFAULT_GAME_CONFIG.maxSubSteps,
      0,
      1000,
    ),
    scenes: [...config.scenes],
    debug: config.debug ?? {},
  };
}

function requirePositiveNumber(name: string, value: number): number {
  if (!(value > 0)) {
    throw new PlutoError(ErrorCode.InvalidArgument, `${name} は 0 より大きい数値にしてください。`);
  }
  return value;
}

function requireColor(name: string, value: number): number {
  if (!Number.isInteger(value) || value < 0 || value > 0xffffff) {
    throw new PlutoError(
      ErrorCode.InvalidArgument,
      `${name} は 0x000000〜0xFFFFFF の数値にしてください。`,
    );
  }
  return value;
}

function requireIntInRange(name: string, value: number, min: number, max: number): number {
  if (!Number.isInteger(value) || value < min || value > max) {
    throw new PlutoError(
      ErrorCode.InvalidArgument,
      `${name} は ${String(min)} 以上 ${String(max)} 以下の整数にしてください。`,
    );
  }
  return value;
}
