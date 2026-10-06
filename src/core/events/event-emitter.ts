/**
 * @file 型安全な EventEmitter。
 */

/** イベントハンドラ。 */
export type EventHandler<P> = (payload: P) => void;

interface ListenerEntry<P> {
  handler: EventHandler<P>;
  once: boolean;
  removed: boolean;
}

/**
 * 型安全なイベントエミッタ。
 * EventMap はイベント名からペイロードの型へのマッピング。
 */
export class EventEmitter<EventMap extends Record<string, unknown>> {
  private readonly listeners: {
    [K in keyof EventMap]?: ListenerEntry<EventMap[K]>[];
  } = {};

  private emitting: keyof EventMap | undefined = undefined;

  /**
   * リスナーを登録する。
   * @param event イベント名
   * @param handler ハンドラ
   */
  public on<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void {
    let list = this.listeners[event];
    if (list === undefined) {
      list = [];
      this.listeners[event] = list;
    }
    list.push({ handler, once: false, removed: false });
  }

  /**
   * 一度だけ実行されるリスナーを登録する。
   * @param event イベント名
   * @param handler ハンドラ
   */
  public once<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void {
    let list = this.listeners[event];
    if (list === undefined) {
      list = [];
      this.listeners[event] = list;
    }
    list.push({ handler, once: true, removed: false });
  }

  /**
   * 登録済みのリスナーを解除する。
   * @param event イベント名
   * @param handler 解除するハンドラ
   */
  public off<K extends keyof EventMap>(event: K, handler: EventHandler<EventMap[K]>): void {
    const list = this.listeners[event];
    if (list === undefined) return;

    for (const entry of list) {
      if (entry.handler === handler) {
        entry.removed = true;
      }
    }

    if (this.emitting !== event) {
      this.compact(list);
    }
  }

  /**
   * イベントを発火する。
   * @param event イベント名
   * @param payload ペイロード
   */
  public emit<K extends keyof EventMap>(event: K, payload: EventMap[K]): void {
    const list = this.listeners[event];
    if (list === undefined || list.length === 0) return;

    const previousEmitting = this.emitting;
    this.emitting = event;

    let shouldCompact = false;
    for (const entry of list) {
      if (entry.removed) {
        shouldCompact = true;
        continue;
      }

      entry.handler(payload);

      if (entry.once) {
        entry.removed = true;
        shouldCompact = true;
      }
    }

    this.emitting = previousEmitting;

    if (shouldCompact && this.emitting !== event) {
      this.compact(list);
    }
  }

  /**
   * リスナー配列から removed フラグの立ったものを詰める。
   */
  private compact<K extends keyof EventMap>(list: ListenerEntry<EventMap[K]>[]): void {
    let writeIndex = 0;
    for (const entry of list) {
      if (!entry.removed) {
        list[writeIndex++] = entry;
      }
    }
    list.length = writeIndex;
  }
}
