/**
 * @file アーキタイプの遷移グラフを管理する。
 */

import { Archetype } from './archetype';
import type { AnyComponentDef } from './component';
import type { Bitset } from '../memory/bitset';

/**
 * Bitset の状態を文字列表現に変換する (Map のキーとして使用するため)。
 * 例: "1,4,10" のようにセットされているビットのインデックスをカンマ区切りにする。
 */
export function maskToString(mask: Bitset): string {
  const parts: number[] = [];
  const count = mask.capacity;
  for (let i = 0; i < count; i++) {
    if (mask.test(i)) {
      parts.push(i);
    }
  }
  return parts.join(',');
}

/**
 * アーキタイプの登録と、コンポーネント追加・削除による状態遷移を管理するグラフ。
 */
export class ArchetypeGraph {
  private readonly archetypes = new Map<string, Archetype>();

  // key: archetypeId * 512 + componentId * 2 + (isAdd ? 1 : 0)
  // value: nextArchetypeId
  private readonly edges = new Map<number, number>();

  private nextArchetypeId = 0;
  private readonly maxRowsPerArchetype: number;

  /**
   * @param maxRowsPerArchetype 各アーキタイプの最大行数 (EntityTable の capacity など)
   */
  public constructor(maxRowsPerArchetype: number) {
    this.maxRowsPerArchetype = maxRowsPerArchetype;

    // 空のアーキタイプ (ID: 0) を初期登録する
    const emptyArchetype = new Archetype(this.nextArchetypeId++, [], maxRowsPerArchetype);
    this.archetypes.set(maskToString(emptyArchetype.mask), emptyArchetype);
  }

  /**
   * グラフに登録されているすべてのアーキタイプを取得する。
   */
  public getArchetypes(): IterableIterator<Archetype> {
    return this.archetypes.values();
  }

  /**
   * 指定した ID のアーキタイプを取得する。
   * (実際の利用シーンでは World 側で id -> Archetype の配列を持つことが多いが、
   *  このクラス内でも検索用メソッドを提供しておく)
   */
  public getArchetypeById(id: number): Archetype | undefined {
    for (const arch of this.archetypes.values()) {
      if (arch.id === id) {
        return arch;
      }
    }
    return undefined;
  }

  /**
   * 指定したコンポーネント構成に対応するアーキタイプを取得するか、存在しなければ作成して返す。
   * @param components コンポーネント定義の配列
   * @returns アーキタイプ
   */
  public getOrCreateArchetype(components: readonly AnyComponentDef[]): Archetype {
    // mask生成のために一時的なArchetypeを作成するのは無駄なので、
    // まず文字列キーを構築する
    const ids = components.map((c) => c.id).sort((a, b) => a - b);
    const key = ids.join(',');

    let arch = this.archetypes.get(key);
    if (arch === undefined) {
      arch = new Archetype(this.nextArchetypeId++, components, this.maxRowsPerArchetype);
      this.archetypes.set(key, arch);
    }
    return arch;
  }

  /**
   * あるアーキタイプにコンポーネントを追加または削除した場合の遷移先アーキタイプを取得する。
   * (エッジとしてキャッシュされる)
   * @param current 現在のアーキタイプ
   * @param component 追加/削除するコンポーネント
   * @param isAdd 追加なら true、削除なら false
   * @param allComponents 現在の World に登録されている全コンポーネントのマップ (id -> ComponentDef)
   * @returns 遷移先のアーキタイプ
   */
  public transition(
    current: Archetype,
    component: AnyComponentDef,
    isAdd: boolean,
    allComponents: Map<number, AnyComponentDef>,
  ): Archetype {
    const edgeKey = current.id * 512 + component.id * 2 + (isAdd ? 1 : 0);
    const cachedId = this.edges.get(edgeKey);

    if (cachedId !== undefined) {
      const cached = this.getArchetypeById(cachedId);
      if (cached !== undefined) {
        return cached;
      }
    }

    // 遷移先のコンポーネントリストを構築
    const nextComponents: AnyComponentDef[] = [];
    const capacity = current.mask.capacity;

    for (let i = 0; i < capacity; i++) {
      if (current.mask.test(i)) {
        if (!isAdd && i === component.id) {
          continue; // 削除
        }
        const comp = allComponents.get(i);
        if (comp) nextComponents.push(comp);
      }
    }

    if (isAdd && !current.mask.test(component.id)) {
      nextComponents.push(component);
    }

    const nextArchetype = this.getOrCreateArchetype(nextComponents);
    this.edges.set(edgeKey, nextArchetype.id);
    return nextArchetype;
  }
}
