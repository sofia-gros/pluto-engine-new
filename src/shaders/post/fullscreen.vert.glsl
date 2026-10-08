#version 300 es
precision highp float;

// フルスクリーン三角形頂点シェーダ (docs/07-renderer.md §12)

out vec2 v_uv;

void main() {
  vec2 pos[3] = vec2[3](
    vec2(-1.0, -3.0),
    vec2( 3.0,  1.0),
    vec2(-1.0,  1.0)
  );
  vec2 uvs[3] = vec2[3](
    vec2(0.0, 2.0),
    vec2(2.0, 0.0),
    vec2(0.0, 0.0)
  );

  gl_Position = vec4(pos[gl_VertexID], 0.0, 1.0);
  v_uv = uvs[gl_VertexID];
}
