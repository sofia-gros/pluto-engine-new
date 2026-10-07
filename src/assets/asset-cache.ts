/**
 * @file アセットキャッシュ管理
 *
 * キーとアセットの紐付け、および参照カウント管理を行う。
 */

import { ErrorCode, PlutoError } from '../core/debug';
import type { AssetKey, BaseAsset } from './asset-types';

/**
 * キャッシュ内のアセットエントリ。
 */
interface CacheEntry {
  asset: BaseAsset;
  refCount: number;
}

/**
 * アセットキャッシュクラス。
 * アセットをキーごとに保持し、参照カウント（retain / release）を管理する。
 */
export class AssetCache {
  private readonly entries = new Map<AssetKey, CacheEntry>();

  /**
   * 現在キャッシュされているアセットの数を取得する。
   *
   * @returns キャッシュされたアセット数
   */
  public get size(): number {
    return this.entries.size;
  }

  /**
   * アセットをキャッシュに登録する。
   * 初期参照カウントは 1 とする。
   *
   * @param key アセットキー
   * @param asset 登録するアセット
   */
  public set(key: AssetKey, asset: BaseAsset): void {
    const existing = this.entries.get(key);
    if (existing !== undefined) {
      existing.asset = asset;
      return;
    }
    this.entries.set(key, { asset, refCount: 1 });
  }

  /**
   * キャッシュからアセットを取得する。
   *
   * @param key アセットキー
   * @returns アセット、または未登録なら undefined
   */
  public get(key: AssetKey): BaseAsset | undefined {
    const entry = this.entries.get(key);
    return entry !== undefined ? entry.asset : undefined;
  }

  /**
   * 指定したキーのアセットが存在するか判定する。
   *
   * @param key アセットキー
   * @returns 存在すれば true
   */
  public has(key: AssetKey): boolean {
    return this.entries.has(key);
  }

  /**
   * アセットの参照カウントを 1 増やす。
   *
   * @param key アセットキー
   * @returns 増加後の参照カウント
   * @throws {@link PlutoError} アセットが存在しない場合
   */
  public retain(key: AssetKey): number {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      throw new PlutoError(ErrorCode.AssetNotFound, `アセットが見つかりません: ${key}`);
    }
    entry.refCount += 1;
    return entry.refCount;
  }

  /**
   * アセットの参照カウントを 1 減らす。
   * 参照カウントが 0 以下になった場合、キャッシュから削除する。
   *
   * @param key アセットキー
   * @returns 減少後の参照カウント (削除された場合は 0)
   * @throws {@link PlutoError} アセットが存在しない場合
   */
  public release(key: AssetKey): number {
    const entry = this.entries.get(key);
    if (entry === undefined) {
      throw new PlutoError(ErrorCode.AssetNotFound, `アセットが見つかりません: ${key}`);
    }
    entry.refCount -= 1;
    if (entry.refCount <= 0) {
      this.entries.delete(key);
      return 0;
    }
    return entry.refCount;
  }

  /**
   * 指定したアセットの現在の参照カウントを取得する。
   *
   * @param key アセットキー
   * @returns 参照カウント。存在しない場合は 0
   */
  public getRefCount(key: AssetKey): number {
    const entry = this.entries.get(key);
    return entry !== undefined ? entry.refCount : 0;
  }

  /**
   * アセットをキャッシュから削除する。
   *
   * @param key アセットキー
   * @returns 削除された場合は true
   */
  public delete(key: AssetKey): boolean {
    return this.entries.delete(key);
  }

  /**
   * すべてのキャッシュをクリアする。
   */
  public clear(): void {
    this.entries.clear();
  }

  /**
   * キャッシュされている全キーの反復子を取得する。
   *
   * @returns キーの反復子
   */
  public keys(): IterableIterator<AssetKey> {
    return this.entries.keys();
  }
}
