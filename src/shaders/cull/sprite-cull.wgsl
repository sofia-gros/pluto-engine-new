// @file スプライトの視錐台カリングとビン振り分けコンピュートシェーダ (docs/07-renderer.md §8, docs/02-directory-structure.md §17)
// Cull パス: 外接円交差判定と one-hot ビンフラグ出力
// Scatter パス: プレフィックスサム後のオフセットに基づいて可視インデックスを出力し、間接引数を設定

#include <common/constants>
#include <common/camera>
#include <common/sprite-instance>
#include <common/frame>

struct CullParams {
  highWater: u32,
  capacity: u32,
  pad0: u32,
  pad1: u32,
};

struct DrawIndirectArgs {
  vertexCount: u32,
  instanceCount: u32,
  firstVertex: u32,
  firstInstance: u32,
};

struct DispatchIndirectArgs {
  workgroupCountX: u32,
  workgroupCountY: u32,
  workgroupCountZ: u32,
  pad: u32,
};

struct IndirectArgs {
  drawOpaque: DrawIndirectArgs,
  drawAlpha: DrawIndirectArgs,
  drawAdditive: DrawIndirectArgs,
  dispatchSort: DispatchIndirectArgs,
};

@group(0) @binding(0) var<uniform> params: CullParams;
@group(0) @binding(1) var<uniform> camera: CameraUniform;
@group(0) @binding(2) var<storage, read> sprites: array<SpriteInstance>;
@group(0) @binding(3) var<storage, read> frames: array<FrameData>;
@group(0) @binding(4) var<storage, read_write> binFlags: array<vec4<u32>>;
@group(0) @binding(5) var<storage, read> scannedOffsets: array<vec4<u32>>;
@group(0) @binding(6) var<storage, read_write> visibleIndices: array<u32>;
@group(0) @binding(7) var<storage, read_write> indirectArgs: IndirectArgs;

fn exec_cull(global_id: vec3<u32>) {
  let idx = global_id.x;
  if (idx >= params.highWater) {
    if (idx < params.capacity) {
      binFlags[idx] = vec4<u32>(0u, 0u, 0u, 0u);
    }
    return;
  }

  let sprite = sprites[idx];
  if (!spriteIsVisible(sprite)) {
    binFlags[idx] = vec4<u32>(0u, 0u, 0u, 0u);
    return;
  }

  let frame = frames[sprite.frameId];
  let size = frameGetSize(frame);
  let scale = abs(spriteGetScale(sprite));
  let radius = length(size * scale);
  let pos = spriteGetPos(sprite);

  let minX = camera.cullRect.x;
  let minY = camera.cullRect.y;
  let maxX = camera.cullRect.z;
  let maxY = camera.cullRect.w;

  let closestX = clamp(pos.x, minX, maxX);
  let closestY = clamp(pos.y, minY, maxY);
  let dx = pos.x - closestX;
  let dy = pos.y - closestY;
  let isIntersecting = (dx * dx + dy * dy) <= (radius * radius);

  if (!isIntersecting) {
    binFlags[idx] = vec4<u32>(0u, 0u, 0u, 0u);
    return;
  }

  if (spriteIsOpaque(sprite)) {
    binFlags[idx] = vec4<u32>(1u, 0u, 0u, 0u);
  } else if (spriteIsAdditive(sprite)) {
    binFlags[idx] = vec4<u32>(0u, 0u, 1u, 0u);
  } else {
    // Alpha
    binFlags[idx] = vec4<u32>(0u, 1u, 0u, 0u);
  }
}

fn exec_scatter(global_id: vec3<u32>) {
  let idx = global_id.x;
  let highWater = params.highWater;
  if (idx >= highWater) {
    return;
  }

  let flags = binFlags[idx];
  let offsets = scannedOffsets[idx];
  let cap = params.capacity;

  if (flags.x != 0u) {
    // Opaque ビン
    visibleIndices[offsets.x] = idx;
  }
  if (flags.y != 0u) {
    // Alpha ビン: cap からのオフセット
    visibleIndices[cap + offsets.y] = idx;
  }
  if (flags.z != 0u) {
    // Additive ビン: cap * 2 からのオフセット
    visibleIndices[cap * 2u + offsets.z] = idx;
  }

  // 最後のスレッドが総インスタンス数とディスパッチ引数を indirectArgs に書き出す
  if (idx == highWater - 1u) {
    let totalOpaque = offsets.x + flags.x;
    let totalAlpha = offsets.y + flags.y;
    let totalAdditive = offsets.z + flags.z;

    indirectArgs.drawOpaque.instanceCount = totalOpaque;
    indirectArgs.drawAlpha.instanceCount = totalAlpha;
    indirectArgs.drawAdditive.instanceCount = totalAdditive;

    // Alpha ソート用のワークグループ数 (1 ワークグループあたり 1024 要素)
    let sortBlocks = (totalAlpha + 1023u) / 1024u;
    indirectArgs.dispatchSort.workgroupCountX = sortBlocks;
    indirectArgs.dispatchSort.workgroupCountY = 1u;
    indirectArgs.dispatchSort.workgroupCountZ = 1u;
  }
}

#ifdef ENTRY_CULL
@compute @workgroup_size(256, 1, 1)
fn cs_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  exec_cull(global_id);
}
#endif

#ifdef ENTRY_SCATTER
@compute @workgroup_size(256, 1, 1)
fn cs_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  exec_scatter(global_id);
}
#endif
