// @pluto-hot
/**
 * @file カメラ uniform 計算および GPU バッファ管理 (docs/07-renderer.md §6, docs/02-directory-structure.md §17)。
 * ワールド→クリップ行列、カリング用 AABB、画面解像度を算出し、GPU uniform バッファに反映する。
 */

import {
  BindingType,
  BufferUsage,
  ShaderStage,
  type RhiBindGroup,
  type RhiBindGroupLayout,
  type RhiBuffer,
  type RhiDevice,
} from '../../rhi';
import { MAX_CAMERAS } from '../render-constants';
import type { CameraStore } from './camera-store';

/** カメラ uniform の有効データバイト数 (64 バイト, std140) */
export const CAMERA_UNIFORM_DATA_BYTES = 64;

/** カメラ 1 台あたりの uniform バッファストライド (256 バイト整列) */
export const CAMERA_UNIFORM_STRIDE_BYTES = 256;

/** カメラ 1 台あたりの uniform float ストライド (64 float = 256 バイト) */
export const CAMERA_UNIFORM_STRIDE_FLOATS = 64;

/**
 * カメラ uniform 管理クラス。
 */
export class CameraUniforms {
  /** GPU uniform バッファ (MAX_CAMERAS * 256 バイト) */
  public readonly buffer: RhiBuffer;
  /** ステージング float 配列 (全カメラ分) */
  public readonly staging: Float32Array;
  /** バインドグループレイアウト */
  public readonly bindGroupLayout: RhiBindGroupLayout;
  /** カメラごとのバインドグループ配列 */
  public readonly bindGroups: RhiBindGroup[];

  private readonly device: RhiDevice;
  private readonly dirtyFlags: Uint8Array;

  public constructor(device: RhiDevice) {
    this.device = device;
    const totalBytes = MAX_CAMERAS * CAMERA_UNIFORM_STRIDE_BYTES;
    this.buffer = device.createBuffer({
      sizeBytes: totalBytes,
      usage: BufferUsage.Uniform | BufferUsage.CopyDst,
      label: 'CameraUniformBuffer',
    });
    this.staging = new Float32Array(MAX_CAMERAS * CAMERA_UNIFORM_STRIDE_FLOATS);
    this.dirtyFlags = new Uint8Array(MAX_CAMERAS);

    this.bindGroupLayout = device.createBindGroupLayout({
      entries: [
        {
          stage: ShaderStage.Vertex | ShaderStage.Fragment | ShaderStage.Compute,
          type: BindingType.UniformBuffer,
        },
      ],
    });

    this.bindGroups = new Array<RhiBindGroup>(MAX_CAMERAS);
    for (let i = 0; i < MAX_CAMERAS; i++) {
      this.bindGroups[i] = device.createBindGroup({
        layout: this.bindGroupLayout,
        entries: [
          {
            type: BindingType.UniformBuffer,
            buffer: this.buffer,
            offsetBytes: i * CAMERA_UNIFORM_STRIDE_BYTES,
            sizeBytes: CAMERA_UNIFORM_DATA_BYTES,
          },
        ],
      });
    }
  }

