#version 300 es
precision highp float;
precision highp int;
precision highp sampler2DArray;

// スプライト描画 GLSL フラグメントシェーダ (docs/07-renderer.md §5, §7)

uniform sampler2DArray u_colorTexture;
uniform sampler2DArray u_compressedTexture;

in vec2 v_uv;
in vec4 v_tint;
flat in uint v_page;
flat in uint v_isCompressed;
flat in uint v_isOpaque;

out vec4 fragColor;

void main() {
    vec4 texColor;
    if (v_isCompressed != 0u) {
        texColor = textureLod(u_compressedTexture, vec3(v_uv, float(v_page)), 0.0);
    } else {
        texColor = textureLod(u_colorTexture, vec3(v_uv, float(v_page)), 0.0);
    }

    vec4 finalColor = texColor * v_tint;
    if (v_isOpaque != 0u && finalColor.a < 0.5) {
        discard;
    }
    if (finalColor.a <= 0.0) {
        discard;
    }

    fragColor = finalColor;
}
