// @file 半透明スプライトのソートキー生成コンピュートシェーダ (docs/07-renderer.md §8, docs/02-directory-structure.md §17)
// Alpha ビンの可視スプライトから 32bit ソートキー (layer: 12bit, sortKey: 20bit) とスロット値を生成する。

#include <common/constants>
#include <common/sprite-instance>

struct SortKeysParams {
  capacity: u32,
  pad0: u32,
  pad1: u32,
  pad2: u32,
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

@group(0) @binding(0) var<uniform> params: SortKeysParams;
@group(0) @binding(1) var<storage, read> indirectArgs: IndirectArgs;
@group(0) @binding(2) var<storage, read> visibleIndices: array<u32>;
@group(0) @binding(3) var<storage, read> sprites: array<SpriteInstance>;
@group(0) @binding(4) var<storage, read_write> sortKeysOut: array<u32>;
@group(0) @binding(5) var<storage, read_write> sortValuesOut: array<u32>;

@compute @workgroup_size(256, 1, 1)
fn cs_main(@builtin(global_invocation_id) global_id: vec3<u32>) {
  let idx = global_id.x;
  let count = indirectArgs.drawAlpha.instanceCount;
  if (idx >= count) {
    return;
  }

  let slot = visibleIndices[params.capacity + idx];
  let sprite = sprites[slot];

  let layer = spriteGetLayer(sprite);
  let clampedSortKey = clamp(sprite.sortKey, 0.0, 1.0);
  let sortKeyFrac = u32(clampedSortKey * 1048575.0);
  let key = (layer << 20u) | (sortKeyFrac & 0xfffffu);

  sortKeysOut[idx] = key;
  sortValuesOut[idx] = slot;
}
