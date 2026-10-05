/**
 * @file オブジェクトプール (コールドパスや汎用用途向け)。
 */

/**
 * コールドパス用オブジェクトプール。
 * メモリ確保のオーバーヘッドを避けるためにオブジェクトを再利用する。
 */
export class ObjectPool<T> {
  private readonly pool: T[];
  private readonly factory: () => T;
  private readonly reset: ((obj: T) => void) | undefined;

  /**
   * @param factory オブジェクト生成関数
   * @param reset オブジェクト返却時の初期化関数
   * @param initialCapacity 初期容量
   */
  public constructor(factory: () => T, reset?: (obj: T) => void, initialCapacity = 0) {
    this.pool = [];
    this.factory = factory;
    this.reset = reset;

    for (let i = 0; i < initialCapacity; i++) {
      this.pool.push(this.factory());
    }
  }

  /**
   * プールからオブジェクトを取得する。
   * @returns オブジェクト
   */
  public acquire(): T {
    const obj = this.pool.pop();
    if (obj !== undefined) {
      return obj;
    }
    return this.factory();
  }

  /**
   * オブジェクトをプールに返却する。
   * @param obj 返却するオブジェクト
   */
  public release(obj: T): void {
    if (this.reset !== undefined) {
      this.reset(obj);
    }
    this.pool.push(obj);
  }
}
