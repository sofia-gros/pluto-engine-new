/**
 * @file Pluto Engine 公開 API エントリ。
 */

/** エンジンのバージョン */
export const VERSION: string = __VERSION__;

export {
  Game,
  Scene,
  SceneManager,
  GameObjectFactory,
  Camera,
  CameraManager,
  SpriteHandle,
  SpriteBatch,
  DEFAULT_GAME_CONFIG,
  normalizeGameConfig,
  type GameConfig,
  type ResolvedGameConfig,
  type SceneClass,
  type GameDebugConfig,
  type FollowTarget,
  type CameraBounds,
  type BlendMode,
  type SpriteBatchConfig,
  type SpriteBatchColumnName,
  type SceneContext,
} from './scene';
