import { Game, Scene } from '../../src/index';

class Main extends Scene {
  public override create(): void {
    const cols = Math.ceil(Math.sqrt((1_000_000 * 1920) / 1080));
    const rows = Math.ceil(1_000_000 / cols);
    this.add.sprites({
      count: 1_000_000,
      x: (i) => (i % cols) * (1920 / cols),
      y: (i) => Math.floor(i / cols) * (1080 / rows),
    });
  }
}

await Game.create({ parent: document.body, width: 1920, height: 1080, scenes: [Main] });
