/**
 * @file Scene 基底クラス (docs/09-api-design.md §4.2, docs/02-directory-structure.md §22)
 *
 * init -> preload -> create -> update -> shutdown のライフサイクル hooks と
 * 各サブシステムへのアクセスを提供する。
 */

import type { Loader } from '../assets';
import type { World } from '../core/ecs';
import { ErrorCode, PlutoError } from '../core/debug';
import { EventEmitter } from '../core/events';
import type { CameraManager } from './camera-manager';
import type { GameObjectFactory } from './game-object-factory';
import type { SceneManager } from './scene-manager';

/**
 * シーンが発火するイベント定義。
 */
export interface SceneEvents extends Record<string, unknown> {
  /** 毎フレームの更新通知 */
  readonly update: { readonly time: number; readonly deltaMs: number };
  /** シーン停止通知 */
  readonly shutdown: undefined;
}

/**
 * シーン基底クラス。
 */
export abstract class Scene {
  private _add: GameObjectFactory | null = null;
  private _load: Loader | null = null;
  private _cameras: CameraManager | null = null;
  private _scenes: SceneManager | null = null;
  private _world: World | null = null;

  /** シーンイベントエミッタ */
  public readonly events: EventEmitter<SceneEvents> = new EventEmitter<SceneEvents>();

  /** オブジェクトファクトリ */
  public get add(): GameObjectFactory {
    return this.requireServices().add;
  }

  public set add(factory: GameObjectFactory) {
    this._add = factory;
  }

  /** アセットローダー */
  public get load(): Loader {
    return this.requireServices().load;
  }

  public set load(loader: Loader) {
    this._load = loader;
  }

  /** カメラマネージャ */
  public get cameras(): CameraManager {
    return this.requireServices().cameras;
  }

  public set cameras(manager: CameraManager) {
    this._cameras = manager;
  }

  /** シーンマネージャ */
  public get scenes(): SceneManager {
    return this.requireServices().scenes;
  }

  public set scenes(manager: SceneManager) {
    this._scenes = manager;
  }

  /** 低レベル ECS World */
  public get world(): World {
    return this.requireServices().world;
  }

  public set world(world: World) {
    this._world = world;
  }

  /**
   * シーン初期化 hook。
   *
   * @param data シーン起動時に渡された任意のデータ
   */
  public init(data?: unknown): void {
    // 既定では何もしない (必要に応じてサブクラスで上書きする)。
    if (data === undefined) {
      return;
    }
  }

  /**
   * アセット事前読み込み hook。
   */
  public preload(): void {
    // 既定では何もしない (必要に応じてサブクラスで上書きする)。
    return;
  }

  /**
   * オブジェクト生成・初期設定 hook。
   */
  public create(): void {
    // 既定では何もしない (必要に応じてサブクラスで上書きする)。
    return;
  }

  /**
   * 毎フレームの更新 hook。
   *
   * @param time ゲーム開始からの経過時間 (ms)
   * @param deltaMs 前フレームからの差分時間 (ms)
   */
  public update(time: number, deltaMs: number): void {
    // 既定では何もしない (必要に応じてサブクラスで上書きする)。
    if (time < 0 || deltaMs < 0) {
      return;
    }
  }

  /**
   * シーン停止・クリーンアップ hook。
   */
  public shutdown(): void {
    // 既定では何もしない (必要に応じてサブクラスで上書きする)。
    return;
  }

  private requireServices(): {
    readonly add: GameObjectFactory;
    readonly load: Loader;
    readonly cameras: CameraManager;
    readonly scenes: SceneManager;
    readonly world: World;
  } {
    if (
      this._add === null ||
      this._load === null ||
      this._cameras === null ||
      this._scenes === null ||
      this._world === null
    ) {
      throw new PlutoError(ErrorCode.InvalidState, 'Scene: サービス注入前にアクセスしました。');
    }
    const add = this._add;
    const load = this._load;
    const cameras = this._cameras;
    const scenes = this._scenes;
    const world = this._world;
    return { add, load, cameras, scenes, world };
  }
}
