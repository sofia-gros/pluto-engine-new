import { describe, expect, it } from 'vitest';
import { AssetType } from '../../../../src/assets/asset-types';
import { parseAtlasJson } from '../../../../src/assets/loaders/atlas-loader';
import { ErrorCode, PlutoError } from '../../../../src/core/debug';

describe('atlas-loader', () => {
  it('TexturePacker Hash 形式の JSON を正しくパースできる', () => {
    const rawJson = {
      frames: {
        'player_idle.png': {
          frame: { x: 10, y: 20, w: 32, h: 48 },
          rotated: false,
          trimmed: true,
          spriteSourceSize: { x: 2, y: 4, w: 32, h: 48 },
          sourceSize: { w: 36, h: 56 },
          pivot: { x: 0.5, y: 1.0 },
        },
        'player_run.png': {
          frame: { x: 50, y: 20, w: 32, h: 48 },
        },
      },
      meta: {
        image: 'characters.png',
        size: { w: 256, h: 256 },
        scale: '1',
      },
    };

    const asset = parseAtlasJson('characters', rawJson);
    expect(asset.key).toBe('characters');
    expect(asset.type).toBe(AssetType.Atlas);
    expect(asset.imageKey).toBe('characters.png');
    expect(asset.size).toEqual({ w: 256, h: 256 });
    expect(asset.frames.size).toBe(2);

    const frame1 = asset.frames.get('player_idle.png');
    expect(frame1).toBeDefined();
    expect(frame1?.frame).toEqual({ x: 10, y: 20, w: 32, h: 48 });
    expect(frame1?.rotated).toBe(false);
    expect(frame1?.trimmed).toBe(true);
    expect(frame1?.spriteSourceSize).toEqual({ x: 2, y: 4, w: 32, h: 48 });
    expect(frame1?.sourceSize).toEqual({ w: 36, h: 56 });
    expect(frame1?.pivot).toEqual({ x: 0.5, y: 1.0 });
    expect(frame1?.anchor).toEqual({ x: 0.5, y: 1.0 });

    const frame2 = asset.frames.get('player_run.png');
    expect(frame2).toBeDefined();
    expect(frame2?.frame).toEqual({ x: 50, y: 20, w: 32, h: 48 });
    expect(frame2?.rotated).toBe(false);
    expect(frame2?.trimmed).toBe(false);
    expect(frame2?.spriteSourceSize).toEqual({ x: 0, y: 0, w: 32, h: 48 });
    expect(frame2?.sourceSize).toEqual({ w: 32, h: 48 });
  });

  it('TexturePacker Array 形式の JSON を正しくパースできる', () => {
    const rawJson = {
      frames: [
        {
          filename: 'item_coin.png',
          frame: { x: 0, y: 0, w: 16, h: 16 },
          rotated: false,
          trimmed: false,
          spriteSourceSize: { x: 0, y: 0, w: 16, h: 16 },
          sourceSize: { w: 16, h: 16 },
          anchor: { x: 0.5, y: 0.5 },
        },
      ],
      meta: {
        image: 'items.png',
        size: { w: 128, h: 128 },
      },
    };

    const asset = parseAtlasJson('items', JSON.stringify(rawJson), 'custom_image_key');
    expect(asset.key).toBe('items');
    expect(asset.imageKey).toBe('custom_image_key');
    expect(asset.frames.size).toBe(1);

    const frame = asset.frames.get('item_coin.png');
    expect(frame).toBeDefined();
    expect(frame?.frame).toEqual({ x: 0, y: 0, w: 16, h: 16 });
    expect(frame?.anchor).toEqual({ x: 0.5, y: 0.5 });
  });

  it('不正な JSON や構造では PlutoError を投げる', () => {
    expect(() => parseAtlasJson('invalid', 'invalid json')).toThrow(PlutoError);
    expect(() => parseAtlasJson('invalid', 'null')).toThrow(PlutoError);
    expect(() => parseAtlasJson('invalid', '{"frames": 123}')).toThrow(PlutoError);
    expect(() => parseAtlasJson('invalid', '{"frames": [{}]}')).toThrow(PlutoError);

    try {
      parseAtlasJson('invalid', 'invalid json');
    } catch (e: unknown) {
      expect((e as PlutoError).code).toBe(ErrorCode.InvalidArgument);
    }
  });
});
