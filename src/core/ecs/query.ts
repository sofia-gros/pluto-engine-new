// @pluto-hot
/**
 * @file クエリ: all / none 条件に合うアーキタイプのキャッシュとチャンク列挙 (docs/04-memory-and-ecs.md §5.3)。
 */
import { ErrorCode, PlutoError } from '../debug';
import { Bitset } from '../memory';
import type { Archetype } from './archetype';
import { CHUNK_ROWS, ChunkView } from './chunk-view';
import { MAX_COMPONENTS } from './component';
import type { AnyComponentDef } from './component';

/** クエリの条件。 */
export interface QueryDesc {
  /** すべて持つべきコンポーネント。 */
  readonly all?: readonly AnyComponentDef[];
  /** 1 つも持ってはならないコンポーネント。 */
  readonly none?: readonly AnyComponentDef[];
}

/** チャンクごとに呼ばれるコールバック (毎フレーム生成せず、事前に定義した関数を渡す)。 */
export type ChunkCallback = (view: ChunkView) => void;

/**
 * 条件の正規形キー (コンポーネント ID を昇順に並べる。指定順序に依存しない)。
 * @cold world.query() のキャッシュ検索でだけ使う
 * @param desc クエリ条件
 * @returns キー
 */
export function queryKey(desc: QueryDesc): string {
  const ids = (list: readonly AnyComponentDef[] | undefined): string =>
    (list ?? [])
      .map((c) => c.id)
      .sort((a, b) => a - b)
      .join(',');
  return `${ids(desc.all)}|${ids(desc.none)}`;
}

let nextQueryId = 1;

/**
 * 条件に合うアーキタイプを保持し、チャンクを列挙するクエリ。
 */
export class Query {
  /** クエリ ID (1 からの連番)。 */
  public readonly id: number = nextQueryId++;
  /** 登録済みのアーキタイプ (登録順)。 */
  public readonly archetypes: readonly Archetype[];
  private readonly matched: Archetype[] = [];
  private readonly registered = new Set<number>();
  private readonly allMask = new Bitset(MAX_COMPONENTS);
  private readonly noneMask = new Bitset(MAX_COMPONENTS);
  private readonly view = new ChunkView();

  /**
   * @param desc クエリ条件
   */
  public constructor(desc: QueryDesc) {
    this.archetypes = this.matched;
    for (const c of desc.all ?? []) this.allMask.set(c.id);
    for (const c of desc.none ?? []) this.noneMask.set(c.id);
  }

  /**
   * アーキタイプが条件に合うか。
   * @hot
   * @param archetype 判定するアーキタイプ
   * @returns 合えば true
   */
  public match(archetype: Archetype): boolean {
    const a = archetype.mask.data;
    const all = this.allMask.data;
    const none = this.noneMask.data;
    const len = a.length;
    for (let i = 0; i < len; i++) {
      if ((a[i] & all[i]) !== all[i] || (a[i] & none[i]) !== 0) return false;
    }
    return true;
  }

  /**
   * アーキタイプが条件に合えば登録する (同じアーキタイプは 1 回だけ)。
   * @param archetype 新しく作られたアーキタイプ
   * @returns 新たに登録したら true
   */
  public tryRegister(archetype: Archetype): boolean {
    if (this.registered.has(archetype.id) || !this.match(archetype)) return false;
    this.registered.add(archetype.id);
    this.matched.push(archetype);
    return true;
  }

  /**
   * 該当エンティティの総数。
   * @hot
   * @returns 行数の合計
   */
  public count(): number {
    let total = 0;
    const archs = this.matched;
    const n = archs.length;
    for (let i = 0; i < n; i++) total += archs[i].count;
    return total;
  }

  /**
   * チャンクの総数。
   * @hot
   * @returns チャンク数
   */
  public chunkCount(): number {
    let total = 0;
    const archs = this.matched;
    const n = archs.length;
    for (let i = 0; i < n; i++) total += Math.ceil(archs[i].count / CHUNK_ROWS);
    return total;
  }

  /**
   * 通し番号のチャンクのビューを作る (jobs が使う)。
   * @hot
   * @param globalChunkIndex 0 〜 chunkCount() - 1
   * @param out 書き込み先のビュー
   */
  public getChunk(globalChunkIndex: number, out: ChunkView): void {
    let base = 0;
    const archs = this.matched;
    const n = archs.length;
    for (let i = 0; i < n; i++) {
      const arch = archs[i];
      const chunks = Math.ceil(arch.count / CHUNK_ROWS);
      if (globalChunkIndex < base + chunks) {
        const local = globalChunkIndex - base;
        out.archetype = arch;
        out.start = local * CHUNK_ROWS;
        out.end = Math.min(out.start + CHUNK_ROWS, arch.count);
        out.chunkIndex = globalChunkIndex;
        return;
      }
      base += chunks;
    }
    throw new PlutoError(ErrorCode.InvalidArgument, 'Query.getChunk: チャンク番号が範囲外です。');
  }

  /**
   * すべてのチャンクに対してコールバックを呼ぶ (ビューは使い回す)。
   * @hot
   * @param cb コールバック
   */
  public forEachChunk(cb: ChunkCallback): void {
    const view = this.view;
    const archs = this.matched;
    let globalIndex = 0;
    const n = archs.length;
    for (let i = 0; i < n; i++) {
      const arch = archs[i];
      const count = arch.count;
      view.archetype = arch;
      for (let start = 0; start < count; start += CHUNK_ROWS) {
        view.start = start;
        view.end = Math.min(start + CHUNK_ROWS, count);
        view.chunkIndex = globalIndex++;
        cb(view);
      }
    }
  }
}
