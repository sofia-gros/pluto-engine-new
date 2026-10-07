/**
 * @file 個別画像の実行時アトラスパッカー (shelf アルゴリズム)
 *
 * 2px のパディングを確保しながら shelf (棚詰め) アルゴリズムにより
 * 複数のテクスチャを 2048x2048 のアトラスページにパッキングする。
 */

import { ErrorCode, PlutoError } from '../../core/debug';
import { ATLAS_PAGE_SIZE, MAX_ATLAS_PAGES } from '../render-constants';

/**
 * パッキング対象の画像入力記述子。
 */
export interface PackerImageInput {
  readonly id: string | number;
  readonly width: number;
  readonly height: number;
}

/**
 * パッキング後の配置結果。
 */
export interface PackedLocation {
  readonly id: string | number;
  readonly page: number;
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
}

/**
 * 内部棚 (Shelf) の状態。
 */
interface Shelf {
  y: number;
  height: number;
  currentX: number;
}

/**
 * 内部ページの状態。
 */
interface Page {
  shelves: Shelf[];
  currentY: number;
}

/**
 * アトラスパッカー設定。
 */
export interface AtlasPackerOptions {
  /** ページの幅・高さ (px) (既定: 2048) */
  readonly pageSize?: number;
  /** 最大ページ数 (既定: 64) */
  readonly maxPages?: number;
  /** スプライト周囲のパディング (px) (既定: 2) */
  readonly padding?: number;
}

/**
 * shelf アルゴリズムによるテクスチャアトラスパッカー。
 */
export class AtlasPacker {
  private readonly pageSize: number;
  private readonly maxPages: number;
  private readonly padding: number;
  private readonly pages: Page[] = [];

  /**
   * @param options パッカー設定
   */
  public constructor(options: AtlasPackerOptions = {}) {
    this.pageSize = options.pageSize ?? ATLAS_PAGE_SIZE;
    this.maxPages = options.maxPages ?? MAX_ATLAS_PAGES;
    this.padding = options.padding ?? 2;
  }

  /**
   * 現在使用されているページ数を取得する。
   *
   * @returns ページ数
   */
  public get pageCount(): number {
    return this.pages.length;
  }

  /**
   * 単一の画像をパッキングして配置位置を返す。
   *
   * @param id 画像の識別子
   * @param width 画像の幅 (px)
   * @param height 画像の高さ (px)
   * @returns 配置位置
   * @throws {@link PlutoError} 画像サイズがページを超える場合、または最大ページ数を超過した場合
   */
  public addImage(id: string | number, width: number, height: number): PackedLocation {
    const paddedW = width + this.padding * 2;
    const paddedH = height + this.padding * 2;

    if (paddedW > this.pageSize || paddedH > this.pageSize) {
      throw new PlutoError(
        ErrorCode.InvalidArgument,
        `画像サイズ (${String(width)}x${String(height)}) がアトラスページサイズ (${String(this.pageSize)}) をパディング込みで超過しています。`,
      );
    }

    // 既存ページ内の空き棚に収まるか探索
    for (const [p, page] of this.pages.entries()) {
      // 既存棚の横の空きを探索 (Shelf First-Fit)
      for (const shelf of page.shelves) {
        if (paddedH <= shelf.height && shelf.currentX + paddedW <= this.pageSize) {
          const loc: PackedLocation = {
            id,
            page: p,
            x: shelf.currentX + this.padding,
            y: shelf.y + this.padding,
            width,
            height,
          };
          shelf.currentX += paddedW;
          return loc;
        }
      }

      // 既存ページの下部に新しい棚を作成できるか
      if (page.currentY + paddedH <= this.pageSize) {
        const newShelf: Shelf = {
          y: page.currentY,
          height: paddedH,
          currentX: paddedW,
        };
        page.shelves.push(newShelf);
        page.currentY += paddedH;

        return {
          id,
          page: p,
          x: this.padding,
          y: newShelf.y + this.padding,
          width,
          height,
        };
      }
    }

    // 新しいページを作成
    if (this.pages.length >= this.maxPages) {
      throw new PlutoError(
        ErrorCode.CapacityExceeded,
        `最大アトラスページ数 (${String(this.maxPages)}) を超過しました。`,
      );
    }

    const newPageIndex = this.pages.length;
    const newShelf: Shelf = {
      y: 0,
      height: paddedH,
      currentX: paddedW,
    };
    const newPage: Page = {
      shelves: [newShelf],
      currentY: paddedH,
    };
    this.pages.push(newPage);

    return {
      id,
      page: newPageIndex,
      x: this.padding,
      y: this.padding,
      width,
      height,
    };
  }

  /**
   * 複数の画像を一括でパッキングする。
   * 高さの降順でソートしてから詰めることで充填効率を高める。
   *
   * @param images 入力画像の配列
   * @returns パッキング結果の配列
   */
  public pack(images: readonly PackerImageInput[]): PackedLocation[] {
    // 高さ降順にソート
    const sorted = [...images].sort((a, b) => b.height - a.height);
    const results: PackedLocation[] = [];

    for (const img of sorted) {
      results.push(this.addImage(img.id, img.width, img.height));
    }

    return results;
  }

  /**
   * パッカーの状態を初期化する。
   */
  public reset(): void {
    this.pages.length = 0;
  }
}
