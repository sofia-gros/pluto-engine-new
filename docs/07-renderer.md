# 07. レンダラ仕様

## 1. 座標系と単位

- **ワールド座標は y 下向き** (画面と同じ)。原点はワールド原点。単位はピクセル (ズーム 1 で 1 ワールド単位 = 1 CSS ピクセル × devicePixelRatio は考慮しない。DPR は `GameConfig.resolution` で扱う)。
- 回転はラジアン、**画面上で時計回りが正** (y 下向き座標系での数学的正方向)。
- `layer` は 0〜`MAX_LAYERS - 1` の整数。**大きいほど手前**。同一 layer 内は `sortKey` (0.0〜1.0 未満, 大きいほど手前) で並ぶ。

## 2. 定数 (`src/render/render-constants.ts` と `src/shaders/common/constants.*` で一致させる)

| 定数 | 値 | 意味 |
|------|-----|------|
| `WORKGROUP_SIZE` | 256 | コンピュートの 1D ワークグループサイズ |
| `SPRITE_STRIDE_BYTES` | 32 | スプライト 1 個のバイト数 |
| `SPRITE_STRIDE_WORDS` | 8 | 同 u32 個数 |
| `DEFAULT_MAX_SPRITES` | 1,048,576 | `GameConfig.maxSprites` の既定値 (上限 4,194,304) |
| `MAX_LAYERS` | 1024 | layer の上限 (排他) |
| `ATLAS_PAGE_SIZE` | 2048 | テクスチャ配列 1 層の幅・高さ (px) |
| `MAX_ATLAS_PAGES` | 64 | テクスチャ配列の最大層数 (`caps.maxTextureArrayLayers` と小さい方) |
| `MAX_FRAMES` | 65,536 | フレームテーブルの最大要素数 |
| `FRAME_STRIDE_BYTES` | 32 | フレーム 1 個のバイト数 |
| `DATA_TEXTURE_WIDTH` | 2048 | WebGL2 データテクスチャの幅 (texel) |
| `GPU_GROUP_ALIGN` | 1024 | GPU Tier グループのスロット範囲の整列単位 (= データテクスチャ 1 行) |
| `MAX_CAMERAS` | 8 | 同時カメラ数 |
| `BIN_COUNT` | 3 | 描画ビン数 (Opaque / Alpha / Additive) |

## 3. スプライトインスタンス (32 バイト, `sprite-instance-layout.ts` が SSOT)

| word | byte | 型 | 名前 | 内容 |
|------|------|----|------|------|
| 0 | 0 | f32 | `posX` | ワールド X |
| 1 | 4 | f32 | `posY` | ワールド Y |
| 2 | 8 | f16×2 | `scale` | 下位 16bit = scaleX, 上位 = scaleY (負値でフリップしない。フリップは flags) |
| 3 | 12 | f16 + u16 | `rotLayer` | 下位 16bit = rotation (f16, ラジアン), 上位 16bit = layer |
| 4 | 16 | u32 | `frameId` | フレームテーブルの index |
| 5 | 20 | u32 | `tint` | RGBA8 (byte0=R, byte1=G, byte2=B, byte3=A) |
| 6 | 24 | u32 | `flags` | 下表 |
| 7 | 28 | f32 | `sortKey` | 同一 layer 内の前後 (0.0〜1.0 未満) |

`flags`:

| bit | 名前 | 内容 |
|-----|------|------|
| 0 | `FLAG_VISIBLE` | 0 なら描画しない (空きスロットは必ず 0) |
| 1 | `FLAG_FLIP_X` | 左右反転 |
| 2 | `FLAG_FLIP_Y` | 上下反転 |
| 3 | `FLAG_OPAQUE` | 不透明 (アルファテスト `a < 0.5` で discard、深度書込あり) |
| 4 | `FLAG_ADDITIVE` | 加算合成 (OPAQUE と同時指定不可。OPAQUE 優先) |
| 5–31 | 予約 | 0 |

ビン決定: `OPAQUE` → Opaque(0)、`ADDITIVE` → Additive(2)、それ以外 → Alpha(1)。

`sprite-instance-layout.ts` が公開するもの (名前固定):
```ts
export const SPRITE_WORD_POS_X = 0; /* ... */ export const SPRITE_WORD_SORT_KEY = 7;
export const FLAG_VISIBLE = 1; export const FLAG_FLIP_X = 2; export const FLAG_FLIP_Y = 4; export const FLAG_OPAQUE = 8; export const FLAG_ADDITIVE = 16;
export function packSprite(dstU32: Uint32Array, dstF32: Float32Array, slot: number, posX: number, posY: number, scaleX: number, scaleY: number, rotation: number, layer: number, frameId: number, tint: number, flags: number, sortKey: number): void;
```

