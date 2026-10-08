/**
 * @file シーン内カメラ管理 (docs/09-api-design.md §4.8, docs/02-directory-structure.md §22)
 *
 * 高レベルカメラコントローラ (Camera) と、main カメラおよび追加カメラの
 * 生成・解放・更新を統括するマネージャ (CameraManager) を提供する。
 */

import { ErrorCode, PlutoError } from '../core/debug';
import { MAX_CAMERAS, type CameraStore, type CameraVec2, type CameraViewport } from '../render';

/** 追従対象インターフェース */
export interface FollowTarget {
  /** ワールド X 座標 */
  x: number;
  /** ワールド Y 座標 */
  y: number;
}

/** カメラ境界矩形 */
export interface CameraBounds {
  /** 左端 X */
  x: number;
  /** 上端 Y */
  y: number;
  /** 幅 */
  width: number;
  /** 高さ */
  height: number;
}

/**
 * 高レベルカメラコントローラクラス。
 */
export class Camera {
  /** 内部カメラ ID */
  public readonly id: number;
  /** 所属 CameraStore */
  public readonly store: CameraStore;

  private _isDestroyed = false;
  private followTarget: FollowTarget | null = null;
  private followLerp = 1.0;
  private bounds: CameraBounds | null = null;

  private readonly tempCenter: CameraVec2 = { x: 0, y: 0 };
  private readonly tempZoom: CameraVec2 = { x: 1, y: 1 };
  private readonly tempViewport: CameraViewport = { x: 0, y: 0, width: 800, height: 600 };

  /**
   * @param store 操作対象の CameraStore
   * @param id このカメラの ID
   */
  public constructor(store: CameraStore, id: number) {
    this.store = store;
    this.id = id;
  }

  /** 破棄済みか判定する */
  public get isDestroyed(): boolean {
    return this._isDestroyed;
  }

  /** 中心ワールド X 座標 */
  public get x(): number {
    this.ensureAlive();
    this.store.getCenter(this.id, this.tempCenter);
    return this.tempCenter.x;
  }

  /** 中心ワールド Y 座標 */
  public get y(): number {
    this.ensureAlive();
    this.store.getCenter(this.id, this.tempCenter);
    return this.tempCenter.y;
  }

  /** X 方向ズーム倍率 */
  public get zoomX(): number {
    this.ensureAlive();
    this.store.getZoom(this.id, this.tempZoom);
    return this.tempZoom.x;
  }

  /** Y 方向ズーム倍率 */
  public get zoomY(): number {
    this.ensureAlive();
    this.store.getZoom(this.id, this.tempZoom);
    return this.tempZoom.y;
  }

  /** 回転角 (ラジアン) */
  public get rotation(): number {
    this.ensureAlive();
    return this.store.getRotation(this.id);
  }

  /**
   * 中心ワールド座標を設定する。
   *
   * @param x ワールド X
   * @param y ワールド Y
   * @returns this
   */
  public centerOn(x: number, y: number): this {
    this.ensureAlive();
    let clampedX = x;
    let clampedY = y;
    if (this.bounds !== null) {
      this.store.getViewport(this.id, this.tempViewport);
      this.store.getZoom(this.id, this.tempZoom);
      const halfW = (this.tempViewport.width * 0.5) / this.tempZoom.x;
      const halfH = (this.tempViewport.height * 0.5) / this.tempZoom.y;

      const minX = this.bounds.x + halfW;
      const maxX = this.bounds.x + this.bounds.width - halfW;
      const minY = this.bounds.y + halfH;
      const maxY = this.bounds.y + this.bounds.height - halfH;

      if (minX <= maxX) {
        clampedX = Math.max(minX, Math.min(maxX, clampedX));
      } else {
        clampedX = this.bounds.x + this.bounds.width * 0.5;
      }

      if (minY <= maxY) {
        clampedY = Math.max(minY, Math.min(maxY, clampedY));
      } else {
        clampedY = this.bounds.y + this.bounds.height * 0.5;
      }
    }

    this.store.setCenter(this.id, clampedX, clampedY);
    return this;
  }

