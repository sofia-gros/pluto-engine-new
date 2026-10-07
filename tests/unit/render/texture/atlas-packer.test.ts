import { describe, expect, it } from 'vitest';
import { AtlasPacker } from '../../../../src/render/texture/atlas-packer';
import { ErrorCode, PlutoError } from '../../../../src/core/debug';

describe('AtlasPacker', () => {
  it('画像を shelf 法でパッキングし、2px パディングを適用する', () => {
    // 64x64 の小さなページサイズでテスト
    const packer = new AtlasPacker({
      pageSize: 64,
      maxPages: 4,
      padding: 2,
    });

    // 1 つ目の画像 (16x16)
    // パディング込みで 20x20 を消費
    const loc1 = packer.addImage('img1', 16, 16);
    expect(loc1.page).toBe(0);
    expect(loc1.x).toBe(2); // padding 分オフセット
    expect(loc1.y).toBe(2);
    expect(loc1.width).toBe(16);
    expect(loc1.height).toBe(16);

    // 2 つ目の画像 (16x16)
    // 横に並ぶ (x = 20 + 2 = 22)
    const loc2 = packer.addImage('img2', 16, 16);
    expect(loc2.page).toBe(0);
    expect(loc2.x).toBe(22);
    expect(loc2.y).toBe(2);

    // 3 つ目の画像 (16x16)
    // 横に並ぶ (x = 40 + 2 = 42)
    const loc3 = packer.addImage('img3', 16, 16);
    expect(loc3.page).toBe(0);
    expect(loc3.x).toBe(42);
    expect(loc3.y).toBe(2);

    // 4 つ目の画像 (16x16): 64 幅を超えるため次の棚 (y = 20 + 2 = 22) へ
    const loc4 = packer.addImage('img4', 16, 16);
    expect(loc4.page).toBe(0);
    expect(loc4.x).toBe(2);
    expect(loc4.y).toBe(22);
  });

  it('高さ降順の一括 pack で充填できる', () => {
    const packer = new AtlasPacker({
      pageSize: 128,
      maxPages: 2,
    });

    const results = packer.pack([
      { id: 'small', width: 10, height: 10 },
      { id: 'large', width: 40, height: 40 },
      { id: 'medium', width: 20, height: 20 },
    ]);

    expect(results.length).toBe(3);
    // ソートされて large が最初に配置されていること
    const large = results.find((r) => r.id === 'large');
    expect(large).toBeDefined();
    expect(large?.page).toBe(0);
    expect(large?.x).toBe(2);
    expect(large?.y).toBe(2);
  });

  it('ページサイズを超える画像は PlutoError(InvalidArgument) を投げる', () => {
    const packer = new AtlasPacker({ pageSize: 64 });
    expect(() => packer.addImage('oversized', 64, 64)).toThrow(PlutoError);

    try {
      packer.addImage('oversized', 64, 64);
    } catch (e: unknown) {
      expect((e as PlutoError).code).toBe(ErrorCode.InvalidArgument);
    }
  });

  it('最大ページ数を超過した場合は PlutoError(CapacityExceeded) を投げる', () => {
    const packer = new AtlasPacker({ pageSize: 32, maxPages: 1, padding: 2 });
    // 1枚目 (24x24 + padding 4 = 28x28) は収まる
    packer.addImage('img1', 24, 24);

    // 2枚目は 1 ページ目に収まらず、maxPages = 1 のため容量オーバー
    expect(() => packer.addImage('img2', 24, 24)).toThrow(PlutoError);

    try {
      packer.addImage('img2', 24, 24);
    } catch (e: unknown) {
      expect((e as PlutoError).code).toBe(ErrorCode.CapacityExceeded);
    }
  });
});
