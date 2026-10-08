// @file 排他的プレフィックスサムコンピュートシェーダ (docs/07-renderer.md §8, docs/02-directory-structure.md §17)
// 3 パス方式: ブロック内スキャン → ブロック和スキャン → ブロック和加算
// 最大 1,048,576 (2^20) 要素まで対応。

struct ScanParams {
  count: u32,
  numBlocks: u32,
  pad0: u32,
  pad1: u32,
};

@group(0) @binding(0) var<uniform> params: ScanParams;
@group(0) @binding(1) var<storage, read> inputData: array<u32>;
@group(0) @binding(2) var<storage, read_write> outputData: array<u32>;
@group(0) @binding(3) var<storage, read_write> blockSums: array<u32>;

var<workgroup> s_block: array<u32, 256>;

/**
 * 共有メモリ内の 256 要素の包含的プレフィックスサム (Hillis-Steele)。
 */
fn workgroup_inclusive_scan(local_id: u32) {
  var offset: u32 = 1u;
  while (offset < 256u) {
    var temp: u32 = 0u;
    if (local_id >= offset) {
      temp = s_block[local_id - offset];
    }
    workgroupBarrier();
    s_block[local_id] += temp;
    workgroupBarrier();
    offset = offset << 1u;
  }
}

/**
 * パス 1: ブロック内排他的プレフィックスサム + ブロック和の出力。
 * 各ワークグループ (256 スレッド) は 1024 要素を処理する。
 */
fn exec_block_scan(
  local_id: vec3<u32>,
  group_id: vec3<u32>
) {
  let lid = local_id.x;
  let gid = group_id.x;
  let base = gid * 1024u + lid * 4u;

  // 4 要素の読み込み
  var x0: u32 = 0u;
  var x1: u32 = 0u;
  var x2: u32 = 0u;
  var x3: u32 = 0u;
  if (base < params.count) { x0 = inputData[base]; }
  if (base + 1u < params.count) { x1 = inputData[base + 1u]; }
  if (base + 2u < params.count) { x2 = inputData[base + 2u]; }
  if (base + 3u < params.count) { x3 = inputData[base + 3u]; }

  // 4 要素の局所排他的スキャン
  let p0 = 0u;
  let p1 = x0;
  let p2 = x0 + x1;
  let p3 = x0 + x1 + x2;
  let thread_sum = p3 + x3;

  s_block[lid] = thread_sum;
  workgroupBarrier();

  workgroup_inclusive_scan(lid);

  // ブロック全体の和を blockSums に書き出す (スレッド 255 がブロック和を持つ)
  if (lid == 255u) {
    blockSums[gid] = s_block[255];
  }

  // スレッド単位のブロック内排他的オフセット
  var thread_offset: u32 = 0u;
  if (lid > 0u) {
    thread_offset = s_block[lid - 1u];
  }

  if (base < params.count) { outputData[base] = p0 + thread_offset; }
  if (base + 1u < params.count) { outputData[base + 1u] = p1 + thread_offset; }
  if (base + 2u < params.count) { outputData[base + 2u] = p2 + thread_offset; }
  if (base + 3u < params.count) { outputData[base + 3u] = p3 + thread_offset; }
}

/**
 * パス 2: ブロック和配列 (最大 1024 要素) の排他的プレフィックスサム。
 * 単一ワークグループ (256 スレッド) で実行する。
 */
fn exec_scan_block_sums(
  local_id: vec3<u32>
) {
  let lid = local_id.x;
  let base = lid * 4u;
  let n = params.numBlocks;

  var x0: u32 = 0u;
  var x1: u32 = 0u;
  var x2: u32 = 0u;
  var x3: u32 = 0u;
  if (base < n) { x0 = blockSums[base]; }
  if (base + 1u < n) { x1 = blockSums[base + 1u]; }
  if (base + 2u < n) { x2 = blockSums[base + 2u]; }
  if (base + 3u < n) { x3 = blockSums[base + 3u]; }

  let p0 = 0u;
  let p1 = x0;
  let p2 = x0 + x1;
  let p3 = x0 + x1 + x2;
  let thread_sum = p3 + x3;

  s_block[lid] = thread_sum;
  workgroupBarrier();

  workgroup_inclusive_scan(lid);

  var thread_offset: u32 = 0u;
  if (lid > 0u) {
    thread_offset = s_block[lid - 1u];
  }

  if (base < n) { blockSums[base] = p0 + thread_offset; }
  if (base + 1u < n) { blockSums[base + 1u] = p1 + thread_offset; }
  if (base + 2u < n) { blockSums[base + 2u] = p2 + thread_offset; }
  if (base + 3u < n) { blockSums[base + 3u] = p3 + thread_offset; }
}

/**
 * パス 3: 各ブロックの全要素にブロック和を加算する。
 */
fn exec_add_block_sums(
  local_id: vec3<u32>,
  group_id: vec3<u32>
) {
  let lid = local_id.x;
  let gid = group_id.x;
  let base = gid * 1024u + lid * 4u;
  let block_sum = blockSums[gid];

  if (base < params.count) { outputData[base] += block_sum; }
  if (base + 1u < params.count) { outputData[base + 1u] += block_sum; }
  if (base + 2u < params.count) { outputData[base + 2u] += block_sum; }
  if (base + 3u < params.count) { outputData[base + 3u] += block_sum; }
}

#ifdef ENTRY_BLOCK_SCAN
@compute @workgroup_size(256, 1, 1)
fn cs_main(
  @builtin(local_invocation_id) local_id: vec3<u32>,
  @builtin(workgroup_id) group_id: vec3<u32>
) {
  exec_block_scan(local_id, group_id);
}
#endif

#ifdef ENTRY_SCAN_BLOCK_SUMS
@compute @workgroup_size(256, 1, 1)
fn cs_main(
  @builtin(local_invocation_id) local_id: vec3<u32>
) {
  exec_scan_block_sums(local_id);
}
#endif

#ifdef ENTRY_ADD_BLOCK_SUMS
@compute @workgroup_size(256, 1, 1)
fn cs_main(
  @builtin(local_invocation_id) local_id: vec3<u32>,
  @builtin(workgroup_id) group_id: vec3<u32>
) {
  exec_add_block_sums(local_id, group_id);
}
#endif
