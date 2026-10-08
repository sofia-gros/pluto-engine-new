/**
 * @file スプライトレンダラ統括クラス (docs/07-renderer.md §8, §9, docs/02-directory-structure.md §17)
 *
 * デバイス能力 (caps.compute) に応じて最適な描画パス (GPU 駆動 or CPU 補助) を選択し、
 * スプライト描画全体の同期と実行を統括する。
 */

import type { World } from '../../core/ecs';
import type { RhiCommandEncoder, RhiDevice, RhiRenderPass } from '../../rhi';
import type { FrameTable } from '../texture/frame-table';
import type { SpriteBuffer } from './sprite-buffer';
import { SpritePathCpuAssisted, type SpritePathTextures } from './sprite-path-cpu-assisted';
import { SpritePathGpuDriven } from './sprite-path-gpu-driven';

/**
 * スプライトレンダラ初期化オプション。
 */
export interface SpriteRendererOptions {
  /** 最大スプライト数 (省略時は spriteBuffer.maxSprites) */
  readonly maxSprites?: number;
  /** GPU 駆動パスを強制的に無効化するかどうか */
  readonly forceCpuAssisted?: boolean;
}

/**
 * スプライト描画全体を統括するレンダラクラス。
 */
export class SpriteRenderer {
  /** RHI デバイス */
  public readonly device: RhiDevice;
  /** スプライトバッファ */
  public readonly spriteBuffer: SpriteBuffer;
  /** フレームテーブル */
  public readonly frameTable: FrameTable;

  /** CPU 補助パス */
  public readonly cpuAssistedPath: SpritePathCpuAssisted;
  /** GPU 駆動パス (非対応デバイスでは null) */
  public readonly gpuDrivenPath: SpritePathGpuDriven | null;

  /**
   * @param device RHI デバイス
   * @param spriteBuffer スプライトバッファ
   * @param frameTable フレームテーブル
   * @param textures テクスチャ群
   * @param options オプション
   */
  public constructor(
    device: RhiDevice,
    spriteBuffer: SpriteBuffer,
    frameTable: FrameTable,
    textures: SpritePathTextures,
    options?: SpriteRendererOptions,
  ) {
    this.device = device;
    this.spriteBuffer = spriteBuffer;
    this.frameTable = frameTable;

    const maxSprites = options?.maxSprites ?? spriteBuffer.maxSprites;

    this.cpuAssistedPath = new SpritePathCpuAssisted(
      device,
      maxSprites,
      spriteBuffer,
      frameTable,
      textures,
    );

    const canUseGpuDriven =
      !options?.forceCpuAssisted && device.caps.compute && device.caps.indirectDraw;

    this.gpuDrivenPath = canUseGpuDriven
      ? new SpritePathGpuDriven(device, maxSprites, spriteBuffer, frameTable, textures)
      : null;
  }

  /**
   * スプライト描画を実行する。
   *
   * @param pass レンダーパス
   * @param cameraData カメラ uniform データ (64 バイト Float32Array)
   * @param cullRect カメラカリング用矩形 [minX, minY, maxX, maxY]
   * @param world ECS ワールド
   * @param encoder コマンドエンコーダ (GPU 駆動パス利用時に必要)
   */
  public render(
    pass: RhiRenderPass,
    cameraData: Float32Array,
    cullRect: readonly [number, number, number, number],
    world: World,
    encoder?: RhiCommandEncoder,
  ): void {
    // 1. スプライトバッファとフレームテーブルの dirty 範囲を GPU に同期
    this.spriteBuffer.flushToGpu(this.device);
    this.frameTable.flush(this.device);

    // 2. パスの実行 (GPU 駆動が利用可能かつ encoder が与えられている場合は GPU 駆動パス)
    if (this.gpuDrivenPath && encoder) {
      this.device.writeBuffer(this.gpuDrivenPath.cameraBuffer, 0, cameraData);
      this.gpuDrivenPath.execute(encoder, pass, this.spriteBuffer.highWater);
      return;
    }

    this.cpuAssistedPath.execute(pass, world, this.spriteBuffer, cameraData, cullRect);
  }
}
