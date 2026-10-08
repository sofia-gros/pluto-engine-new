import { Game, Scene } from '../../src/index';
import type { SpriteHandle } from '../../src/index';

class Main extends Scene {
  private hero: SpriteHandle | null = null;
  public override preload(): void {
    this.load.addImage('hero', './assets/hero.png');
  }
  public override create(): void {
    this.hero = this.add.sprite(400, 300, 'hero');
  }
  public override update(): void {
    if (this.hero !== null) {
      this.hero.rotation += 0.02;
    }
  }
}

await Game.create({ parent: document.body, width: 800, height: 600, scenes: [Main] });
