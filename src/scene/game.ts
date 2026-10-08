/**
 * @file Game クラス: ゲーム本体・ライフサイクル・メインループ (docs/09-api-design.md §4.1, docs/02-directory-structure.md §22)
 *
 * デバイス生成、ECS World、スケジューラ、レンダラ、テクスチャ管理、シーンマネージャを統合し、
 * requestAnimationFrame ループによって毎フレームのシミュレーションと描画を駆動する。
 */

import { AssetCache, Loader } from '../assets';
import { ErrorCode, PlutoError, logger } from '../core/debug';
import { Phase, World } from '../core/ecs';
import { FixedStepper, PerformanceClock } from '../core/time';
import { createScheduler, type Scheduler } from '../jobs';
import {
  FrameTable,
  Renderer,
  SpriteBuffer,
  SpritePackSystem,
  SpriteRenderer,
  TextureArrayManager,
} from '../render';
import { createDevice, type RhiDevice } from '../rhi';
import { TransformHierarchySystem, TransformRootSystem } from '../transform';
import { type GameConfig, normalizeGameConfig, type ResolvedGameConfig } from './game-config';
import { SceneManager } from './scene-manager';

/**
 * Game コンストラクタへの依存サービス一式 (内部用)。
 */
export interface GameDependencies {
  /** 正規化済みゲーム設定 */
  readonly config: ResolvedGameConfig;
  /** マウント先キャンバス */
  readonly canvas: HTMLCanvasElement;
  /** RHI デバイス */
  readonly device: RhiDevice;
  /** ジョブスケジューラ */
  readonly scheduler: Scheduler;
  /** ECS ワールド */
  readonly world: World;
  /** レンダラ */
  readonly renderer: Renderer;
  /** スプライトバッファ */
  readonly spriteBuffer: SpriteBuffer;
  /** フレームテーブル */
  readonly frameTable: FrameTable;
  /** テクスチャ配列マネージャ */
  readonly textureArrayManager: TextureArrayManager;
  /** アセットキャッシュ */
  readonly assetCache: AssetCache;
  /** アセットローダー */
  readonly loader: Loader;
  /** シーンマネージャ */
  readonly scenes: SceneManager;
}

/**
 * Pluto Engine ゲーム本体クラス。
 */
export class Game {
  /** 正規化済みゲーム設定 */
  public readonly config: ResolvedGameConfig;
  /** マウント先 HTMLCanvasElement */
  public readonly canvas: HTMLCanvasElement;
  /** RHI デバイス */
  public readonly device: RhiDevice;
  /** ジョブスケジューラ */
  public readonly scheduler: Scheduler;
  /** ECS ワールド */
  public readonly world: World;
  /** レンダラ */
  public readonly renderer: Renderer;
  /** スプライトバッファ */
  public readonly spriteBuffer: SpriteBuffer;
  /** フレームテーブル */
  public readonly frameTable: FrameTable;
  /** テクスチャ配列マネージャ */
  public readonly textureArrayManager: TextureArrayManager;
  /** アセットキャッシュ */
  public readonly assetCache: AssetCache;
  /** アセットローダー */
  public readonly loader: Loader;
  /** シーンマネージャ */
  public readonly scenes: SceneManager;

  private _isPaused = false;
  private _isDestroyed = false;
  private _rafId: number | null = null;
  private readonly clock = new PerformanceClock();
  private readonly stepper: FixedStepper;
  private lastTime = 0;

  /**
   * ゲームインスタンスを非同期で初期化・生成する。
   *
   * @param userConfig ゲーム設定
   * @returns 生成・起動された Game インスタンス
   */
  public static async create(userConfig: GameConfig): Promise<Game> {
    const devicePixelRatio =
      typeof window !== 'undefined' && typeof window.devicePixelRatio === 'number'
        ? window.devicePixelRatio
        : 1;
    const config = normalizeGameConfig(userConfig, devicePixelRatio);

    let canvas = config.canvas;
    if (canvas === undefined) {
      if (typeof document !== 'undefined') {
        canvas = document.createElement('canvas');
        canvas.width = config.width * config.resolution;
        canvas.height = config.height * config.resolution;
        if (config.parent !== undefined) {
          config.parent.appendChild(canvas);
        } else {
          document.body.appendChild(canvas);
        }
      } else {
        throw new PlutoError(
          ErrorCode.InvalidState,
          'DOM 環境が存在しないためキャンバスを生成できません。',
        );
      }
    }

    const device = await createDevice({
      canvas,
      backend: config.backend,
    });

    const scheduler = createScheduler({
      maxWorkers: config.maxWorkers,
    });

    const world = new World({
      maxEntities: config.maxEntities,
    });
    world.setExecutor(scheduler);

    // コアシステムの登録
    world.addSystem(TransformRootSystem);
    world.addSystem(TransformHierarchySystem);
    world.addSystem(SpritePackSystem);

    const spriteBuffer = new SpriteBuffer(config.maxSprites);
    const frameTable = new FrameTable();
    const textureArrayManager = new TextureArrayManager(device, {
      pixelArt: config.pixelArt,
    });

    const spriteRenderer = new SpriteRenderer(
      device,
      spriteBuffer,
      frameTable,
      {
        colorTexture: textureArrayManager.rgbaTexture,
        compressedTexture: textureArrayManager.compressedTexture,
        sampler: textureArrayManager.sampler,
      },
      { maxSprites: config.maxSprites },
    );

    const renderer = new Renderer(device, spriteRenderer, {
      width: config.width,
      height: config.height,
    });

    // 背景色の反映
    const bgR = ((config.backgroundColor >>> 16) & 0xff) / 255;
    const bgG = ((config.backgroundColor >>> 8) & 0xff) / 255;
    const bgB = (config.backgroundColor & 0xff) / 255;
    renderer.cameraStore.setClearColor(0, bgR, bgG, bgB, 1.0);

    const assetCache = new AssetCache();
    const loader = new Loader(assetCache);

    const sceneManager = new SceneManager({
      world,
      frameTable,
      spriteBuffer,
      cameraStore: renderer.cameraStore,
      assetCache,
      loader,
      width: config.width,
      height: config.height,
      textureArrayManager,
    });

    const game = new Game({
      config,
      canvas,
      device,
      scheduler,
      world,
      renderer,
      spriteBuffer,
      frameTable,
      textureArrayManager,
      assetCache,
      loader,
      scenes: sceneManager,
    });

    device.onDeviceLost.on('lost', (payload) => {
      logger.error(`GPU デバイスがロストしました (reason=${payload.reason})。ループを停止します。`);
      game.destroy();
    });

    // シーンの登録と最初のシーン開始
    for (const SceneCtor of config.scenes) {
      sceneManager.add(SceneCtor.name, SceneCtor);
    }

    if (config.scenes.length > 0) {
      const firstSceneClass = config.scenes[0];
      await sceneManager.start(firstSceneClass.name);
    }

    game.startLoop();
    return game;
  }

