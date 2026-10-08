/**
 * @file フレーム全体の描画オーケストレータ (docs/07-renderer.md §12, docs/02-directory-structure.md §17)。
 * カメラ、レンダーグラフ、スプライトレンダラを統合し、マルチカメラ描画とパイプライン実行を統括する。
 */

import type { World } from '../core/ecs';
import { LoadAction, type RhiCommandEncoder, type RhiDevice, type RhiTexture } from '../rhi';
import { CameraStore, type CameraViewport } from './camera/camera-store';
import { CameraUniforms, CAMERA_UNIFORM_STRIDE_FLOATS } from './camera/camera-uniforms';
import { RenderGraph } from './graph/render-graph';
import type { RenderPassContext } from './graph/render-pass-node';
import { TransientPool } from './graph/transient-pool';
import type { SpriteRenderer } from './sprite/sprite-renderer';

/** レンダラ設定オプション */
export interface RendererOptions {
  /** 初期キャンバス幅 (px) */
  readonly width?: number;
  /** 初期キャンバス高さ (px) */
  readonly height?: number;
}

/**
 * フレーム全体の描画オーケストレータクラス。
 */
export class Renderer {
  /** RHI デバイス */
  public readonly device: RhiDevice;
  /** カメラ SoA ストア */
  public readonly cameraStore: CameraStore;
  /** カメラ uniform 管理 */
  public readonly cameraUniforms: CameraUniforms;
  /** レンダーグラフ */
  public readonly graph: RenderGraph;
  /** 一時テクスチャプール */
  public readonly transientPool: TransientPool;
  /** スプライトレンダラ */
  public readonly spriteRenderer: SpriteRenderer;

  private readonly namedResources = new Map<string, RhiTexture>();
  private readonly tempViewport: CameraViewport = { x: 0, y: 0, width: 800, height: 600 };
  private canvasWidth: number;
  private canvasHeight: number;

  public constructor(
    device: RhiDevice,
    spriteRenderer: SpriteRenderer,
    options: RendererOptions = {},
  ) {
    this.device = device;
    this.spriteRenderer = spriteRenderer;
    this.canvasWidth = options.width ?? 800;
    this.canvasHeight = options.height ?? 600;

    this.cameraStore = new CameraStore();
    this.cameraUniforms = new CameraUniforms(device);
    this.graph = new RenderGraph();
    this.transientPool = new TransientPool(device);

    // 既定のメインカメラ (ID: 0) を初期化
    const mainCamId = this.cameraStore.allocate(this.canvasWidth, this.canvasHeight);
    this.cameraStore.setCenter(mainCamId, this.canvasWidth * 0.5, this.canvasHeight * 0.5);
    this.cameraStore.setViewport(mainCamId, 0, 0, this.canvasWidth, this.canvasHeight);

    // 既定のスプライト描画パスを登録
    this.registerDefaultSpritePass();
  }

  private currentWorld: World | null = null;

  /**
   * 既定のスプライト描画パスをレンダーグラフに登録する。
   */
  private registerDefaultSpritePass(): void {
    this.graph.addPassInOrder({
      name: 'sprite:draw',
      execute: (encoder: RhiCommandEncoder, ctx: RenderPassContext) => {
        const camId = ctx.currentCameraId;
        ctx.cameraStore.getViewport(camId, this.tempViewport);
        const cIdx = camId * 4;
        const r = ctx.cameraStore.clearColor[cIdx] ?? 0;
        const g = ctx.cameraStore.clearColor[cIdx + 1] ?? 0;
        const b = ctx.cameraStore.clearColor[cIdx + 2] ?? 0;
        const a = ctx.cameraStore.clearColor[cIdx + 3] ?? 1;

        const offset = camId * CAMERA_UNIFORM_STRIDE_FLOATS;
        const camData = ctx.cameraUniforms.staging.subarray(offset, offset + 16);
        const cullRect: readonly [number, number, number, number] = [
          camData[8],
          camData[9],
          camData[10],
          camData[11],
        ];

        const pass = encoder.beginRenderPass({
          colorAttachments: [
            {
              view: ctx.targetTexture,
              load: LoadAction.Clear,
              store: true,
              clearColor: [r, g, b, a],
            },
          ],
        });

        pass.setViewport(
          this.tempViewport.x,
          this.tempViewport.y,
          this.tempViewport.width,
          this.tempViewport.height,
        );

        if (this.currentWorld) {
          this.spriteRenderer.render(pass, camData, cullRect, this.currentWorld, encoder);
        }
        pass.end();
      },
    });
  }

  /**
   * 1 フレームの描画を実行する。
   * @param world ECS ワールド
   */
  public render(world: World): void {
    this.currentWorld = world;
    // 1. スプライトバッファの未転送データを GPU に転送
    this.spriteRenderer.spriteBuffer.flushToGpu(this.device);

    // 2. 有効な各カメラの uniform を更新・転送
    const activeIds = this.cameraStore.getActiveIds();
    for (const camId of activeIds) {
      this.cameraUniforms.update(this.cameraStore, camId);
    }
    this.cameraUniforms.upload();

    // 3. 現在のスワップチェーンターゲットを取得
    const targetTexture = this.device.getCurrentTexture();
    const encoder = this.device.createCommandEncoder();

    // 4. 各カメラに対してレンダーグラフを実行
    for (const camId of activeIds) {
      const ctx: RenderPassContext = {
        device: this.device,
        cameraStore: this.cameraStore,
        cameraUniforms: this.cameraUniforms,
        transientPool: this.transientPool,
        currentCameraId: camId,
        targetTexture,
        getResource: (name: string) => this.namedResources.get(name),
        setResource: (name: string, tex: RhiTexture) => {
          this.namedResources.set(name, tex);
        },
      };

      this.graph.execute(encoder, ctx);
    }

    // 5. コマンドバッファを GPU に投入
    this.device.submit(encoder);

    // 6. フレーム終了時の一時リソースリセット
    this.transientPool.reset();
    this.currentWorld = null;
  }

  /**
   * キャンバス解像度の変更を反映する。
   * @param width 新しい幅 (px)
   * @param height 新しい高さ (px)
   */
  public resize(width: number, height: number): void {
    this.canvasWidth = width;
    this.canvasHeight = height;
    if (this.cameraStore.isActive(0)) {
      this.cameraStore.setViewport(0, 0, 0, width, height);
    }
  }

  /**
   * レンダラのリソースを破棄する。
   */
  public destroy(): void {
    this.cameraUniforms.destroy();
    this.transientPool.destroy();
    this.spriteRenderer.spriteBuffer.destroy();
    this.namedResources.clear();
  }
}
