/**
 * @file 一時レンダーターゲットテクスチャのプール (docs/07-renderer.md §12, docs/02-directory-structure.md §17)。
 * パス間で共有される中間バッファをサイズ・フォーマットごとにキャッシュ・再利用する。
 */

import type { RhiDevice, RhiTexture, TextureDesc } from '../../rhi';

interface PooledTextureEntry {
  texture: RhiTexture;
  inUse: boolean;
}

/**
 * 一時テクスチャのプールクラス。
 */
export class TransientPool {
  private readonly device: RhiDevice;
  private readonly pool = new Map<string, PooledTextureEntry[]>();
  private readonly allTextures: RhiTexture[] = [];

  public constructor(device: RhiDevice) {
    this.device = device;
  }

  /**
   * 指定した記述子の一時テクスチャを取得（再利用または新規作成）する。
   * @param desc テクスチャ記述子
   * @returns 取得された一時テクスチャ
   */
  public acquire(desc: TextureDesc): RhiTexture {
    const key = `${String(desc.width)}_${String(desc.height)}_${String(desc.format)}_${String(desc.usage)}_${String(desc.layers)}`;
    let entries = this.pool.get(key);
    if (!entries) {
      entries = [];
      this.pool.set(key, entries);
    }

    for (const entry of entries) {
      if (!entry.inUse) {
        entry.inUse = true;
        return entry.texture;
      }
    }

    // 利用可能なものがない場合は新規作成
    const texture = this.device.createTexture({
      ...desc,
      label: desc.label ? `Transient_${desc.label}` : 'TransientTexture',
    });
    entries.push({ texture, inUse: true });
    this.allTextures.push(texture);
    return texture;
  }

  /**
   * 使用中の一時テクスチャをプールに返却する。
   * @param texture 返却する一時テクスチャ
   */
  public release(texture: RhiTexture): void {
    for (const entries of this.pool.values()) {
      for (const entry of entries) {
        if (entry.texture === texture) {
          entry.inUse = false;
          return;
        }
      }
    }
  }

  /**
   * フレーム終了時にすべての使用フラグをリセットする。
   */
  public reset(): void {
    for (const entries of this.pool.values()) {
      for (const entry of entries) {
        entry.inUse = false;
      }
    }
  }

  /**
   * プール内のすべてのテクスチャを破棄する。
   */
  public destroy(): void {
    for (const tex of this.allTextures) {
      tex.destroy();
    }
    this.pool.clear();
    this.allTextures.length = 0;
  }
}
