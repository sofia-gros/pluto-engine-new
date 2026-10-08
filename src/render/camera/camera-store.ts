/**
 * @file カメラの SoA ストア (docs/02-directory-structure.md §17、docs/07-renderer.md §6)。
 * 位置・ズーム・回転・ビューポート・クリアカラーを SoA 形式で保持し、最大 8 台のカメラを管理する。
 */

import { ErrorCode, PlutoError } from '../../core/debug';
import { MAX_CAMERAS } from '../render-constants';

/** ビューポート矩形情報 */
export interface CameraViewport {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** 2次元ベクトルインターフェース */
export interface CameraVec2 {
  x: number;
  y: number;
}

/**
 * カメラの SoA ストア。
 */
export class CameraStore {
  /** 各カメラの有効フラグ (1: 有効, 0: 無効) */
  public readonly active: Uint8Array;
  /** 各カメラの中心ワールド X 座標 */
  public readonly x: Float32Array;
  /** 各カメラの中心ワールド Y 座標 */
  public readonly y: Float32Array;
  /** 各カメラのズーム倍率 X */
  public readonly zoomX: Float32Array;
  /** 各カメラのズーム倍率 Y */
  public readonly zoomY: Float32Array;
  /** 各カメラの回転角 (ラジアン) */
  public readonly rotation: Float32Array;
  /** 各カメラのビューポート矩形 X (ピクセル) */
  public readonly viewportX: Float32Array;
  /** 各カメラのビューポート矩形 Y (ピクセル) */
  public readonly viewportY: Float32Array;
  /** 各カメラのビューポート矩形 幅 (ピクセル) */
  public readonly viewportWidth: Float32Array;
  /** 各カメラのビューポート矩形 高さ (ピクセル) */
  public readonly viewportHeight: Float32Array;
  /** 各カメラのクリアカラー (RGBA各要素, カメラあたり 4 float) */
  public readonly clearColor: Float32Array;
  /** 各カメラの変更フラグ (1: 変更あり, 0: なし) */
  public readonly dirty: Uint8Array;

  /** アクティブなカメラ ID のキャッシュリスト */
  private readonly _activeIds: number[] = [];

  public constructor() {
    this.active = new Uint8Array(MAX_CAMERAS);
    this.x = new Float32Array(MAX_CAMERAS);
    this.y = new Float32Array(MAX_CAMERAS);
    this.zoomX = new Float32Array(MAX_CAMERAS);
    this.zoomY = new Float32Array(MAX_CAMERAS);
    this.rotation = new Float32Array(MAX_CAMERAS);
    this.viewportX = new Float32Array(MAX_CAMERAS);
    this.viewportY = new Float32Array(MAX_CAMERAS);
    this.viewportWidth = new Float32Array(MAX_CAMERAS);
    this.viewportHeight = new Float32Array(MAX_CAMERAS);
    this.clearColor = new Float32Array(MAX_CAMERAS * 4);
    this.dirty = new Uint8Array(MAX_CAMERAS);

    // デフォルト値の初期化
    for (let i = 0; i < MAX_CAMERAS; i++) {
      this.zoomX[i] = 1.0;
      this.zoomY[i] = 1.0;
      this.viewportWidth[i] = 800.0;
      this.viewportHeight[i] = 600.0;
      const cIdx = i * 4;
      this.clearColor[cIdx] = 0.0;
      this.clearColor[cIdx + 1] = 0.0;
      this.clearColor[cIdx + 2] = 0.0;
      this.clearColor[cIdx + 3] = 1.0;
    }
  }

  /**
   * 新しいカメラを割り当てる。
   * @param viewportWidth 初期ビューポート幅 (既定 800)
   * @param viewportHeight 初期ビューポート高さ (既定 600)
   * @returns 割り当てられたカメラ ID (0..MAX_CAMERAS-1)
   */
  public allocate(viewportWidth = 800, viewportHeight = 600): number {
    for (let i = 0; i < MAX_CAMERAS; i++) {
      if (this.active[i] === 0) {
        this.active[i] = 1;
        this.x[i] = 0;
        this.y[i] = 0;
        this.zoomX[i] = 1.0;
        this.zoomY[i] = 1.0;
        this.rotation[i] = 0;
        this.viewportX[i] = 0;
        this.viewportY[i] = 0;
        this.viewportWidth[i] = viewportWidth;
        this.viewportHeight[i] = viewportHeight;
        const cIdx = i * 4;
        this.clearColor[cIdx] = 0.0;
        this.clearColor[cIdx + 1] = 0.0;
        this.clearColor[cIdx + 2] = 0.0;
        this.clearColor[cIdx + 3] = 1.0;
        this.dirty[i] = 1;
        this.updateActiveCache();
        return i;
      }
    }
    throw new PlutoError(
      ErrorCode.CapacityExceeded,
      `最大カメラ数 (${String(MAX_CAMERAS)}) を超えてカメラを作成することはできません`,
    );
  }

