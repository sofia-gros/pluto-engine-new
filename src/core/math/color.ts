// @pluto-hot
/**
 * @file カラー関数の定義。
 */

/**
 * 0-255 の RGBA 値を一つの 32 ビット整数 (ABGR形式) にパックする。
 * @hot
 * @param r 赤 (0-255)
 * @param g 緑 (0-255)
 * @param b 青 (0-255)
 * @param a アルファ (0-255)
 * @returns ABGR形式の32ビット整数
 */
export function packColor(r: number, g: number, b: number, a: number): number {
  return (((a & 0xff) << 24) | ((b & 0xff) << 16) | ((g & 0xff) << 8) | (r & 0xff)) >>> 0;
}

/**
 * 16進数RGB表記 (0xRRGGBB) とアルファ値 (0-255) から ABGR形式の32ビット整数を生成する。
 * @hot
 * @param hex 0xRRGGBB
 * @param a アルファ (0-255)
 * @returns ABGR形式の32ビット整数
 */
export function hexToColor(hex: number, a = 255): number {
  const r = (hex >>> 16) & 0xff;
  const g = (hex >>> 8) & 0xff;
  const b = hex & 0xff;
  return packColor(r, g, b, a);
}

/**
 * ABGR形式のカラーから R 成分を取り出す。
 * @hot
 * @param abgr カラー値
 * @returns 赤 (0-255)
 */
export function unpackR(abgr: number): number {
  return abgr & 0xff;
}

/**
 * ABGR形式のカラーから G 成分を取り出す。
 * @hot
 * @param abgr カラー値
 * @returns 緑 (0-255)
 */
export function unpackG(abgr: number): number {
  return (abgr >>> 8) & 0xff;
}

/**
 * ABGR形式のカラーから B 成分を取り出す。
 * @hot
 * @param abgr カラー値
 * @returns 青 (0-255)
 */
export function unpackB(abgr: number): number {
  return (abgr >>> 16) & 0xff;
}

/**
 * ABGR形式のカラーから A 成分を取り出す。
 * @hot
 * @param abgr カラー値
 * @returns アルファ (0-255)
 */
export function unpackA(abgr: number): number {
  return (abgr >>> 24) & 0xff;
}
