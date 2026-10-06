/**
 * @file アーキタイプの登録と、コンポーネント追加/削除による遷移のキャッシュ (docs/04-memory-and-ecs.md §4.3)。
 */
import { ErrorCode, PlutoError } from '../debug';
import { Bitset } from '../memory';
import { Archetype } from './archetype';
import { COMPONENT_REGISTRY, MAX_COMPONENTS } from './component';
import type { AnyComponentDef } from './component';

/** アーキタイプ ID の上限 (排他。0xFFFF は NULL_ARCHETYPE)。 */
export const MAX_ARCHETYPES = 0xffff;

/**
 * ビットマスクを 16 進文字列キーにする (語ごとに 8 桁固定)。
 * @param mask コンポーネントのビットマスク
 * @returns キー
 */
export function maskToKey(mask: Bitset): string {
  let key = '';
  const words = mask.data;
  const n = words.length;
  for (let i = 0; i < n; i++) key += words[i].toString(16).padStart(8, '0');
  return key;
}

/** 新しいアーキタイプが作られたときに呼ばれる関数。 */
export type ArchetypeCreatedCallback = (archetype: Archetype) => void;

/**
 * アーキタイプの集合と遷移グラフ。
 */
export class ArchetypeGraph {
  /** ID → アーキタイプ (ID は 0 からの連番)。 */
  private readonly byId: Archetype[] = [];
  private readonly byKey = new Map<string, Archetype>();
  /** キー: archetypeId * 512 + componentId * 2 + (追加なら 1)、値: 遷移先 ID。 */
  private readonly edges = new Map<number, number>();
  private readonly maxRowsPerArchetype: number;
  private readonly onCreate: ArchetypeCreatedCallback | undefined;
  private readonly onGrow: ArchetypeCreatedCallback | undefined;
  private readonly scratchMask = new Bitset(MAX_COMPONENTS);

  /**
   * @param maxRowsPerArchetype 各アーキタイプの最大行数
   * @param onCreate 新しいアーキタイプが作られたときの通知 (World がクエリ登録に使う)
   * @param onGrow アーキタイプのバッファが作り直されたときの通知 (World が structureVersion を進める)
   */
  public constructor(
    maxRowsPerArchetype: number,
    onCreate?: ArchetypeCreatedCallback,
    onGrow?: ArchetypeCreatedCallback,
  ) {
    this.maxRowsPerArchetype = maxRowsPerArchetype;
    this.onCreate = onCreate;
    this.onGrow = onGrow;
    this.create([]); // ID 0 = 空アーキタイプ
  }

  /** 登録済みアーキタイプ数。 */
  public get size(): number {
    return this.byId.length;
  }

  /**
   * すべてのアーキタイプ (ID 順)。
   * @returns アーキタイプの配列
   */
  public getArchetypes(): readonly Archetype[] {
    return this.byId;
  }

  /**
   * ID でアーキタイプを引く (O(1))。
   * @param id アーキタイプ ID
   * @returns アーキタイプ。無ければ undefined
   */
  public getArchetypeById(id: number): Archetype | undefined {
    return this.byId[id];
  }

  /**
   * コンポーネント構成に対応するアーキタイプを取得し、無ければ作る (コールドパス)。
   * @param components コンポーネント (順不同・重複可)
   * @returns アーキタイプ
   */
  public getOrCreateArchetype(components: readonly AnyComponentDef[]): Archetype {
    const mask = this.scratchMask;
    mask.data.fill(0);
    for (const c of components) mask.set(c.id);
    const found = this.byKey.get(maskToKey(mask));
    if (found !== undefined) return found;
    const unique: AnyComponentDef[] = [];
    for (let id = 0; id < MAX_COMPONENTS; id++) {
      if (mask.test(id)) unique.push(COMPONENT_REGISTRY[id]);
    }
    return this.create(unique);
  }

  /**
   * コンポーネントを追加/削除したときの遷移先を返す (エッジをキャッシュする)。
   * @param current 現在のアーキタイプ
   * @param component 追加/削除するコンポーネント
   * @param isAdd 追加なら true
   * @returns 遷移先 (変化が無ければ current)
   */
  public transition(current: Archetype, component: AnyComponentDef, isAdd: boolean): Archetype {
    if (current.hasComponent(component.id) === isAdd) return current;
    const edgeKey = current.id * 512 + component.id * 2 + (isAdd ? 1 : 0);
    const cached = this.edges.get(edgeKey);
    if (cached !== undefined) return this.byId[cached];
    const next: AnyComponentDef[] = [];
    for (let id = 0; id < MAX_COMPONENTS; id++) {
      if (current.mask.test(id) && id !== component.id) next.push(COMPONENT_REGISTRY[id]);
    }
    if (isAdd) next.push(component);
    const target = this.getOrCreateArchetype(next);
    this.edges.set(edgeKey, target.id);
    return target;
  }

  /**
   * アーキタイプを作って登録する。
   * @param components 重複のないコンポーネント
   * @returns 作ったアーキタイプ
   */
  private create(components: readonly AnyComponentDef[]): Archetype {
    if (this.byId.length >= MAX_ARCHETYPES) {
      throw new PlutoError(
        ErrorCode.CapacityExceeded,
        'アーキタイプ数が上限 (65535) に達しました。コンポーネントの組み合わせを減らしてください。',
      );
    }
    const arch = new Archetype(
      this.byId.length,
      components,
      this.maxRowsPerArchetype,
      undefined,
      this.onGrow,
    );
    this.byId.push(arch);
    this.byKey.set(maskToKey(arch.mask), arch);
    this.onCreate?.(arch);
    return arch;
  }
}
