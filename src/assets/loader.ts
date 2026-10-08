/**
 * @file アセットローダ (キューおよび進捗管理)
 *
 * 複数アセットの読み込みキュー、並列読み込み、進捗イベント通知を行う。
 */

import { ErrorCode, PlutoError } from '../core/debug';
import { EventEmitter } from '../core/events';
import { AssetCache } from './asset-cache';
import {
  AssetType,
  type AssetKey,
  type AssetType as AssetTypeEnum,
  type BaseAsset,
} from './asset-types';
import { loadAtlasJson } from './loaders/atlas-loader';
import { loadImage } from './loaders/image-loader';
import { loadJson } from './loaders/json-loader';

/**
 * 読み込みリクエストの記述子。
 */
export interface LoadRequest {
  readonly key: AssetKey;
  readonly type: AssetTypeEnum;
  readonly url: string;
  readonly extra?:
    | {
        readonly imageKey?: string | undefined;
        readonly imageUrl?: string | undefined;
      }
    | undefined;
}

/**
 * Loader が発火するイベント定義。
 */
export interface LoaderEvents extends Record<string, unknown> {
  readonly progress: {
    readonly progress: number;
    readonly loaded: number;
    readonly total: number;
    readonly key: AssetKey;
    readonly asset: BaseAsset;
  };
  readonly error: {
    readonly key: AssetKey;
    readonly error: PlutoError;
  };
  readonly complete: {
    readonly cache: AssetCache;
  };
}

/**
 * アセット読み込み管理クラス。
 */
export class Loader extends EventEmitter<LoaderEvents> {
  private readonly queue: LoadRequest[] = [];
  private readonly assetCache: AssetCache;
  private readonly concurrency: number;
  private isCurrentlyLoading = false;

  /**
   * @param cache 利用するアセットキャッシュ (省略時は新規作成)
   * @param concurrency 最大同時並列フェッチ数 (デフォルト: 6)
   */
  public constructor(cache?: AssetCache, concurrency = 6) {
    super();
    this.assetCache = cache ?? new AssetCache();
    this.concurrency = Math.max(1, concurrency);
  }

  /**
   * 紐付けられているアセットキャッシュを取得する。
   *
   * @returns アセットキャッシュ
   */
  public get cache(): AssetCache {
    return this.assetCache;
  }

  /**
   * 現在キューに入っている未処理リクエスト数を取得する。
   *
   * @returns リクエスト数
   */
  public get queueLength(): number {
    return this.queue.length;
  }

  /**
   * 読み込みリクエストをキューに追加する。
   *
   * @param request 読み込みリクエスト
   * @returns 自身 (メソッドチェーン用)
   */
  public add(request: LoadRequest): this {
    if (this.isCurrentlyLoading) {
      throw new PlutoError(
        ErrorCode.InvalidState,
        '読み込み実行中に新しいリクエストを追加することはできません。',
      );
    }
    this.queue.push(request);
    return this;
  }

  /**
   * 画像リクエストをキューに追加する。
   *
   * @param key アセットキー
   * @param url 画像 URL
   * @returns 自身 (メソッドチェーン用)
   */
  public addImage(key: AssetKey, url: string): this {
    return this.add({
      key,
      type: AssetType.Image,
      url,
    });
  }

  /**
   * テクスチャアトラスリクエストをキューに追加する。
   *
   * @param key アトラスのアセットキー
   * @param jsonUrl アトラス JSON の URL
   * @param imageUrl 対応する画像の URL (省略時は JSON 内の指定を使用)
   * @param imageKey 画像のアセットキー (省略時は key + '_image')
   * @returns 自身 (メソッドチェーン用)
   */
  public addAtlas(key: AssetKey, jsonUrl: string, imageUrl?: string, imageKey?: string): this {
    const actualImageKey = imageKey ?? `${key}_image`;
    if (imageUrl !== undefined) {
      this.addImage(actualImageKey, imageUrl);
    }
    return this.add({
      key,
      type: AssetType.Atlas,
      url: jsonUrl,
      extra: {
        imageKey: actualImageKey,
        imageUrl,
      },
    });
  }

  /**
   * 汎用 JSON リクエストをキューに追加する。
   *
   * @param key アセットキー
   * @param url JSON の URL
   * @returns 自身 (メソッドチェーン用)
   */
  public addJson(key: AssetKey, url: string): this {
    return this.add({
      key,
      type: AssetType.Json,
      url,
    });
  }

  /**
   * キューに登録された全アセットを並列に読み込む。
   *
   * @returns 読み込み完了後のアセットキャッシュ
   * @throws {@link PlutoError} 既に実行中または読み込みエラーが発生した場合
   */
  public async load(): Promise<AssetCache> {
    if (this.isCurrentlyLoading) {
      throw new PlutoError(ErrorCode.InvalidState, '既に読み込みが実行されています。');
    }

    if (this.queue.length === 0) {
      this.emit('complete', { cache: this.assetCache });
      return this.assetCache;
    }

    this.isCurrentlyLoading = true;
    const requests = [...this.queue];
    this.queue.length = 0;

    const total = requests.length;
    let loadedCount = 0;

    const worker = async (): Promise<void> => {
      while (requests.length > 0) {
        const req = requests.shift();
        if (req === undefined) {
          break;
        }

        try {
          let asset: BaseAsset;
          if (req.type === AssetType.Image) {
            asset = await loadImage(req.key, req.url);
          } else if (req.type === AssetType.Atlas) {
            asset = await loadAtlasJson(req.key, req.url, req.extra?.imageKey);
          } else if (req.type === AssetType.Json) {
            asset = await loadJson(req.key, req.url);
          } else {
            throw new PlutoError(ErrorCode.UnsupportedFeature, '未対応のアセットタイプです。');
          }

          this.assetCache.set(req.key, asset);
          loadedCount++;

          this.emit('progress', {
            progress: loadedCount / total,
            loaded: loadedCount,
            total,
            key: req.key,
            asset,
          });
        } catch (e: unknown) {
          const error =
            e instanceof PlutoError
              ? e
              : new PlutoError(
                  ErrorCode.AssetLoadFailed,
                  `アセットの読み込みに失敗しました (${req.key}): ${String(e)}`,
                );
          this.emit('error', { key: req.key, error });
          this.isCurrentlyLoading = false;
          throw error;
        }
      }
    };

    const workerCount = Math.min(this.concurrency, total);
    const workers: Promise<void>[] = [];
    for (let i = 0; i < workerCount; i++) {
      workers.push(worker());
    }

    try {
      await Promise.all(workers);
    } finally {
      this.isCurrentlyLoading = false;
    }

    this.emit('complete', { cache: this.assetCache });
    return this.assetCache;
  }
}
