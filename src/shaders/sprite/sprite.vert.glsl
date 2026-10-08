#version 300 es
precision highp float;
precision highp int;
precision highp usampler2D;
precision highp sampler2D;
precision highp sampler2DArray;

// スプライト描画 GLSL 頂点シェーダ (vertex pulling, docs/07-renderer.md §7, §9)

#include "common/constants.glsl"
#include "common/camera.glsl"
#include "common/storage-emulation.glsl"
#include "common/sprite-instance.glsl"
#include "common/frame.glsl"

layout(std140) uniform CameraBlock {
    CameraUniform u_camera;
};

uniform usampler2D u_instanceTexture;
uniform usampler2D u_frameTexture;
uniform usampler2D u_visibleIndicesTexture;

out vec2 v_uv;
out vec4 v_tint;
flat out uint v_page;
flat out uint v_isCompressed;

void main() {
    vec2 CORNERS[6] = vec2[6](
        vec2(0.0, 0.0),
        vec2(1.0, 0.0),
        vec2(0.0, 1.0),
        vec2(0.0, 1.0),
        vec2(1.0, 0.0),
        vec2(1.0, 1.0)
    );

    // 可視インデックスの取得 (1 texel = 4 個の u32 slot)
    uint instIdx = uint(gl_InstanceID);
    uint texelIdx = instIdx / 4u;
    uint compIdx = instIdx % 4u;
    uvec4 indicesTexel = pluto_fetch(u_visibleIndicesTexture, texelIdx);
    uint slot = (compIdx == 0u) ? indicesTexel.x :
                (compIdx == 1u) ? indicesTexel.y :
                (compIdx == 2u) ? indicesTexel.z : indicesTexel.w;

    // スプライトインスタンスの取得 (1 インスタンス = 2 texels)
    uvec4 instTexel0 = pluto_fetch(u_instanceTexture, slot * 2u);
    uvec4 instTexel1 = pluto_fetch(u_instanceTexture, slot * 2u + 1u);
    SpriteInstance inst = decodeSprite(instTexel0, instTexel1);

    // フレームデータの取得 (1 フレーム = 2 texels)
    uvec4 frameTexel0 = pluto_fetch(u_frameTexture, inst.frameId * 2u);
    uvec4 frameTexel1 = pluto_fetch(u_frameTexture, inst.frameId * 2u + 1u);
    FrameData frame = decodeFrame(frameTexel0, frameTexel1);

    vec2 corner = CORNERS[gl_VertexID];

    bool flipX = spriteIsFlipX(inst.flags);
    bool flipY = spriteIsFlipY(inst.flags);
    vec2 flipCorner = vec2(
        flipX ? (1.0 - corner.x) : corner.x,
        flipY ? (1.0 - corner.y) : corner.y
    );

    vec2 local = (corner - frame.anchor) * (frame.size * inst.scale);
    float cosR = cos(inst.rotation);
    float sinR = sin(inst.rotation);
    vec2 world = inst.pos + vec2(
        local.x * cosR - local.y * sinR,
        local.x * sinR + local.y * cosR
    );

    float clipX = u_camera.viewProjAffine.x * world.x + u_camera.viewProjAffine.z * world.y + u_camera.viewProjTranslation.x;
    float clipY = u_camera.viewProjAffine.y * world.x + u_camera.viewProjAffine.w * world.y + u_camera.viewProjTranslation.y;

    float depth = 1.0 - (float(inst.layer) + inst.sortKey) / float(MAX_LAYERS);

    gl_Position = vec4(clipX, clipY, depth, 1.0);
    v_uv = mix(frame.uvMin, frame.uvMax, flipCorner);
    v_tint = inst.tint;
    v_page = frame.page;
    v_isCompressed = frame.isCompressed ? 1u : 0u;
}
