// スプライト描画 WGSL (vertex pulling, docs/07-renderer.md §7, §9)

#include "common/constants.wgsl"
#include "common/camera.wgsl"
#include "common/sprite-instance.wgsl"
#include "common/frame.wgsl"

@group(0) @binding(0) var<uniform> camera: CameraUniform;
@group(0) @binding(1) var<storage, read> instances: array<SpriteInstance>;
@group(0) @binding(2) var<storage, read> frames: array<FrameData>;
@group(0) @binding(3) var<storage, read> visibleIndices: array<u32>;
@group(0) @binding(4) var colorTexture: texture_2d_array<f32>;
@group(0) @binding(5) var compressedTexture: texture_2d_array<f32>;
@group(0) @binding(6) var colorSampler: sampler;

struct VertexOutput {
  @builtin(position) position: vec4<f32>,
  @location(0) uv: vec2<f32>,
  @location(1) tint: vec4<f32>,
  @location(2) @interpolate(flat) page: u32,
  @location(3) @interpolate(flat) isCompressed: u32,
  @location(4) @interpolate(flat) isOpaque: u32,
};

@vertex
fn vs_main(
  @builtin(vertex_index) vertexIndex: u32,
  @builtin(instance_index) instanceIndex: u32,
) -> VertexOutput {
  var output: VertexOutput;

  let CORNERS = array<vec2<f32>, 6>(
    vec2<f32>(0.0, 0.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(0.0, 1.0),
    vec2<f32>(1.0, 0.0),
    vec2<f32>(1.0, 1.0),
  );

  let slot = visibleIndices[instanceIndex];
  let inst = instances[slot];

  let pos = spriteGetPos(inst);
  let scale = spriteGetScale(inst);
  let rotation = spriteGetRotation(inst);
  let layer = spriteGetLayer(inst);
  let tint = spriteGetTint(inst);
  let flags = inst.flags;
  let sortKey = inst.sortKey;

  let frame = frames[inst.frameId];
  let uvMin = frameGetUvMin(frame);
  let uvMax = frameGetUvMax(frame);
  let size = frameGetSize(frame);
  let anchor = frameGetAnchor(frame);
  let page = frameGetPage(frame);
  let isCompressed = frameIsCompressed(frame);

  let corner = CORNERS[vertexIndex];

  let flipX = (flags & FLAG_FLIP_X) != 0u;
  let flipY = (flags & FLAG_FLIP_Y) != 0u;
  let flipCorner = vec2<f32>(
    select(corner.x, 1.0 - corner.x, flipX),
    select(corner.y, 1.0 - corner.y, flipY),
  );

  let local = (corner - anchor) * (size * scale);
  let cosR = cos(rotation);
  let sinR = sin(rotation);
  let world = pos + vec2<f32>(
    local.x * cosR - local.y * sinR,
    local.x * sinR + local.y * cosR,
  );

  let clipX = camera.viewProjAffine.x * world.x + camera.viewProjAffine.z * world.y + camera.viewProjTranslation.x;
  let clipY = camera.viewProjAffine.y * world.x + camera.viewProjAffine.w * world.y + camera.viewProjTranslation.y;

  let depth = 1.0 - (f32(layer) + sortKey) / f32(MAX_LAYERS);

  output.position = vec4<f32>(clipX, clipY, depth, 1.0);
  output.uv = mix(uvMin, uvMax, flipCorner);
  output.tint = tint;
  output.page = page;
  output.isCompressed = select(0u, 1u, isCompressed);
  output.isOpaque = select(0u, 1u, spriteIsOpaque(inst));

  return output;
}

@fragment
fn fs_main(input: VertexOutput) -> @location(0) vec4<f32> {
  var texColor: vec4<f32>;
  if (input.isCompressed != 0u) {
    texColor = textureSampleLevel(compressedTexture, colorSampler, input.uv, input.page, 0.0);
  } else {
    texColor = textureSampleLevel(colorTexture, colorSampler, input.uv, input.page, 0.0);
  }

  let finalColor = texColor * input.tint;
  if (input.isOpaque != 0u && finalColor.a < 0.5) {
    discard;
  }
  if (finalColor.a <= 0.0) {
    discard;
  }
  return finalColor;
}
