import { describe, expect, it } from 'vitest';
import { DEFAULT_GAME_CONFIG, normalizeGameConfig } from '../../../src/scene/game-config';
import { Scene } from '../../../src/scene/scene';

class DummyScene extends Scene {}

describe('game-config', () => {
  it('デフォルト設定値が正しく定義されている', () => {
    expect(DEFAULT_GAME_CONFIG.width).toBe(800);
    expect(DEFAULT_GAME_CONFIG.height).toBe(600);
    expect(DEFAULT_GAME_CONFIG.backgroundColor).toBe(0x000000);
    expect(DEFAULT_GAME_CONFIG.pixelArt).toBe(false);
    expect(DEFAULT_GAME_CONFIG.backend).toBe('auto');
    expect(DEFAULT_GAME_CONFIG.maxSprites).toBe(1_048_576);
    expect(DEFAULT_GAME_CONFIG.maxEntities).toBe(1_048_576);
    expect(DEFAULT_GAME_CONFIG.maxWorkers).toBe(7);
    expect(DEFAULT_GAME_CONFIG.fixedStepHz).toBe(60);
    expect(DEFAULT_GAME_CONFIG.maxSubSteps).toBe(4);
  });

  it('normalizeGameConfig で設定を正規化し不足項目をデフォルト値で補完する', () => {
    const normalized = normalizeGameConfig({
      scenes: [DummyScene],
      width: 1280,
      height: 720,
    });

    expect(normalized.width).toBe(1280);
    expect(normalized.height).toBe(720);
    expect(normalized.backgroundColor).toBe(0x000000);
    expect(normalized.backend).toBe('auto');
    expect(normalized.scenes).toEqual([DummyScene]);
    expect(normalized.resolution).toBeGreaterThan(0);
  });

  it('不正な設定値に対してエラーを投げる', () => {
    expect(() =>
      normalizeGameConfig({
        scenes: [],
        width: 800,
        height: 600,
      }),
    ).toThrow();

    expect(() =>
      normalizeGameConfig({
        scenes: [DummyScene],
        width: 0,
        height: 600,
      }),
    ).toThrow();
  });

  it('上限・範囲外の数値は InvalidArgument になる', () => {
    const base = { scenes: [DummyScene] as const, width: 800, height: 600 };
    expect(() => normalizeGameConfig({ ...base, maxSprites: 4_194_305 })).toThrow();
    expect(() => normalizeGameConfig({ ...base, maxEntities: 4_194_304 })).toThrow();
    expect(() => normalizeGameConfig({ ...base, resolution: 0 })).toThrow();
    expect(() => normalizeGameConfig({ ...base, backgroundColor: 0x1000000 })).toThrow();
    expect(() => normalizeGameConfig({ ...base, maxWorkers: -1 })).toThrow();
    expect(() => normalizeGameConfig({ ...base, fixedStepHz: 0 })).toThrow();
    expect(() => normalizeGameConfig({ ...base, maxSubSteps: -1 })).toThrow();
    expect(() => normalizeGameConfig({ ...base, width: Number.NaN })).toThrow();
  });

  it('defaultResolution 引数が resolution の既定値になる', () => {
    const normalized = normalizeGameConfig({ scenes: [DummyScene], width: 800, height: 600 }, 2);
    expect(normalized.resolution).toBe(2);
    const explicit = normalizeGameConfig({
      scenes: [DummyScene],
      width: 800,
      height: 600,
      resolution: 3,
    });
    expect(explicit.resolution).toBe(3);
  });
});
