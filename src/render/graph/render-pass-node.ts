/**
 * @file レンダーグラフのパスノード型定義 (docs/07-renderer.md §12, docs/02-directory-structure.md §17)。
 */

import type { RhiCommandEncoder, RhiDevice, RhiTexture } from '../../rhi';
import type { CameraStore } from '../camera/camera-store';
import type { CameraUniforms } from '../camera/camera-uniforms';
import type { TransientPool } from './transient-pool';

/**
 * レンダーパス実行時コンテキスト。
 */
export interface RenderPassContext {
  /** RHI デバイス */
  readonly device: RhiDevice;
  /** カメラ SoA ストア */
  readonly cameraStore: CameraStore;
  /** カメラ uniform 管理 */
  readonly cameraUniforms: CameraUniforms;
  /** 一時テクスチャプール */
  readonly transientPool: TransientPool;
  /** 現在描画中のカメラ ID */
  readonly currentCameraId: number;
  /** 現在の出力先テクスチャ (スワップチェーンまたは中間ターゲット) */
  readonly targetTexture: RhiTexture;
  /** 名前付きリソースの取得 */
  getResource(name: string): RhiTexture | undefined;
  /** 名前付きリソースの登録 */
  setResource(name: string, texture: RhiTexture): void;
}

/**
 * レンダーグラフのパスノードインターフェース。
 */
export interface RenderPassNode {
  /** パス名 (例: 'sprite:draw', 'camera:fx') */
  readonly name: string;
  /** 読み取り依存リソース名一覧 (省略可) */
  readonly reads?: readonly string[];
  /** 書き込み依存リソース名一覧 (省略可) */
  readonly writes?: readonly string[];
  /** パス実行処理 */
  execute(encoder: RhiCommandEncoder, ctx: RenderPassContext): void;
}
