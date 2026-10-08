#version 300 es
precision highp float;

// テクスチャコピーフラグメントシェーダ (docs/07-renderer.md §12)

in vec2 v_uv;
out vec4 fragColor;

uniform sampler2D u_srcTexture;

void main() {
  fragColor = texture(u_srcTexture, v_uv);
}
