# 現在のタスク: T-4.6 GPU 駆動描画パス

## 1. 概要

- **タスク ID**: T-4.6
- **タスク名**: GPU 駆動描画パス
- **参照仕様**:
  - `docs/07-renderer.md` §8 (描画パス A: GPU 駆動)
  - `docs/02-directory-structure.md` §17 (シェーダ・レンダラファイル定義)
  - `docs/12-roadmap.md` §Phase 4 (受け入れ条件: T-4.4 と同じシーンで GPU 駆動パスのゴールデン画像が CPU 補助パスと一致)

## 2. 実装計画

### 2.1 シェーダ

1. `src/shaders/cull/reset-args.wgsl`:
   - 間接描画引数 (Opaque / Alpha / Additive の 3 ビン × `drawIndirect` [vertexCount=6, instanceCount=0, firstVertex=0, firstInstance=0])
   - ソート用間接ディスパッチ引数 (`dispatchIndirect` [workgroupCountX=0, 1, 1])
   - をリセット (0 初期化) するコンピュートシェーダ。
2. `src/shaders/cull/sprite-cull.wgsl`:
   - `cs_cull`: `FLAG_VISIBLE` かつ外接円がカメラの AABB と交差するか判定し、`binFlags[i]: vec4<u32>` (x=Opaque, y=Alpha, z=Additive) に one-hot フラグを出力。
   - `cs_scatter`: プレフィックスサム後のオフセットに基づいて `visibleIndices[bin * capacity + offset] = slot` にスキャッタ配置。最後のスレッドが各ビンの `instanceCount` および Alpha ソート用 dispatch 引数を書き込み。
3. `src/shaders/cull/sort-keys.wgsl`:
   - Alpha ビンに対して `key = (layer << 20) | u32(sortKey * 1048576)`, `value = slot` を構築するコンピュートシェーダ。

### 2.2 レンダラパス実装

1. `src/render/sprite/sprite-path-gpu-driven.ts`:
   - `// @pluto-hot` マーカー、400 行以下、アロケーションゼロ。
   - `GpuPrefixSum` (vec4 または 各成分ごとのスキャン) および `GpuRadixSort` と連携。
   - Reset → Cull → PrefixSum → Scatter → Keys → RadixSort → Draw(Opaque, Alpha, Additive) のパイプラインをエンコード。
2. `src/render/sprite/sprite-renderer.ts`:
   - `caps.compute && caps.indirectDraw` が真の場合に `SpritePathGpuDriven` を使用するよう統合。

### 2.3 テストと検証

1. 単体テスト: `tests/unit/render/sprite/sprite-path-gpu-driven.test.ts`
   - モック RHI でのコマンドエンコードシーケンス検証
   - `caps.compute === false` または `caps.indirectDraw === false` の場合の例外検証
2. ブラウザテスト: `tests/browser/render/sprite-gpu-driven.spec.ts`
   - WebGPU で T-4.4 と同一の 64 スプライトシーンを描画し、CPU 補助パスとのゴールデン画像一致を検証。
   - WebGL2 では `caps.compute === false` による例外送出を検証。
3. `pnpm verify` (7 段階すべて成功)
4. `pnpm bench` (悪化 10% 以内)
