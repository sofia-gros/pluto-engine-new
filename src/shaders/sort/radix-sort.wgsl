// @file 32bit キー/値 LSD 基数ソートコンピュートシェーダ (docs/07-renderer.md §8, docs/02-directory-structure.md §17)
// 4bit × 8 パス (16 バケット) による安定ソート。

struct SortParams {
  count: u32,
  numBlocks: u32,
  bitShift: u32, // 0, 4, 8, 12, 16, 20, 24, 28
  pad: u32,
};

@group(0) @binding(0) var<uniform> params: SortParams;
@group(0) @binding(1) var<storage, read> keysIn: array<u32>;
@group(0) @binding(2) var<storage, read> valuesIn: array<u32>;
@group(0) @binding(3) var<storage, read_write> keysOut: array<u32>;
@group(0) @binding(4) var<storage, read_write> valuesOut: array<u32>;
// globalHistograms: 16 * numBlocks 要素
// レイアウト: bucket * numBlocks + block_id (プレフィックスサムしやすい列優先配置)
@group(0) @binding(5) var<storage, read_write> globalHistograms: array<u32>;

// 共有メモリ: 16 バケットのブロック内度数
var<workgroup> s_hist: array<atomic<u32>, 16>;

/**
 * パス 1: ヒストグラム集計。
 * 各ブロック内で 16 バケットの度数をカウントし、globalHistograms に出力。
 */
fn exec_radix_histogram(
  local_id: vec3<u32>,
  group_id: vec3<u32>
) {
  let lid = local_id.x;
  let gid = group_id.x;

  // 16 バケットの初期化 (先頭 16 スレッドが担当)
  if (lid < 16u) {
    atomicStore(&s_hist[lid], 0u);
  }
  workgroupBarrier();

  let base = gid * 1024u + lid * 4u;
  let shift = params.bitShift;
  let count = params.count;

  // 4 要素のバケットをアトミック加算
  for (var i: u32 = 0u; i < 4u; i += 1u) {
    let idx = base + i;
    if (idx < count) {
      let bucket = (keysIn[idx] >> shift) & 0xfu;
      atomicAdd(&s_hist[bucket], 1u);
    }
  }
  workgroupBarrier();

  // globalHistograms に出力: bucket * numBlocks + gid
  if (lid < 16u) {
    let c = atomicLoad(&s_hist[lid]);
    globalHistograms[lid * params.numBlocks + gid] = c;
  }
}

// スキャッタ用の共有メモリ
var<workgroup> s_block_offsets: array<u32, 16>;
var<workgroup> s_local_sums: array<u32, 256>;

/**
 * パス 2: スキャッタ (安定再配置)。
 * 各要素を、グローバルオフセット + ローカル排他的オフセットの位置へ書き出す。
 */
fn exec_radix_scatter(
  local_id: vec3<u32>,
  group_id: vec3<u32>
) {
  let lid = local_id.x;
  let gid = group_id.x;
  let base = gid * 1024u + lid * 4u;
  let shift = params.bitShift;
  let count = params.count;
  let num_blocks = params.numBlocks;

  // 16 バケットのグローバル開始オフセットをロード
  if (lid < 16u) {
    s_block_offsets[lid] = globalHistograms[lid * num_blocks + gid];
  }
  workgroupBarrier();

  // 4 要素をレジスタに読み込み
  var k0: u32 = 0u; var v0: u32 = 0u; var b0: u32 = 0u;
  var k1: u32 = 0u; var v1: u32 = 0u; var b1: u32 = 0u;
  var k2: u32 = 0u; var v2: u32 = 0u; var b2: u32 = 0u;
  var k3: u32 = 0u; var v3: u32 = 0u; var b3: u32 = 0u;

  if (base < count) {
    k0 = keysIn[base]; v0 = valuesIn[base]; b0 = (k0 >> shift) & 0xfu;
  }
  if (base + 1u < count) {
    k1 = keysIn[base + 1u]; v1 = valuesIn[base + 1u]; b1 = (k1 >> shift) & 0xfu;
  }
  if (base + 2u < count) {
    k2 = keysIn[base + 2u]; v2 = valuesIn[base + 2u]; b2 = (k2 >> shift) & 0xfu;
  }
  if (base + 3u < count) {
    k3 = keysIn[base + 3u]; v3 = valuesIn[base + 3u]; b3 = (k3 >> shift) & 0xfu;
  }

  // 各バケットごとに、ブロック内での各要素の排他的プレフィックスサムを計算
  for (var bucket: u32 = 0u; bucket < 16u; bucket += 1u) {
    let m0 = select(0u, 1u, base < count && b0 == bucket);
    let m1 = select(0u, 1u, base + 1u < count && b1 == bucket);
    let m2 = select(0u, 1u, base + 2u < count && b2 == bucket);
    let m3 = select(0u, 1u, base + 3u < count && b3 == bucket);

    let p0 = 0u;
    let p1 = m0;
    let p2 = m0 + m1;
    let p3 = m0 + m1 + m2;
    let thread_sum = p3 + m3;

    s_local_sums[lid] = thread_sum;
    workgroupBarrier();

    // 256 要素の包含的スキャン
    var offset: u32 = 1u;
    while (offset < 256u) {
      var temp: u32 = 0u;
      if (lid >= offset) {
        temp = s_local_sums[lid - offset];
      }
      workgroupBarrier();
      s_local_sums[lid] += temp;
      workgroupBarrier();
      offset = offset << 1u;
    }

    var thread_offset: u32 = 0u;
    if (lid > 0u) {
      thread_offset = s_local_sums[lid - 1u];
    }
    let global_start = s_block_offsets[bucket];

    if (base < count && b0 == bucket) {
      let dst = global_start + thread_offset + p0;
      keysOut[dst] = k0; valuesOut[dst] = v0;
    }
    if (base + 1u < count && b1 == bucket) {
      let dst = global_start + thread_offset + p1;
      keysOut[dst] = k1; valuesOut[dst] = v1;
    }
    if (base + 2u < count && b2 == bucket) {
      let dst = global_start + thread_offset + p2;
      keysOut[dst] = k2; valuesOut[dst] = v2;
    }
    if (base + 3u < count && b3 == bucket) {
      let dst = global_start + thread_offset + p3;
      keysOut[dst] = k3; valuesOut[dst] = v3;
    }
    workgroupBarrier();
  }
}

#ifdef ENTRY_HISTOGRAM
@compute @workgroup_size(256, 1, 1)
fn cs_main(
  @builtin(local_invocation_id) local_id: vec3<u32>,
  @builtin(workgroup_id) group_id: vec3<u32>
) {
  exec_radix_histogram(local_id, group_id);
}
#endif

#ifdef ENTRY_SCATTER
@compute @workgroup_size(256, 1, 1)
fn cs_main(
  @builtin(local_invocation_id) local_id: vec3<u32>,
  @builtin(workgroup_id) group_id: vec3<u32>
) {
  exec_radix_scatter(local_id, group_id);
}
#endif
