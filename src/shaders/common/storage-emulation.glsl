// WebGL2 データテクスチャによるストレージバッファ読取ヘルパ (docs/06-rhi.md §7)
// 1 texel = 16 バイト (RGBA32UI)。幅は DATA_TEXTURE_WIDTH = 2048 texel。

#ifndef STORAGE_EMULATION_GLSL
#define STORAGE_EMULATION_GLSL

precision highp usampler2D;

const uint PLUTO_DATA_TEXTURE_WIDTH = 2048u;

/**
 * データテクスチャから 16 バイト (uvec4) を読み取る。
 * @param tex データテクスチャ (usampler2D)
 * @param texelIndex 0 から始まる 16 バイト単位のテクセルインデックス
 * @return 読み取られた uvec4 データ
 */
uvec4 pluto_fetch(usampler2D tex, uint texelIndex) {
    int x = int(texelIndex % PLUTO_DATA_TEXTURE_WIDTH);
    int y = int(texelIndex / PLUTO_DATA_TEXTURE_WIDTH);
    return texelFetch(tex, ivec2(x, y), 0);
}

#endif
