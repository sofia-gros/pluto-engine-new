import { describe, expect, it } from 'vitest';
import { World } from '../../../src/core/ecs';
import { PlutoError } from '../../../src/core/debug';
import { AssetCache, Loader } from '../../../src/assets';
import { CameraStore, FrameTable, SpriteBuffer } from '../../../src/render';
import { Scene } from '../../../src/scene/scene';
import { SceneManager } from '../../../src/scene/scene-manager';

class SceneA extends Scene {
  public initialized = false;
  public preloaded = false;
  public created = false;
  public updated = false;
  public shutdowned = false;

  public override init(): void {
    this.initialized = true;
  }
  public override preload(): void {
    this.preloaded = true;
  }
  public override create(): void {
    this.created = true;
  }
  public override update(): void {
    this.updated = true;
  }
  public override shutdown(): void {
    this.shutdowned = true;
  }
}

class SceneB extends Scene {}

describe('SceneManager', () => {
  it('シーンの登録、開始、停止、遷移、更新ができる', async () => {
    const world = new World();
    const frameTable = new FrameTable();
    const spriteBuffer = new SpriteBuffer(1000);
    const cameraStore = new CameraStore();
    const assetCache = new AssetCache();
    const loader = new Loader(assetCache);

    const manager = new SceneManager({
      world,
      frameTable,
      spriteBuffer,
      cameraStore,
      assetCache,
      loader,
      width: 800,
      height: 600,
    });

    manager.add('A', SceneA);
    manager.add('B', SceneB);

    expect(manager.getScene('A')).toBeUndefined();

    await manager.start('A');
    const sceneA = manager.getScene('A') as SceneA | undefined;
    expect(sceneA).toBeDefined();
    expect(sceneA?.initialized).toBe(true);
    expect(sceneA?.preloaded).toBe(true);
    expect(sceneA?.created).toBe(true);

    manager.update(16.6, 16.6);
    expect(sceneA?.updated).toBe(true);

    manager.stop('A');
    expect(sceneA?.shutdowned).toBe(true);
    expect(manager.getScene('A')).toBeUndefined();
  });

  it('launch で 2 シーンを重ねて実行できる', async () => {
    const world = new World();
    const frameTable = new FrameTable();
    const spriteBuffer = new SpriteBuffer(1000);
    const cameraStore = new CameraStore();
    const assetCache = new AssetCache();
    const loader = new Loader(assetCache);

    const manager = new SceneManager({
      world,
      frameTable,
      spriteBuffer,
      cameraStore,
      assetCache,
      loader,
      width: 800,
      height: 600,
    });

    manager.add('A', SceneA);
    manager.add('B', SceneB);

    await manager.start('A');
    await manager.launch('B');
    expect(manager.getScene('A')).toBeDefined();
    expect(manager.getScene('B')).toBeDefined();

    manager.update(16.6, 16.6);
    const sceneA = manager.getScene('A') as SceneA | undefined;
    expect(sceneA?.updated).toBe(true);
  });

  it('未登録シーンの開始と二重 launch はエラーになる', async () => {
    const world = new World();
    const frameTable = new FrameTable();
    const spriteBuffer = new SpriteBuffer(1000);
    const cameraStore = new CameraStore();
    const assetCache = new AssetCache();
    const loader = new Loader(assetCache);

    const manager = new SceneManager({
      world,
      frameTable,
      spriteBuffer,
      cameraStore,
      assetCache,
      loader,
      width: 800,
      height: 600,
    });

    manager.add('A', SceneA);
    await expect(manager.start('Missing')).rejects.toThrow(PlutoError);
    await expect(manager.launch('Missing')).rejects.toThrow(PlutoError);
    await manager.start('A');
    await expect(manager.launch('A')).rejects.toThrow(PlutoError);
  });
});
