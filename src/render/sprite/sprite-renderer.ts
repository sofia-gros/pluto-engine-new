/**
 * @file スプライトレンダラ統括クラス (docs/07-renderer.md §8, §9, docs/02-directory-structure.md §17)
 *
 * デバイス能力 (caps.compute) に応じて最適な描画パス (GPU 駆動 or CPU 補助) を選択し、
 * スプライト描画全体の同期と実行を統括する。
 */

import type { World } from '../../core/ecs';
import type { RhiDevice, RhiRenderPass } from '../../rhi';
import type { FrameTable } from '../texture/frame-table';
import type { SpriteBuffer } from './sprite-buffer';
import { SpritePathCpuAssisted, type SpritePathTextures } from './sprite-path-cpu-assisted';

/**
 * スプライトレンダラ初期化オプション。
 */
export interface SpriteRendererOptions {
  /** 最大スプライト数 (省略時は spriteBuffer.maxSprites) */
  readonly maxSprites?: number;
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

  private readonly cpuAssistedPath: SpritePathCpuAssisted;

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

    // v1 では CPU 補助パスを初期化 (GPU 駆動パスは T-4.6 で追加)
    this.cpuAssistedPath = new SpritePathCpuAssisted(
      device,
      maxSprites,
      spriteBuffer,
      frameTable,
      textures,
    );
  }

  /**
   * スプライト描画を実行する。
   *
   * @param pass レンダーパス
   * @param cameraData カメラ uniform データ (64 バイト Float32Array)
   * @param cullRect カメラカリング用矩形 [minX, minY, maxX, maxY]
   * @param world ECS ワールド
   */
  public render(
    pass: RhiRenderPass,
    cameraData: Float32Array,
    cullRect: readonly [number, number, number, number],
    world: World,
  ): void {
    // 1. スプライトバッファとフレームテーブルの dirty 範囲を GPU に同期
    this.spriteBuffer.flushToGpu(this.device);
    this.frameTable.flush(this.device);

    // 2. パスの実行
    this.cpuAssistedPath.execute(pass, world, this.spriteBuffer, cameraData, cullRect);
  }
}