  /**
   * 指定カメラの uniform データを計算しステージングに格納する。
   * @param store カメラストア
   * @param cameraId カメラ ID
   */
  public update(store: CameraStore, cameraId: number): void {
    if (cameraId < 0 || cameraId >= MAX_CAMERAS || store.active[cameraId] === 0) {
      return;
    }

    const cx = store.x[cameraId] ?? 0;
    const cy = store.y[cameraId] ?? 0;
    const zx = store.zoomX[cameraId] ?? 1;
    const zy = store.zoomY[cameraId] ?? 1;
    const rot = store.rotation[cameraId] ?? 0;
    const w = store.viewportWidth[cameraId] ?? 800;
    const h = store.viewportHeight[cameraId] ?? 600;

    const offset = cameraId * CAMERA_UNIFORM_STRIDE_FLOATS;
    const cosR = Math.cos(rot);
    const sinR = Math.sin(rot);

    // 1. viewProjAffine (m00, m10, m01, m11)
    const scaleX = (2.0 * zx) / w;
    const scaleY = (2.0 * zy) / h;

    const m00 = scaleX * cosR;
    const m01 = scaleX * sinR;
    const m10 = scaleY * sinR;
    const m11 = -scaleY * cosR;

    // viewProjTranslation (tx, ty, 0, 0)
    const tx = -scaleX * (cosR * cx + sinR * cy);
    const ty = scaleY * (-sinR * cx + cosR * cy);

    this.staging[offset] = m00;
    this.staging[offset + 1] = m10;
    this.staging[offset + 2] = m01;
    this.staging[offset + 3] = m11;
    this.staging[offset + 4] = tx;
    this.staging[offset + 5] = ty;
    this.staging[offset + 6] = 0.0;
    this.staging[offset + 7] = 0.0;

    // 2. cullRect (minX, minY, maxX, maxY)
    // 画面 4 隅のワールド座標を逆変換して外接 AABB を算出
    const halfW = w * 0.5;
    const halfH = h * 0.5;
    const invZx = 1.0 / zx;
    const invZy = 1.0 / zy;

    // 4 隅の正規化スクリーン空間オフセット (±halfW, ±halfH)
    // 隅 0: (-halfW, -halfH)
    // 隅 1: ( halfW, -halfH)
    // 隅 2: ( halfW,  halfH)
    // 隅 3: (-halfW,  halfH)
    let minX = Infinity;
    let minY = Infinity;
    let maxX = -Infinity;
    let maxY = -Infinity;

    for (let c = 0; c < 4; c++) {
      const sx = (c === 1 || c === 2 ? halfW : -halfW) * invZx;
      const sy = (c === 2 || c === 3 ? halfH : -halfH) * invZy;
      // 回転 (+rot)
      const wx = cx + (cosR * sx - sinR * sy);
      const wy = cy + (sinR * sx + cosR * sy);

      if (wx < minX) minX = wx;
      if (wy < minY) minY = wy;
      if (wx > maxX) maxX = wx;
      if (wy > maxY) maxY = wy;
    }

    this.staging[offset + 8] = minX;
    this.staging[offset + 9] = minY;
    this.staging[offset + 10] = maxX;
    this.staging[offset + 11] = maxY;

    // 3. screenResolution (screenW, screenH, 1/screenW, 1/screenH)
    this.staging[offset + 12] = w;
    this.staging[offset + 13] = h;
    this.staging[offset + 14] = 1.0 / w;
    this.staging[offset + 15] = 1.0 / h;

    this.dirtyFlags[cameraId] = 1;
  }

  /**
   * 変更があったカメラの uniform データを GPU に転送する。
   */
  public upload(): void {
    for (let i = 0; i < MAX_CAMERAS; i++) {
      if (this.dirtyFlags[i] === 1) {
        const byteOffset = i * CAMERA_UNIFORM_STRIDE_BYTES;
        const floatOffset = i * CAMERA_UNIFORM_STRIDE_FLOATS;
        const slice = this.staging.subarray(
          floatOffset,
          floatOffset + CAMERA_UNIFORM_STRIDE_FLOATS,
        );
        this.device.writeBuffer(this.buffer, byteOffset, slice);
        this.dirtyFlags[i] = 0;
      }
    }
  }

  /**
   * カメラのバインドグループを取得する。
   * @param cameraId カメラ ID
   * @returns 対応する RhiBindGroup
   */
  public getBindGroup(cameraId: number): RhiBindGroup {
    return this.bindGroups[cameraId];
  }

  /**
   * リソースを解放する。
   */
  public destroy(): void {
    this.buffer.destroy();
    for (let i = 0; i < MAX_CAMERAS; i++) {
      this.bindGroups[i]?.destroy();
    }
  }
}
