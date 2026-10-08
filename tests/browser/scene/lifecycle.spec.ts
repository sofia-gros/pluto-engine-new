/**
 * @file Game / Scene ライフサイクルのブラウザテスト (docs/12-roadmap.md T-5.1)。
 *
 * Game.create による初期化、シーンのライフサイクル順序、Loader の進捗・完了・
 * エラーイベント、destroy による解放を検証する。
 */
import { expect, test } from '../helpers/harness-test';

test.describe('Game / Scene ライフサイクル (T-5.1)', () => {
  test('Game.create から destroy までのライフサイクル', async ({ page, plutoBackend }) => {
    await page.goto(`/tests/browser/fixtures/harness.html?backend=${plutoBackend}&build=src`);

    const result = await page.evaluate(async (backend) => {
      const { Game } = await import('../../../src/scene/game');
      const { Scene } = await import('../../../src/scene/scene');

      const trace: string[] = [];
      class Main extends Scene {
        public override init(): void {
          trace.push('init');
        }
        public override preload(): void {
          trace.push('preload');
        }
        public override create(): void {
          trace.push('create');
          this.add.image(10, 20);
          this.cameras.main.centerOn(128, 128);
        }
        public override update(): void {
          trace.push('update');
        }
      }

      const canvas = document.getElementById('pluto-canvas') as HTMLCanvasElement;
      const game = await Game.create({ canvas, width: 256, height: 256, backend, scenes: [Main] });

      await new Promise((resolve) => setTimeout(resolve, 500));

      const snapshot = {
        backend: game.backend,
        sceneFound: game.scenes.getScene('Main') !== undefined,
        head: trace.slice(0, 3),
        updateCount: trace.filter((t) => t === 'update').length,
      };
      game.destroy();
      return { ...snapshot, destroyed: game.isDestroyed };
    }, plutoBackend);

    expect(result.backend).toBe(plutoBackend);
    expect(result.sceneFound).toBe(true);
    expect(result.head).toEqual(['init', 'preload', 'create']);
    expect(result.updateCount).toBeGreaterThan(0);
    expect(result.destroyed).toBe(true);
  });

  test('Loader の progress / complete / error', async ({ page, plutoBackend }) => {
    await page.goto(`/tests/browser/fixtures/harness.html?backend=${plutoBackend}&build=src`);

    const result = await page.evaluate(async () => {
      const { Loader } = await import('../../../src/assets');

      // 1x1 PNG (data URL)
      const pixel =
        'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const loader = new Loader();
      loader.addImage('dot', `data:image/png;base64,${pixel}`);
      const progresses: number[] = [];
      let completes = 0;
      loader.on('progress', (e) => {
        progresses.push(e.progress);
      });
      loader.on('complete', () => {
        completes += 1;
      });
      await loader.load();

      const bad = new Loader();
      bad.addImage('bad', 'http://127.0.0.1:9/no-such-image.png');
      let errorEvents = 0;
      let isRejected = false;
      bad.on('error', () => {
        errorEvents += 1;
      });
      try {
        await bad.load();
      } catch {
        isRejected = true;
      }

      return { progresses, completes, errorEvents, isRejected };
    });

    expect(result.progresses.length).toBeGreaterThan(0);
    expect(result.progresses[result.progresses.length - 1]).toBe(1);
    for (let i = 1; i < result.progresses.length; i++) {
      expect(result.progresses[i]).toBeGreaterThanOrEqual(result.progresses[i - 1] ?? 0);
    }
    expect(result.completes).toBe(1);
    expect(result.errorEvents).toBe(1);
    expect(result.isRejected).toBe(true);
  });
});
