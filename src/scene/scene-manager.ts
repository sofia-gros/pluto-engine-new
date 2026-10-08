/**
 * @file シーン管理マネージャ (docs/09-api-design.md §4.2, docs/02-directory-structure.md §22)
 *
 * 複数シーンの登録、開始、停止、一時停止、ライフサイクル実行を統括する。
 */

import type { AssetCache, Loader } from '../assets';
import { ErrorCode, PlutoError } from '../core/debug';
import type { World } from '../core/ecs';
import type { CameraStore, FrameTable, SpriteBuffer, TextureArrayManager } from '../render';
import { CameraManager } from './camera-manager';
import type { SceneClass } from './game-config';
import { GameObjectFactory } from './game-object-factory';
import type { Scene } from './scene';

/**
 * SceneManager 依存サービスコンテキスト。
 */
export interface SceneContext {
  readonly world: World;
  readonly frameTable: FrameTable;
  readonly spriteBuffer: SpriteBuffer;
  readonly cameraStore: CameraStore;
  readonly assetCache: AssetCache;
  readonly loader: Loader;
  /** ゲーム解像度の幅 (メインカメラのビューポート初期値) */
  readonly width: number;
  /** ゲーム解像度の高さ (メインカメラのビューポート初期値) */
  readonly height: number;
  /** テクスチャ配列マネージャ (preload 完了時の texture 登録用。省略時は登録しない) */
  readonly textureArrayManager?: TextureArrayManager;
}

/**
 * 実行中シーンのエントリ情報。
 */
interface ActiveSceneEntry {
  readonly key: string;
  readonly instance: Scene;
  readonly cameraManager: CameraManager;
  isPaused: boolean;
}

/**
 * シーンマネージャクラス。
 */
export class SceneManager {
  private readonly context: SceneContext;
  private readonly registry = new Map<string, SceneClass>();
  private readonly activeScenes = new Map<string, ActiveSceneEntry>();

  public constructor(context: SceneContext) {
    this.context = context;
  }

  /**
   * シーンクラスをキー名とともに登録する。
   *
   * @param key シーン識別キー
   * @param sceneClass シーンクラス
   */
  public add(key: string, sceneClass: SceneClass): void {
    this.registry.set(key, sceneClass);
  }

  /**
   * 指定したキーのシーンを開始する。
   *
   * @param key シーン識別キー
   * @param data init に渡す初期化データ
   */
  public async start(key: string, data?: unknown): Promise<Scene> {
    if (this.registry.get(key) === undefined) {
      throw new PlutoError(ErrorCode.InvalidArgument, `シーンが見つかりません: ${key}`);
    }

    if (this.activeScenes.has(key)) {
      this.stop(key);
    }

    return this.createActiveScene(key, data);
  }

  /**
   * 指定したキーのシーンを開始し、既存シーンと重ねて実行する。
   *
   * @param key シーン識別キー
   * @param data init に渡す初期化データ
   */
  public async launch(key: string, data?: unknown): Promise<Scene> {
    if (this.registry.get(key) === undefined) {
      throw new PlutoError(ErrorCode.InvalidArgument, `シーンが見つかりません: ${key}`);
    }
    if (this.activeScenes.has(key)) {
      throw new PlutoError(ErrorCode.InvalidState, `シーンは既に実行中です: ${key}`);
    }

    return this.createActiveScene(key, data);
  }

  private async createActiveScene(key: string, data: unknown): Promise<Scene> {
    const SceneCtor = this.registry.get(key);
    if (SceneCtor === undefined) {
      throw new PlutoError(ErrorCode.InvalidArgument, `シーンが見つかりません: ${key}`);
    }

    const instance = new SceneCtor();
    const cameraManager = new CameraManager(
      this.context.cameraStore,
      this.context.width,
      this.context.height,
    );
    const gameObjectFactory = new GameObjectFactory(
      this.context.world,
      this.context.frameTable,
      this.context.spriteBuffer,
      this.context.assetCache,
    );

    instance.add = gameObjectFactory;
    instance.load = this.context.loader;
    instance.cameras = cameraManager;
    instance.scenes = this;
    instance.world = this.context.world;

    const entry: ActiveSceneEntry = {
      key,
      instance,
      cameraManager,
      isPaused: false,
    };
    this.activeScenes.set(key, entry);

    try {
      instance.init(data);
      instance.preload();
      if (this.context.loader.queueLength > 0) {
        await this.context.loader.load();
      }
      if (this.context.textureArrayManager !== undefined) {
        gameObjectFactory.registerPreloadedTextures(this.context.textureArrayManager);
      }
      instance.create();
    } catch (e: unknown) {
      this.activeScenes.delete(key);
      cameraManager.destroy();
      throw e;
    }

    return instance;
  }

  /**
   * 指定したキーのシーンを停止・破棄する。
   *
   * @param key シーン識別キー
   */
  public stop(key: string): void {
    const entry = this.activeScenes.get(key);
    if (entry === undefined) {
      return;
    }

    entry.instance.shutdown();
    entry.instance.events.emit('shutdown', undefined);
    entry.cameraManager.destroy();
    this.activeScenes.delete(key);
  }

  /**
   * 指定したキーのシーンを一時停止する。
   *
   * @param key シーン識別キー
   */
  public pause(key: string): void {
    const entry = this.activeScenes.get(key);
    if (entry) {
      entry.isPaused = true;
    }
  }

  /**
   * 指定したキーのシーンの実行を再開する。
   *
   * @param key シーン識別キー
   */
  public resume(key: string): void {
    const entry = this.activeScenes.get(key);
    if (entry) {
      entry.isPaused = false;
    }
  }

  /**
   * 実行中のシーンインスタンスを取得する。
   *
   * @param key シーン識別キー
   * @returns シーンインスタンス、未実行時は undefined
   */
  public getScene(key: string): Scene | undefined {
    const entry = this.activeScenes.get(key);
    if (entry === undefined) {
      return undefined;
    }
    return entry.instance;
  }

  /**
   * 毎フレームのアクティブシーン更新処理を実行する。
   *
   * @param time 経過時間 (ms)
   * @param deltaMs フレーム差分時間 (ms)
   */
  public update(time: number, deltaMs: number): void {
    for (const entry of this.activeScenes.values()) {
      if (!entry.isPaused) {
        entry.instance.update(time, deltaMs);
        entry.instance.events.emit('update', { time, deltaMs });
        entry.cameraManager.update();
      }
    }
  }

  /**
   * 全シーンを停止・破棄する。
   */
  public destroy(): void {
    const keys = Array.from(this.activeScenes.keys());
    for (const key of keys) {
      this.stop(key);
    }
    this.registry.clear();
  }
}