## 4. フレームテーブル (32 バイト / フレーム)

| byte | 型 | 内容 |
|------|----|------|
| 0 | f32×4 | `uvMinX, uvMinY, uvMaxX, uvMaxY` (0〜1) |
| 16 | f16×2 | `width, height` (px) |
| 20 | f16×2 | `anchorX, anchorY` (0〜1, 既定 0.5) |
| 24 | u32 | `page` (テクスチャ配列の層) |
| 28 | u32 | 予約 (0) |

フレームの追加は `frame-table.ts` の `addFrame()` (コールドパス)。変更分だけ GPU 転送。

## 5. テクスチャ

- スプライト用テクスチャは **1 枚の 2D テクスチャ配列** (`ATLAS_PAGE_SIZE`² × ページ数, RGBA8Unorm) に集約。
- アトラス画像 (TexturePacker) は 1 ページに収まる場合そのままコピー、収まらない場合は `PlutoError(InvalidArgument)`。
- 個別画像は `atlas-packer.ts` (shelf 法, 2px パディング + エッジ複製) でページに詰める。
- サンプラ: 既定 `Linear` + `ClampToEdge`。`GameConfig.pixelArt: true` で `Nearest`。
- ミップマップは v1 では生成しない。

## 6. カメラ uniform (64 バイト, std140)

| byte | 型 | 内容 |
|------|----|------|
| 0 | vec4 | ワールド→クリップ アフィン `(a, b, c, d)` |
| 16 | vec4 | `(tx, ty, 0, 0)` |
| 32 | vec4 | カリング用ワールド矩形 `(minX, minY, maxX, maxY)` (回転時は外接矩形) |
| 48 | vec4 | `(screenW, screenH, 1/screenW, 1/screenH)` |

## 7. 頂点シェーダの計算 (両バックエンド共通の仕様)

```
corner = CORNERS[vertex_index]  // 6 頂点: (0,0),(1,0),(0,1),(0,1),(1,0),(1,1)
local  = (corner - anchor) * vec2(width * scaleX, height * scaleY)
world  = pos + rotate(local, rotation)
clip   = camera * world
uv     = mix(uvMin, uvMax, flip(corner))
depth  = 1.0 - (f32(layer) + sortKey) / MAX_LAYERS     // Opaque ビンのみ深度書込
```

## 8. 描画パス A: GPU 駆動 (`caps.compute === true`, `sprite-path-gpu-driven.ts`)

カメラごとに以下を実行。処理対象は `0 〜 spriteBuffer.highWater - 1` のスロット。

| # | パス | シェーダ | 内容 |
|---|------|----------|------|
| 1 | Reset | `cull/reset-args.wgsl` | indirect 引数 (3 ビン × draw args + sort 用 dispatch args) を 0 に |
| 2 | Cull | `cull/sprite-cull.wgsl` `cs_cull` | `FLAG_VISIBLE` かつ外接円 (中心 = `pos`, 半径 = `length(vec2(width * scaleX, height * scaleY))`。アンカー位置に依らず必ず包含する保守的な値) がカメラ矩形と交差 → `binFlags[i]: vec4<u32>` に one-hot (x=Opaque, y=Alpha, z=Additive) |
| 3 | Scan | `scan/prefix-sum.wgsl` | `binFlags` の排他的プレフィックスサム (vec4<u32> 単位、3 パス: ブロック内 scan → ブロック和 scan → 加算) |
| 4 | Scatter | `cull/sprite-cull.wgsl` `cs_scatter` | `visible[bin * capacity + offset] = i`。最後のスレッドが各ビンの `instanceCount` と Alpha ソート用 dispatch 数を書く |
| 5 | Keys | `cull/sort-keys.wgsl` | Alpha ビン: `key = (layer << 20) \| u32(sortKey * 1048576)`, `value = slot` (indirect dispatch) |
| 6 | Sort | `sort/radix-sort.wgsl` | Alpha ビンを key 昇順に **安定** ソート (4bit × 8 パス, indirect) |
| 7 | Draw Opaque | `sprite/sprite.wgsl` | 深度テスト `Less` + 書込, ブレンドなし, `drawIndirect` |
| 8 | Draw Alpha | 同上 | 深度テスト `Less` + 書込なし, `PremultipliedAlpha`, ソート済み index |
| 9 | Draw Additive | 同上 | 深度テスト `Less` + 書込なし, `Additive` (順序非依存なのでソート不要) |

