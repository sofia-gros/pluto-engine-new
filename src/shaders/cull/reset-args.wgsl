// @file indirect 引数リセットコンピュートシェーダ (docs/07-renderer.md §8, docs/02-directory-structure.md §17)
// 3 ビン分の drawIndirect 引数と Alpha ソート用の dispatchIndirect 引数を初期化する。

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

@group(0) @binding(0) var<storage, read_write> args: IndirectArgs;

@compute @workgroup_size(1, 1, 1)
fn cs_main() {
  // Opaque: 6 頂点, 0 インスタンス
  args.drawOpaque.vertexCount = 6u;
  args.drawOpaque.instanceCount = 0u;
  args.drawOpaque.firstVertex = 0u;
  args.drawOpaque.firstInstance = 0u;

  // Alpha: 6 頂点, 0 インスタンス
  args.drawAlpha.vertexCount = 6u;
  args.drawAlpha.instanceCount = 0u;
  args.drawAlpha.firstVertex = 0u;
  args.drawAlpha.firstInstance = 0u;

  // Additive: 6 頂点, 0 インスタンス
  args.drawAdditive.vertexCount = 6u;
  args.drawAdditive.instanceCount = 0u;
  args.drawAdditive.firstVertex = 0u;
  args.drawAdditive.firstInstance = 0u;

  // Alpha ソート用 dispatch: workgroupCountX は scatter 時に算出される
  args.dispatchSort.workgroupCountX = 0u;
  args.dispatchSort.workgroupCountY = 1u;
  args.dispatchSort.workgroupCountZ = 1u;
  args.dispatchSort.pad = 0u;
}
