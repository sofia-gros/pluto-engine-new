// フレームテーブル構造体 (docs/07-renderer.md §4)
// 32 バイト / フレーム

#ifndef FRAME_GLSL
#define FRAME_GLSL

struct FrameData {
    vec2 uvMin;
    vec2 uvMax;
    vec2 size;
    vec2 anchor;
    uint page;
    bool isCompressed;
};

/**
 * データテクスチャの連続する 2 つの uvec4 (32 バイト) から FrameData をデコードする。
 */
FrameData decodeFrame(uvec4 texel0, uvec4 texel1) {
    FrameData f;
    f.uvMin = vec2(uintBitsToFloat(texel0.x), uintBitsToFloat(texel0.y));
    f.uvMax = vec2(uintBitsToFloat(texel0.z), uintBitsToFloat(texel0.w));
    f.size = unpackHalf2x16(texel1.x);
    f.anchor = unpackHalf2x16(texel1.y);
    f.page = texel1.z & 0xffffu;
    f.isCompressed = (texel1.z & 0x10000u) != 0u;
    return f;
}

#endif // FRAME_GLSL
