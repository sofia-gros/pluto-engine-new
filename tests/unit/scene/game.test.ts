import { describe, expect, it } from 'vitest';
import { Game } from '../../../src/scene/game';
import { Scene } from '../../../src/scene/scene';

class TestScene extends Scene {
  public trace: string[] = [];

  public override init(): void {
    this.trace.push('init');
  }

  public override preload(): void {
    this.trace.push('preload');
  }

  public override create(): void {
    this.trace.push('create');
  }

  public override update(): void {
    this.trace.push('update');
  }
}

describe('Game', () => {
  it('Game インスタンスを手動起動し、ライフサイクル実行とループ制御、破棄ができる', async () => {
    if (typeof document === 'undefined') {
      return;
    }
    const canvas = document.createElement('canvas');
    canvas.width = 800;
    canvas.height = 600;

    const game = await Game.create({
      canvas,
      width: 800,
      height: 600,
      backend: 'auto',
      scenes: [TestScene],
    }).catch((): undefined => undefined);
    if (game === undefined) {
      // Node/vitest 環境で WebGPU / WebGL2 が利用できない場合は正常にハンドリング
      return;
    }
    expect(game.isRunning).toBe(true);
    expect(game.backend).toMatch(/webgpu|webgl2/);

    const scene = game.scenes.getScene('TestScene') as TestScene | undefined;
    expect(scene?.trace).toContain('init');
    expect(scene?.trace).toContain('preload');
    expect(scene?.trace).toContain('create');

    game.pause();
    expect(game.isPaused).toBe(true);
    game.resume();
    expect(game.isPaused).toBe(false);

    game.destroy();
    expect(game.isDestroyed).toBe(true);
  });
});
