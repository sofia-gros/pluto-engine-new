/**
 * @file システム (ゲームロジック) の定義とフェーズ。
 */

import type { World } from './world';
import type { QueryDesc } from './query';
import type { AnyComponentDef } from './component';

export const Phase = {
  PreUpdate: 'PreUpdate',
  FixedUpdate: 'FixedUpdate',
  Update: 'Update',
  PostUpdate: 'PostUpdate',
  PreRender: 'PreRender',
} as const;
export type Phase = (typeof Phase)[keyof typeof Phase];

export interface SystemDef {
  /** システム名 (デバッグやプロファイル用) */
  name: string;

  /** 実行されるフェーズ */
  phase: Phase;

  /** オプション: システムが使用するクエリ条件 */
  query?: QueryDesc;

  /** オプション: 書き込みを行う(dirtyを立てる)コンポーネント。このシステムが更新する成分を宣言する。 */
  writes?: AnyComponentDef[];

  /** オプション: ジョブシステムで実行可能なカーネル関数 */
  kernel?: unknown;

  /**
   * オプション: シングルスレッド・直接実行時のコールバック
   * @param world 属するWorld
   * @param dt デルタタイム
   */
  run?: (world: World, dt: number) => void;

  /** 実行順序(同一フェーズ内のソート順)。デフォルトは 0 */
  order?: number;
}

/**
 * システム定義を生成・型推論するためのヘルパー関数。
 * @param def システム定義オブジェクト
 * @returns そのままのシステム定義
 */
export function defineSystem(def: SystemDef): SystemDef {
  return def;
}
