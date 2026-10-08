// スプライト 32 バイトインスタンス構造体とデコード (docs/07-renderer.md §3)

#ifndef SPRITE_INSTANCE_WGSL
#define SPRITE_INSTANCE_WGSL

const FLAG_VISIBLE: u32 = 1u;
const FLAG_FLIP_X: u32 = 2u;
const FLAG_FLIP_Y: u32 = 4u;
const FLAG_OPAQUE: u32 = 8u;
const FLAG_ADDITIVE: u32 = 16u;
const FLAG_OCCLUDER: u32 = 32u;

struct SpriteInstance {
    posX: f32,
    posY: f32,
    scale: u32,
    rotLayer: u32,
    frameId: u32,
    tint: u32,
    flags: u32,
    sortKey: f32,
};

fn spriteGetPos(s: SpriteInstance) -> vec2<f32> {
    return vec2<f32>(s.posX, s.posY);
}

fn spriteGetScale(s: SpriteInstance) -> vec2<f32> {
    return unpack2x16float(s.scale);
}

fn spriteGetRotation(s: SpriteInstance) -> f32 {
    return unpack2x16float(s.rotLayer).x;
}

fn spriteGetLayer(s: SpriteInstance) -> u32 {
    return s.rotLayer >> 16u;
}

fn spriteGetTint(s: SpriteInstance) -> vec4<f32> {
    return unpack4x8unorm(s.tint);
}

fn spriteIsVisible(s: SpriteInstance) -> bool {
    return (s.flags & FLAG_VISIBLE) != 0u;
}

fn spriteIsFlipX(s: SpriteInstance) -> bool {
    return (s.flags & FLAG_FLIP_X) != 0u;
}

fn spriteIsFlipY(s: SpriteInstance) -> bool {
    return (s.flags & FLAG_FLIP_Y) != 0u;
}

fn spriteIsOpaque(s: SpriteInstance) -> bool {
    return (s.flags & FLAG_OPAQUE) != 0u;
}

fn spriteIsAdditive(s: SpriteInstance) -> bool {
    return (s.flags & FLAG_ADDITIVE) != 0u;
}

fn spriteIsOccluder(s: SpriteInstance) -> bool {
    return (s.flags & FLAG_OCCLUDER) != 0u;
}

#endif
