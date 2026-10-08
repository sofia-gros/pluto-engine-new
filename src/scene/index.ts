/**
 * @file scene モジュールの公開窓口。
 */

export {
  type GameConfig,
  type ResolvedGameConfig,
  type SceneClass,
  type GameDebugConfig,
  DEFAULT_GAME_CONFIG,
  normalizeGameConfig,
} from './game-config';

export { Game, type GameDependencies } from './game';

export { Scene } from './scene';

export { SceneManager, type SceneContext } from './scene-manager';

export { GameObjectFactory, type TextureUploader } from './game-object-factory';

export { Camera, CameraManager, type FollowTarget, type CameraBounds } from './camera-manager';

export { SpriteHandle, type BlendMode } from './handles/sprite-handle';

export {
  SpriteBatch,
  type SpriteBatchConfig,
  type SpriteBatchColumnName,
} from './handles/sprite-batch';
