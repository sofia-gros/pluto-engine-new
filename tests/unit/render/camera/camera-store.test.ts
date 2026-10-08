/**
 * @file CameraStore の単体テスト
 */
import { describe, expect, it } from 'vitest';
import { CameraStore } from '../../../../src/render/camera/camera-store';
import { MAX_CAMERAS } from '../../../../src/render/render-constants';

describe('CameraStore', () => {
  it('初期状態ではカメラは 0 台アクティブ', () => {
    const store = new CameraStore();
    expect(store.activeCount).toBe(0);
    expect(store.getActiveIds()).toEqual([]);
  });

  it('カメラを割り当て・解放できる', () => {
    const store = new CameraStore();
    const id0 = store.allocate(800, 600);
    expect(id0).toBe(0);
    expect(store.isActive(0)).toBe(true);
    expect(store.activeCount).toBe(1);

    const id1 = store.allocate(1920, 1080);
    expect(id1).toBe(1);
    expect(store.activeCount).toBe(2);
    expect(store.getActiveIds()).toEqual([0, 1]);

    store.free(id0);
    expect(store.isActive(0)).toBe(false);
    expect(store.activeCount).toBe(1);
    expect(store.getActiveIds()).toEqual([1]);

    // 次の割り当ては空いたスロット 0 を再利用
    const idNext = store.allocate();
    expect(idNext).toBe(0);
  });

  it('MAX_CAMERAS を超えて割り当てると例外を送出する', () => {
    const store = new CameraStore();
    for (let i = 0; i < MAX_CAMERAS; i++) {
      store.allocate();
    }
    expect(() => store.allocate()).toThrow(/最大カメラ数/);
  });

  it('位置、ズーム、回転、ビューポート、クリアカラーを設定・取得できる', () => {
    const store = new CameraStore();
    const id = store.allocate();

    store.setCenter(id, 100, 200);
    const center = { x: 0, y: 0 };
    store.getCenter(id, center);
    expect(center.x).toBe(100);
    expect(center.y).toBe(200);

    store.setZoom(id, 2.0, 1.5);
    const zoom = { x: 0, y: 0 };
    store.getZoom(id, zoom);
    expect(zoom.x).toBe(2.0);
    expect(zoom.y).toBe(1.5);

    store.setRotation(id, Math.PI / 4);
    expect(store.getRotation(id)).toBeCloseTo(Math.PI / 4);

    store.setViewport(id, 10, 20, 400, 300);
    const vp = { x: 0, y: 0, width: 0, height: 0 };
    store.getViewport(id, vp);
    expect(vp).toEqual({ x: 10, y: 20, width: 400, height: 300 });

    store.setClearColor(id, 0.1, 0.2, 0.3, 0.4);
    expect(store.clearColor[id * 4]).toBeCloseTo(0.1);
    expect(store.clearColor[id * 4 + 1]).toBeCloseTo(0.2);
    expect(store.clearColor[id * 4 + 2]).toBeCloseTo(0.3);
    expect(store.clearColor[id * 4 + 3]).toBeCloseTo(0.4);
  });
});
