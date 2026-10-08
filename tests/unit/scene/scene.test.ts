import { describe, expect, it } from 'vitest';
import { Scene } from '../../../src/scene/scene';

class TestLifecycleScene extends Scene {
  public trace: string[] = [];

  public override init(data?: unknown): void {
    this.trace.push(`init:${String(data)}`);
  }

  public override preload(): void {
    this.trace.push('preload');
  }

  public override create(): void {
    this.trace.push('create');
  }

  public override update(time: number, deltaMs: number): void {
    this.trace.push(`update:${String(time)}:${String(deltaMs)}`);
  }

  public override shutdown(): void {
    this.trace.push('shutdown');
  }
}

describe('Scene', () => {
  it('ライフサイクルメソッドが正しく呼び出される', () => {
    const scene = new TestLifecycleScene();
    scene.init('test-data');
    scene.preload();
    scene.create();
    scene.update(100, 16.6);
    scene.shutdown();

    expect(scene.trace).toEqual([
      'init:test-data',
      'preload',
      'create',
      'update:100:16.6',
      'shutdown',
    ]);
  });
});