  /**
   * ズーム倍率を設定する。
   *
   * @param zoomX X 方向ズーム (0 より大きいこと)
   * @param zoomY Y 方向ズーム (省略時は zoomX と同値)
   * @returns this
   */
  public setZoom(zoomX: number, zoomY = zoomX): this {
    this.ensureAlive();
    if (!(zoomX > 0) || !(zoomY > 0)) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        'ズーム倍率は 0 より大きい数値にしてください。',
      );
    }
    this.store.setZoom(this.id, zoomX, zoomY);
    return this;
  }

  /**
   * 回転角 (ラジアン) を設定する。
   *
   * @param rotation 回転角 (ラジアン)
   * @returns this
   */
  public setRotation(rotation: number): this {
    this.ensureAlive();
    this.store.setRotation(this.id, rotation);
    return this;
  }

  /**
   * ビューポート矩形を設定する。
   *
   * @param x 左上 X (ピクセル)
   * @param y 左上 Y (ピクセル)
   * @param width 幅 (ピクセル)
   * @param height 高さ (ピクセル)
   * @returns this
   */
  public setViewport(x: number, y: number, width: number, height: number): this {
    this.ensureAlive();
    this.store.setViewport(this.id, x, y, width, height);
    return this;
  }

  /**
   * 対象オブジェクトへの追従を開始する。
   *
   * @param target 追従対象 ({ x, y })
   * @param lerp 追従補間係数 (0.0〜1.0, 既定 1.0)
   * @returns this
   */
  public startFollow(target: FollowTarget, lerp = 1.0): this {
    this.ensureAlive();
    this.followTarget = target;
    this.followLerp = Math.max(0, Math.min(1, lerp));
    return this;
  }

  /**
   * 追従を停止する。
   *
   * @returns this
   */
  public stopFollow(): this {
    this.followTarget = null;
    return this;
  }

  /**
   * 移動可能な境界を設定する。
   *
   * @param x 左端 X
   * @param y 上端 Y
   * @param width 幅 (0 以上)
   * @param height 高さ (0 以上)
   * @returns this
   */
  public setBounds(x: number, y: number, width: number, height: number): this {
    this.ensureAlive();
    if (!(width >= 0) || !(height >= 0)) {
      throw new PlutoError(ErrorCode.InvalidArgument, '境界の幅・高さは 0 以上にしてください。');
    }
    this.bounds = { x, y, width, height };
    return this;
  }

  /**
   * スクリーン座標をワールド座標に逆変換する。
   *
   * @param screenX スクリーン X
   * @param screenY スクリーン Y
   * @param out 結果格納先 Vec2 (省略時は新規オブジェクト)
   * @returns ワールド座標
   */
  public screenToWorld(
    screenX: number,
    screenY: number,
    out: CameraVec2 = { x: 0, y: 0 },
  ): CameraVec2 {
    this.ensureAlive();
    this.store.getViewport(this.id, this.tempViewport);
    this.store.getCenter(this.id, this.tempCenter);
    this.store.getZoom(this.id, this.tempZoom);
    const rot = this.store.getRotation(this.id);

    // 1. ビューポート中心からのオフセット
    const vx = screenX - (this.tempViewport.x + this.tempViewport.width * 0.5);
    const vy = screenY - (this.tempViewport.y + this.tempViewport.height * 0.5);

    // 2. ズーム解除
    const zx = vx / this.tempZoom.x;
    const zy = vy / this.tempZoom.y;

    // 3. 逆回転
    const cosR = Math.cos(-rot);
    const sinR = Math.sin(-rot);
    const rx = cosR * zx - sinR * zy;
    const ry = sinR * zx + cosR * zy;

    // 4. ワールド中心加算
    out.x = this.tempCenter.x + rx;
    out.y = this.tempCenter.y + ry;
    return out;
  }

  /**
   * 毎フレームのカメラ更新処理 (追従補間等)。
   */
  public update(): void {
    if (this._isDestroyed || this.followTarget === null) {
      return;
    }
    const curX = this.x;
    const curY = this.y;
    const targetX = this.followTarget.x;
    const targetY = this.followTarget.y;

    const newX = curX + (targetX - curX) * this.followLerp;
    const newY = curY + (targetY - curY) * this.followLerp;

    this.centerOn(newX, newY);
  }

  /**
   * カメラを破棄・解放する。
   */
  public destroy(): void {
    if (this._isDestroyed) {
      return;
    }
    this._isDestroyed = true;
    this.followTarget = null;
    this.bounds = null;
    this.store.free(this.id);
  }

  private ensureAlive(): void {
    if (this._isDestroyed || !this.store.isActive(this.id)) {
      throw new PlutoError(ErrorCode.InvalidState, '破棄済みの Camera にアクセスしました。');
    }
  }
}

/**
 * シーン内カメラマネージャクラス。
 */
export class CameraManager {
  /** レンダラカメラストア */
  public readonly store: CameraStore;
  /** メインカメラ */
  public readonly main: Camera;

  private readonly cameras: Camera[] = [];

  /**
   * @param store 操作対象の CameraStore
   * @param width メインカメラのビューポート幅 (既定: 800)
   * @param height メインカメラのビューポート高さ (既定: 600)
   */
  public constructor(store: CameraStore, width = 800, height = 600) {
    this.store = store;

    // メインカメラ (ID: 0) を初期化
    if (!store.isActive(0)) {
      store.allocate(width, height);
    }
    this.main = new Camera(store, 0);
    this.cameras.push(this.main);
  }

  /** 管理中のカメラ数 */
  public get count(): number {
    return this.cameras.length;
  }

  /**
   * 新しいカメラを追加する。
   *
   * @param x ビューポート X
   * @param y ビューポート Y
   * @param width ビューポート幅
   * @param height ビューポート高さ
   * @returns 生成された Camera インスタンス
   */
  public add(x: number, y: number, width: number, height: number): Camera {
    if (this.cameras.length >= MAX_CAMERAS) {
      throw new PlutoError(
        ErrorCode.CapacityExceeded,
        'カメラ数が上限 (8) を超えました。不要なカメラを remove してください。',
      );
    }
    const id = this.store.allocate(width, height);
    this.store.setViewport(id, x, y, width, height);
    const camera = new Camera(this.store, id);
    this.cameras.push(camera);
    return camera;
  }

  /**
   * カメラを削除する (main カメラの削除は不可)。
   *
   * @param camera 削除するカメラ
   */
  public remove(camera: Camera): void {
    if (camera === this.main) {
      throw new PlutoError(ErrorCode.InvalidState, 'メインカメラを削除することはできません。');
    }
    const index = this.cameras.indexOf(camera);
    if (index !== -1) {
      this.cameras.splice(index, 1);
      camera.destroy();
    }
  }

  /**
   * 全カメラのフレーム更新処理を実行する。
   */
  public update(): void {
    for (const camera of this.cameras) {
      camera.update();
    }
  }

  /**
   * 全カメラを破棄・クリーンアップする (main 含む)。
   */
  public destroy(): void {
    for (const camera of this.cameras) {
      camera.destroy();
    }
    this.cameras.length = 0;
  }
}