  private constructor(deps: GameDependencies) {
    this.config = deps.config;
    this.canvas = deps.canvas;
    this.device = deps.device;
    this.scheduler = deps.scheduler;
    this.world = deps.world;
    this.renderer = deps.renderer;
    this.spriteBuffer = deps.spriteBuffer;
    this.frameTable = deps.frameTable;
    this.textureArrayManager = deps.textureArrayManager;
    this.assetCache = deps.assetCache;
    this.loader = deps.loader;
    this.scenes = deps.scenes;
    this.stepper = new FixedStepper(1000 / deps.config.fixedStepHz, deps.config.maxSubSteps);
  }

  /** 現在使用中のレンダリングバックエンド ('webgpu' | 'webgl2') */
  public get backend(): 'webgpu' | 'webgl2' {
    return this.device.caps.backend;
  }

  /** 並列ワーカースレッド実行中か */
  public get isParallel(): boolean {
    return this.scheduler.concurrency > 1;
  }

  /** メインループが稼働中か */
  public get isRunning(): boolean {
    return this._rafId !== null && !this._isDestroyed;
  }

  /** 一時停止中か */
  public get isPaused(): boolean {
    return this._isPaused;
  }

  /** 破棄済みか */
  public get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  /** メインループの一時停止 */
  public pause(): void {
    this._isPaused = true;
  }

  /** メインループの再開 */
  public resume(): void {
    this._isPaused = false;
  }

  /**
   * 1 フレームの更新・描画ステップ (手動呼び出し可。pause 中も実行する)。
   *
   * @param timestamp 現在時刻 (ms)
   */
  public step(timestamp: number): void {
    if (this._isDestroyed) {
      return;
    }

    if (this.lastTime === 0) {
      this.lastTime = timestamp;
    }
    const deltaMs = Math.min(100, Math.max(0, timestamp - this.lastTime));
    this.lastTime = timestamp;

    // 時間単位の変換 (ms ⇔ 秒) は game.ts だけで行う (docs/09-api-design.md A7)。
    const dtSec = deltaMs / 1000.0;

    // TODO(T-5.2): 入力モジュールができたら、ここで input.snapshot() を確定する。
    this.world.runPhase(Phase.PreUpdate, dtSec);

    this.stepper.update(deltaMs, (stepMs) => {
      this.world.runPhase(Phase.FixedUpdate, stepMs / 1000.0);
    });

    this.scenes.update(timestamp, deltaMs);

    this.world.runPhase(Phase.Update, dtSec);

    this.world.runPhase(Phase.PostUpdate, dtSec);
    this.world.flush();

    this.world.runPhase(Phase.PreRender, dtSec);

    this.renderer.render(this.world);
  }

  /** ゲーム本体および全リソースの破棄 */
  public destroy(): void {
    if (this._isDestroyed) {
      return;
    }
    this._isDestroyed = true;

    if (this._rafId !== null && typeof cancelAnimationFrame !== 'undefined') {
      cancelAnimationFrame(this._rafId);
      this._rafId = null;
    }

    this.scenes.destroy();
    this.renderer.destroy();
    this.scheduler.dispose();
    this.device.destroy();
  }

  private startLoop(): void {
    if (typeof requestAnimationFrame === 'undefined') {
      return;
    }

    const loop = (time: number): void => {
      if (this._isDestroyed) {
        return;
      }
      if (!this._isPaused) {
        this.step(time);
      }
      this._rafId = requestAnimationFrame(loop);
    };

    this.lastTime = this.clock.now();
    this._rafId = requestAnimationFrame(loop);
  }
}
