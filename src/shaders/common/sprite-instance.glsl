// スプライト 32 バイトインスタンス構造体とデコード (docs/07-renderer.md §3)

#ifndef SPRITE_INSTANCE_GLSL
#define SPRITE_INSTANCE_GLSL

const uint FLAG_VISIBLE = 1u;
const uint FLAG_FLIP_X = 2u;
const uint FLAG_FLIP_Y = 4u;
const uint FLAG_OPAQUE = 8u;
const uint FLAG_ADDITIVE = 16u;
const uint FLAG_OCCLUDER = 32u;

struct SpriteInstance {
    vec2 pos;
    vec2 scale;
    float rotation;
    uint layer;
    uint frameId;
    vec4 tint;
    uint flags;
    float sortKey;
};

/**
 * データテクスチャの連続する 2 つの uvec4 (32 バイト) から SpriteInstance をデコードする。
 */
SpriteInstance decodeSprite(uvec4 texel0, uvec4 texel1) {
    SpriteInstance s;
    s.pos = vec2(uintBitsToFloat(texel0.x), uintBitsToFloat(texel0.y));
    s.scale = unpackHalf2x16(texel0.z);
    s.rotation = unpackHalf2x16(texel0.w).x;
    s.layer = texel0.w >> 16u;
    s.frameId = texel1.x;
    uint tintBits = texel1.y;
    s.tint = vec4(
        float(tintBits & 0xffu) / 255.0,
        float((tintBits >> 8u) & 0xffu) / 255.0,
        float((tintBits >> 16u) & 0xffu) / 255.0,
        float((tintBits >> 24u) & 0xffu) / 255.0
    );
    s.flags = texel1.z;
    s.sortKey = uintBitsToFloat(texel1.w);
    return s;
}

bool spriteIsVisible(uint flags) {
    return (flags & FLAG_VISIBLE) != 0u;
}

bool spriteIsFlipX(uint flags) {
    return (flags & FLAG_FLIP_X) != 0u;
}

bool spriteIsFlipY(uint flags) {
    return (flags & FLAG_FLIP_Y) != 0u;
}

bool spriteIsOpaque(uint flags) {
    return (flags & FLAG_OPAQUE) != 0u;
}

bool spriteIsAdditive(uint flags) {
    return (flags & FLAG_ADDITIVE) != 0u;
}

bool spriteIsOccluder(uint flags) {
    return (flags & FLAG_OCCLUDER) != 0u;
}

#endif
