// @pluto-hot
/**
 * @file クエリ (条件に合致するアーキタイプの抽出と反復処理)。
 */

import type { Archetype } from './archetype';
import { ChunkView, CHUNK_ROWS } from './chunk-view';
import type { AnyComponentDef } from './component';
import { Bitset } from '../memory/bitset';
import { MAX_COMPONENTS } from './component';

export interface QueryDesc {
  all?: readonly AnyComponentDef[];
  none?: readonly AnyComponentDef[];
}

/**
 * 指定したコンポーネント構成条件(all, none)に合致するアーキタイプを抽出し、
 * そのチャンクを反復処理するためのクラス。
 */
let nextQueryId = 1;

export class Query {
  public readonly id = nextQueryId++;
  private readonly allMask: Bitset;
  private readonly noneMask: Bitset;

  // キャッシュされた適合アーキタイプ
  public readonly archetypes: Archetype[] = [];

  // 反復処理用に使い回すビュー
  private readonly view = new ChunkView();

  /**
   * @param desc クエリの条件 (all, none)
   */
  public constructor(desc: QueryDesc) {
    this.allMask = new Bitset(MAX_COMPONENTS);
    this.noneMask = new Bitset(MAX_COMPONENTS);

    if (desc.all) {
      for (const comp of desc.all) {
        this.allMask.set(comp.id);
      }
    }
    if (desc.none) {
      for (const comp of desc.none) {
        this.noneMask.set(comp.id);
      }
    }
  }

  /**
   * 対象のアーキタイプがこのクエリの条件に合致するかを判定する。
   * @param archetype 判定するアーキタイプ
   */
  public match(archetype: Archetype): boolean {
    const archData = archetype.mask.data;
    const allData = this.allMask.data;
    const noneData = this.noneMask.data;

    const len = archData.length;
    for (let i = 0; i < len; i++) {
      const a = archData[i];
      const all = allData[i];
      const none = noneData[i];

      // all の条件を満たしているか (a & all) == all
      if ((a & all) !== all) {
        return false;
      }

      // none の条件を満たしているか (a & none) == 0
      if ((a & none) !== 0) {
        return false;
      }
    }

    return true;
  }

  /**
   * Worldの ArchetypeGraph 等から新しいアーキタイプが生成された場合に、
   * このクエリにマッチするか判定してキャッシュに登録する。
   * (World 側から呼ぶためのメソッド)
   * @param archetype 追加されたアーキタイプ
   */
  public tryRegister(archetype: Archetype): void {
    if (this.match(archetype)) {
      this.archetypes.push(archetype);
    }
  }

  /**
   * マッチしたすべてのアーキタイプの合計行数 (エンティティ数) を返す。
   */
  public count(): number {
    let total = 0;
    const len = this.archetypes.length;
    for (let i = 0; i < len; i++) {
      total += this.archetypes[i].count;
    }
    return total;
  }

  /**
   * マッチしたすべてのチャンク数を返す。
   */
  public chunkCount(): number {
    let total = 0;
    const len = this.archetypes.length;
    for (let i = 0; i < len; i++) {
      const arch = this.archetypes[i];
      total += Math.ceil(arch.count / CHUNK_ROWS);
    }
    return total;
  }

  /**
   * 指定されたグローバルチャンクインデックスの ChunkView を構築する (ジョブシステム用)。
   * @param globalChunkIndex 通し番号
   * @param out 結果を格納する ChunkView
   */
  public getChunk(globalChunkIndex: number, out: ChunkView): void {
    let currentGlobalIndex = 0;

    const len = this.archetypes.length;
    for (let i = 0; i < len; i++) {
      const arch = this.archetypes[i];
      const chunks = Math.ceil(arch.count / CHUNK_ROWS);

      if (
        globalChunkIndex >= currentGlobalIndex &&
        globalChunkIndex < currentGlobalIndex + chunks
      ) {
        const localIndex = globalChunkIndex - currentGlobalIndex;
        out.archetype = arch;
        out.start = localIndex * CHUNK_ROWS;
        out.end = Math.min((localIndex + 1) * CHUNK_ROWS, arch.count);
        out.chunkIndex = localIndex;
        return;
      }

      currentGlobalIndex += chunks;
    }

    throw new Error('Query: globalChunkIndex が範囲外です');
  }

  /**
   * マッチしたすべてのチャンクに対してコールバックを実行する。
   * @hot
   * @param cb コールバック
   */
  public forEachChunk(cb: (view: ChunkView) => void): void {
    const view = this.view;
    const archs = this.archetypes;

    const len = archs.length;
    for (let i = 0; i < len; i++) {
      const arch = archs[i];
      view.archetype = arch;

      const count = arch.count;
      let start = 0;
      let chunkIndex = 0;

      while (start < count) {
        view.start = start;
        view.end = start + CHUNK_ROWS;
        if (view.end > count) {
          view.end = count;
        }
        view.chunkIndex = chunkIndex;

        cb(view);

        start += CHUNK_ROWS;
        chunkIndex++;
      }
    }
  }
}