- プレフィックスサムによる圧縮は **スロット順を保つ** ため、描画結果は決定的になる (atomic append は順序が不定になるので禁止)。
- すべてのバッファ・バインドグループは初期化時 (と `maxSprites` 変更時) に作成する。

## 9. 描画パス B: CPU 補助 (`caps.compute === false`, `sprite-path-cpu-assisted.ts`)

| # | 処理 | 内容 |
|---|------|------|
| 1 | CPU カリング | `sprite-cpu-cull-kernel.ts` を CPU Tier のスプライトに実行 (jobs で並列)。結果はビンごとの slot 配列 (事前確保 `Uint32Array`) |
| 2 | CPU ソート | Alpha ビンを LSD 基数ソート (8bit × 4 パス, 事前確保バッファ, キーは §8 と同じ) |
| 3 | 転送 | 可視 index 列をデータテクスチャ (RGBA32UI) に `writeTexture` (可視数分のみ) |
| 4 | 描画 | Opaque → GPU Tier グループ → Alpha → Additive の順に `draw(6, count)` |

- GPU Tier グループ (パーティクル・群衆) は CPU からは位置が見えないため **カリングしない**。グループ単位でスロット範囲を直接描画する (`firstInstance` 相当は uniform で渡す)。
- WebGL2 の制約: GPU Tier グループと CPU Tier の Alpha スプライトは layer で相互に並ばない (グループはグループ同士で layer 順)。この制約は API ドキュメントに明記する。

## 10. スプライトバッファ (`sprite-buffer.ts`)

- GPU: `maxSprites × 32` バイトの Storage バッファ (WebGL2: データテクスチャ `DATA_TEXTURE_WIDTH × ceil(maxSprites*2/DATA_TEXTURE_WIDTH)`)。
- CPU: 同サイズのステージング (`Uint32Array` と同じバッファを共有する `Float32Array`)。CPU Tier のスロットのみ使う。
- スロット割当: `RangeAllocator`。CPU Tier は 1 個ずつ、GPU Tier グループは `GPU_GROUP_ALIGN` 整列の連続範囲。
- `highWater` = 使用中最大スロット + 1。
- dirty 管理: 64 スロット単位の `Bitset`。`flushToGpu()` で連続ブロックを結合して `writeBuffer` (最大 `MAX_UPLOAD_RANGES_PER_FRAME = 256` 回、超えたら最小〜最大を 1 回で転送)。
- 解放時は `flags = 0` を書き dirty にする。

## 11. CPU Tier のパック (`sprite-pack-kernel.ts`)

コンポーネント定義 (`sprite-components.ts`, 名前・型固定):

```ts
export const Sprite = defineComponent('Sprite', {
  frame: ScalarType.U32, tint: ScalarType.U32, layer: ScalarType.U16, flags: ScalarType.U16, sortKey: ScalarType.F32,
});
export const SpriteSlot = defineComponent('SpriteSlot', { slot: ScalarType.U32 });
```

入力カラム: `WorldTransform.{a,b,c,d,tx,ty}`, `Sprite.{frame,tint,layer,flags,sortKey}`, `SpriteSlot.slot`。

```
posX = tx, posY = ty
scaleX = sqrt(a*a + b*b)
rotation = atan2(b, a)
scaleY = (a*d - b*c) / scaleX     // スキューは非対応 (無視される)
packSprite(staging, slot, ...)
dirtyBits.set(slot >> 6)
```

`Sprite` か `WorldTransform` が dirty なチャンク範囲だけを処理する。

## 12. レンダーグラフ (`render/graph/`)

- v1 は「登録順に実行する線形グラフ + 一時リソースのプール」。自動バリア・並べ替えはしない。
- パスは `name`, `reads`, `writes` (リソース名), `execute(encoder, ctx)` を持つ。
- 既定のパス順: `sim:*` → `sprite:cull` → `sprite:draw` → `text:draw` → `graphics:draw` → `lighting` → `post:*` → `present`。
- ポストエフェクトが 1 つもなければ swapchain に直接描画する。ある場合は `RGBA16Float` の中間ターゲットに描画する。

## 13. 性能受け入れ基準 (WebGPU, 基準機, 1920×1080)

| シナリオ | 基準 |
|----------|------|
| 静止スプライト 100 万 (16×16, 全て画面内, Alpha ビン 50% / Opaque 50%) | フレーム p99 ≤ 6.94ms |
| GPU パス合計 (Cull+Scan+Scatter+Keys+Sort, 100 万) | ≤ 1.5ms (`timestamp-query`) |
| CPU Tier 10 万スプライトの全 dirty パック + 転送 | ≤ 1.5ms |
| WebGL2 静止スプライト 10 万 | フレーム p99 ≤ 6.94ms |
