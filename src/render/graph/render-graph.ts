/**
 * @file レンダーグラフ (docs/07-renderer.md §12, docs/02-directory-structure.md §17)。
 * パス登録・実行順序・一時リソースの寿命管理を行う線形レンダーグラフ。
 */

import type { RhiCommandEncoder } from '../../rhi';
import type { RenderPassContext, RenderPassNode } from './render-pass-node';

/**
 * レンダーグラフの既定パス順序定義 (docs/07-renderer.md §12)。
 * sim:* → sprite:cull → tilemap:draw → sprite:draw → text:draw → graphics:draw → lighting → camera:fx → post:* → present
 */
export const DEFAULT_PASS_ORDER = [
  'sim',
  'sprite:cull',
  'tilemap:draw',
  'sprite:draw',
  'text:draw',
  'graphics:draw',
  'lighting',
  'camera:fx',
  'post',
  'present',
] as const;

/** 既定パス名の型 */
export type DefaultPassName = (typeof DEFAULT_PASS_ORDER)[number];

/**
 * パス名が属する既定順序カテゴリのインデックスを取得する。
 * @param passName パス名
 * @returns 順序インデックス (見つからない場合は末尾)
 */
export function getPassOrderIndex(passName: string): number {
  for (let i = 0; i < DEFAULT_PASS_ORDER.length; i++) {
    const defaultName = DEFAULT_PASS_ORDER[i] as string;
    if (passName === defaultName || passName.startsWith(`${defaultName}:`)) {
      return i;
    }
  }
  return DEFAULT_PASS_ORDER.length;
}

/**
 * レンダーグラフクラス。
 */
export class RenderGraph {
  private readonly passes: RenderPassNode[] = [];
  private readonly passMap = new Map<string, RenderPassNode>();

  /**
   * パスを追加する (末尾に追加)。
   * @param pass 追加するパスノード
   */
  public addPass(pass: RenderPassNode): void {
    if (this.passMap.has(pass.name)) {
      this.removePass(pass.name);
    }
    this.passes.push(pass);
    this.passMap.set(pass.name, pass);
  }

  /**
   * 既定パス順序 (DEFAULT_PASS_ORDER) に従ってパスを挿入する。
   * @param pass 挿入するパスノード
   */
  public addPassInOrder(pass: RenderPassNode): void {
    if (this.passMap.has(pass.name)) {
      this.removePass(pass.name);
    }
    const targetOrder = getPassOrderIndex(pass.name);
    let hasInserted = false;
    for (let i = 0; i < this.passes.length; i++) {
      const existing = this.passes[i];
      const existingOrder = getPassOrderIndex(existing.name);
      if (targetOrder < existingOrder) {
        this.passes.splice(i, 0, pass);
        hasInserted = true;
        break;
      }
    }
    if (!hasInserted) {
      this.passes.push(pass);
    }
    this.passMap.set(pass.name, pass);
  }

  /**
   * 指定した名前のパスを取得する。
   * @param name パス名
   * @returns パスノード、存在しない場合は undefined
   */
  public getPass(name: string): RenderPassNode | undefined {
    return this.passMap.get(name);
  }

  /**
   * 指定した名前のパスを削除する。
   * @param name パス名
   * @returns 削除された場合 true
   */
  public removePass(name: string): boolean {
    if (!this.passMap.has(name)) {
      return false;
    }
    this.passMap.delete(name);
    const idx = this.passes.findIndex((p) => p.name === name);
    if (idx !== -1) {
      this.passes.splice(idx, 1);
      return true;
    }
    return false;
  }

  /**
   * すべての登録パスをクリアする。
   */
  public clear(): void {
    this.passes.length = 0;
    this.passMap.clear();
  }

  /**
   * 登録されている全パス一覧を取得する。
   * @returns パスノードの配列
   */
  public getPasses(): readonly RenderPassNode[] {
    return this.passes;
  }

  /**
   * レンダーグラフの全パスを順次実行する。
   * @param encoder コマンドエンコーダ
   * @param ctx レンダーパス実行コンテキスト
   */
  public execute(encoder: RhiCommandEncoder, ctx: RenderPassContext): void {
    for (const pass of this.passes) {
      pass.execute(encoder, ctx);
    }
  }
}
