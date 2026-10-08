/**
 * @file 一括スプライトベンチマーク (docs/12-roadmap.md T-5.1)。
 * `add.sprites` で生成した 100 万静止スプライトの描画性能を計測し、
 * `static-sprites` ベースラインと比較する。
 */

import { Game } from '../../src/scene/game';
import { Scene } from '../../src/scene/scene';
import type { BenchContext, BenchScene } from '../bench-types';

let game: Game | null = null;
let benchContext: BenchContext | null = null;

/** 一括スプライトベンチマークシーン (既定 1,000,000 スプライト)。 */
export const scene: BenchScene = {
  name: 'batch-sprites',
  defaultCount: 1_000_000,
  async setup(ctx: BenchContext, count: number): Promise<void> {
    const actualCount = ctx.backend === 'webgl2' && count === 1_000_000 ? 100_000 : count;
    benchContext = ctx;

    class Batch extends Scene {
      public override create(): void {
        const cols = Math.ceil(Math.sqrt((actualCount * 1920) / 1080));
        this.add.sprites({
          count: actualCount,
          x: (i) => (i % cols) * (1920 / cols),
          y: (i) => Math.floor(i / cols) * (1080 / Math.ceil(actualCount / cols)),
        });
      }
    }

    try {
      game = await Game.create({
        canvas: ctx.canvas,
        width: 1920,
        height: 1080,
        backend: ctx.backend,
        maxSprites: actualCount,
        maxEntities: actualCount,
        scenes: [Batch],
      });
    } catch {
      ctx.metrics['gpuUnavailable'] = 1;
      game = null;
      return;
    }
    game.pause();
  },

  step(): void {
    if (game !== null && benchContext !== null) {
      game.step(benchContext.now());
    }
  },
};