  /**
   * 指定したカメラを解放する。
   * @param id カメラ ID
   */
  public free(id: number): void {
    if (id < 0 || id >= MAX_CAMERAS || this.active[id] === 0) {
      return;
    }
    this.active[id] = 0;
    this.dirty[id] = 1;
    this.updateActiveCache();
  }

  /**
   * カメラが有効か判定する。
   * @param id カメラ ID
   * @returns 有効な場合 true
   */
  public isActive(id: number): boolean {
    return id >= 0 && id < MAX_CAMERAS && this.active[id] === 1;
  }

  /**
   * カメラの中心ワールド座標を設定する。
   * @param id カメラ ID
   * @param x 中心 X 座標
   * @param y 中心 Y 座標
   */
  public setCenter(id: number, x: number, y: number): void {
    this.checkId(id);
    this.x[id] = x;
    this.y[id] = y;
    this.dirty[id] = 1;
  }

  /**
   * カメラのズーム倍率を設定する。
   * @param id カメラ ID
   * @param zoomX X 方向ズーム
   * @param zoomY Y 方向ズーム (省略時は zoomX と同値)
   */
  public setZoom(id: number, zoomX: number, zoomY = zoomX): void {
    this.checkId(id);
    this.zoomX[id] = zoomX;
    this.zoomY[id] = zoomY;
    this.dirty[id] = 1;
  }

  /**
   * カメラの回転角を設定する。
   * @param id カメラ ID
   * @param rotation 回転角 (ラジアン)
   */
  public setRotation(id: number, rotation: number): void {
    this.checkId(id);
    this.rotation[id] = rotation;
    this.dirty[id] = 1;
  }

  /**
   * カメラのビューポート矩形を設定する。
   * @param id カメラ ID
   * @param x 左上 X (ピクセル)
   * @param y 左上 Y (ピクセル)
   * @param width 幅 (ピクセル)
   * @param height 高さ (ピクセル)
   */
  public setViewport(id: number, x: number, y: number, width: number, height: number): void {
    this.checkId(id);
    this.viewportX[id] = x;
    this.viewportY[id] = y;
    this.viewportWidth[id] = width;
    this.viewportHeight[id] = height;
    this.dirty[id] = 1;
  }

  /**
   * カメラの背景クリア色を設定する。
   * @param id カメラ ID
   * @param r 赤 (0..1)
   * @param g 緑 (0..1)
   * @param b 青 (0..1)
   * @param a アルファ (0..1)
   */
  public setClearColor(id: number, r: number, g: number, b: number, a = 1.0): void {
    this.checkId(id);
    const cIdx = id * 4;
    this.clearColor[cIdx] = r;
    this.clearColor[cIdx + 1] = g;
    this.clearColor[cIdx + 2] = b;
    this.clearColor[cIdx + 3] = a;
  }

  /**
   * カメラの中心ワールド座標を取得する。
   * @param id カメラ ID
   * @param out 結果を受け取る Vec2
   */
  public getCenter(id: number, out: CameraVec2): void {
    this.checkId(id);
    out.x = this.x[id] ?? 0;
    out.y = this.y[id] ?? 0;
  }

  /**
   * カメラのズーム倍率を取得する。
   * @param id カメラ ID
   * @param out 結果を受け取る Vec2
   */
  public getZoom(id: number, out: CameraVec2): void {
    this.checkId(id);
    out.x = this.zoomX[id] ?? 1;
    out.y = this.zoomY[id] ?? 1;
  }

  /**
   * カメラの回転角を取得する。
   * @param id カメラ ID
   * @returns 回転角 (ラジアン)
   */
  public getRotation(id: number): number {
    this.checkId(id);
    return this.rotation[id] ?? 0;
  }

  /**
   * カメラのビューポート矩形を取得する。
   * @param id カメラ ID
   * @param out 結果を受け取る矩形オブジェクト
   */
  public getViewport(id: number, out: CameraViewport): void {
    this.checkId(id);
    out.x = this.viewportX[id] ?? 0;
    out.y = this.viewportY[id] ?? 0;
    out.width = this.viewportWidth[id] ?? 0;
    out.height = this.viewportHeight[id] ?? 0;
  }

  /**
   * 有効なカメラの ID 配列を取得する。
   * @returns 有効カメラ ID の配列
   */
  public getActiveIds(): readonly number[] {
    return this._activeIds;
  }

  /**
   * 有効なカメラ数を取得する。
   * @returns 有効カメラ数
   */
  public get activeCount(): number {
    return this._activeIds.length;
  }

  private checkId(id: number): void {
    if (id < 0 || id >= MAX_CAMERAS || this.active[id] === 0) {
      throw new PlutoError(ErrorCode.InvalidArgument, `無効なカメラ ID です: ${String(id)}`);
    }
  }

  private updateActiveCache(): void {
    this._activeIds.length = 0;
    for (let i = 0; i < MAX_CAMERAS; i++) {
      if (this.active[i] === 1) {
        this._activeIds.push(i);
      }
    }
  }
}
