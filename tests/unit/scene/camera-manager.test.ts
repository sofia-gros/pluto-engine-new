import { beforeEach, describe, expect, it } from 'vitest';
import { PlutoError } from '../../../src/core/debug';
import { CameraStore } from '../../../src/render';
import { CameraManager } from '../../../src/scene/camera-manager';

describe('CameraManager and Camera', () => {
  let cameraStore: CameraStore;
  let manager: CameraManager;

  beforeEach(() => {
    cameraStore = new CameraStore();
    manager = new CameraManager(cameraStore);
  });

  it('main カメラが自動的に初期化され、ズーム・回転・中心設定・座標変換ができる', () => {
    const mainCam = manager.main;
    expect(mainCam).toBeDefined();
    expect(mainCam.id).toBe(0);

    mainCam.centerOn(100, 200);
    expect(mainCam.x).toBe(100);
    expect(mainCam.y).toBe(200);

    mainCam.setZoom(2.0);
    expect(mainCam.zoomX).toBe(2.0);
    expect(mainCam.zoomY).toBe(2.0);

    mainCam.setRotation(Math.PI / 4);
    expect(mainCam.rotation).toBeCloseTo(Math.PI / 4);

    const worldPt = mainCam.screenToWorld(400, 300);
    expect(worldPt.x).toBeCloseTo(100);
    expect(worldPt.y).toBeCloseTo(200);
  });

  it('add と remove で追加カメラを管理できる', () => {
    const cam2 = manager.add(0, 0, 400, 300);
    expect(cam2.id).toBeGreaterThan(0);
    expect(manager.count).toBe(2);

    manager.remove(cam2);
    expect(manager.count).toBe(1);
    expect(cam2.isDestroyed).toBe(true);
  });

  it('追従 (startFollow / stopFollow / update) が動作する', () => {
    const mainCam = manager.main;
    const target = { x: 500, y: 600 };

    mainCam.startFollow(target, 1.0); // 即時追従
    mainCam.update();
    expect(mainCam.x).toBe(500);
    expect(mainCam.y).toBe(600);

    mainCam.stopFollow();
    target.x = 800;
    mainCam.update();
    expect(mainCam.x).toBe(500);
  });

  it('境界制限 (setBounds) が機能する', () => {
    const mainCam = manager.main;
    mainCam.setBounds(0, 0, 1000, 1000);
    mainCam.centerOn(-500, -500);
    expect(mainCam.x).toBeGreaterThanOrEqual(0);
    expect(mainCam.y).toBeGreaterThanOrEqual(0);
  });

  it('カメラ数が上限を超えると CapacityExceeded になる', () => {
    for (let i = 1; i < 8; i++) {
      manager.add(0, 0, 100, 100);
    }
    expect(manager.count).toBe(8);
    expect(() => manager.add(0, 0, 100, 100)).toThrow(PlutoError);
  });

  it('不正なズーム・境界は InvalidArgument になる', () => {
    const mainCam = manager.main;
    expect(() => mainCam.setZoom(0)).toThrow(PlutoError);
    expect(() => mainCam.setZoom(-1)).toThrow(PlutoError);
    expect(() => mainCam.setBounds(0, 0, -10, 100)).toThrow(PlutoError);
  });
});
