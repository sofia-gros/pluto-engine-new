# T-3.3 RHI WebGL2 実装 (実施計画)

## 目的

`docs/06-rhi.md` §4・§4.1 が定義する RHI インターフェースを WebGL2 で実装する。
`src/rhi/webgl2/` に 8 ファイルを作る。WebGPU 版 (T-3.2) と対称の構造にし、
実機での動作確認は T-3.4 のブラウザテストに委ねる。

WebGL2 は compute・間接描画・書き込みストレージを持たない。`docs/06` §7 の
エミュレーション規則に従い、読み取りストレージはデータテクスチャで代替し、
無い機能は作らない (なんとなくのエミュレートは禁止)。

## 作成するファイル (docs/02 §12 と完全一致)

| ファイル                               | 責務                                                          |
| -------------------------------------- | ------------------------------------------------------------- |
| `src/rhi/webgl2/webgl2-convert.ts`     | RHI 定数から GL 定数への変換表 (純関数)                       |
| `src/rhi/webgl2/webgl2-buffer.ts`      | Uniform は UBO、Storage 読み取りはデータテクスチャで代替      |
| `src/rhi/webgl2/webgl2-texture.ts`     | `GLTexture` とサンプラのラッパー                              |
| `src/rhi/webgl2/webgl2-bind-group.ts`  | バインドグループから UBO binding とテクスチャユニットへの割当 |
| `src/rhi/webgl2/webgl2-pipeline.ts`    | GLSL のコンパイル・リンクとリフレクション                     |
| `src/rhi/webgl2/webgl2-encoder.ts`     | 記録したコマンドを即時 GL 呼び出しに変換。**HOT**             |
| `src/rhi/webgl2/webgl2-state-cache.ts` | GL 状態キャッシュ (冗長な変更を除去)。**HOT**                 |
| `src/rhi/webgl2/webgl2-device.ts`      | `RhiDevice` の実装。拡張の有無で caps を決める                |

## 実装の要点

### 定数変換 (`webgl2-convert.ts`)

T-3.2 と同じくブラウザのグローバル (`gl.FLOAT` など) を使わない。
`WebGL2RenderingContext` の定数は仕様固定値なので数値で持つ。
`BlendMode` 6 種は `gl.blendFuncSeparate` の係数に展開する。

### バッファ (`webgl2-buffer.ts`)

- `Uniform` 用途は UBO (`gl.createBuffer` + `uniformBlockBinding`)。
- `Storage` 読み取り用途は `RGBA32UI` のデータテクスチャ
  (幅 `DATA_TEXTURE_WIDTH = 2048`、1 texel = 16 バイト) に載せる。
- `Storage` 書き込み用途は **作らない**。`validate.ts` で弾く前に、
  `createBuffer` で `StorageBufferReadWrite` を要求されたら
  `PlutoError(UnsupportedFeature)` にする。
- `MapRead` は `gl.getBufferSubData` で読む。コールドパス専用。

### テクスチャ (`webgl2-texture.ts`)

圧縮 3 形式は拡張 (`EXT_texture_compression_bptc` ほか) の有無で判定し、
`validateTextureDesc` を先に呼ぶ。`writeTexture` は `texImage2D` /
`texSubImage2D` を使う。`ImageBitmap` は `texImage2D` が直接受け付ける。

### バインドグループ (`webgl2-bind-group.ts`)

`docs/06` §7 の固定割当表に従う。BindGroup index 0〜3 に対し、
Uniform ブロックは binding 0〜3、テクスチャはユニット 0〜7 に割り当てる。
パイプライン生成時に GLSL の `uniform` 名から binding を解決する
(`getUniformBlockIndex` / `getUniformLocation`)。

### パイプライン (`webgl2-pipeline.ts`)

- `ShaderSource.glslVertex` / `glslFragment` が無ければ
  `PlutoError(UnsupportedFeature)`。WGSL しか無いシェーダは WebGL2 で使えない。
- `docs/06` §9 に従い、コンパイル失敗時はシェーダ名と行番号付きのログを
  `PlutoError(ShaderCompileFailed)` に含める。成功時も `__DEBUG__` では
  プログラムのログを確認する。
- R4-5 の `#version 300 es` ヘッダはシェーダ側が持つ前提で、backend は
  先頭の付与をしない (二重付与の防止)。

### エンコーダ (`webgl2-encoder.ts`、HOT)

WebGL2 にコマンドバッファは無いので、記録は RHI 呼び出しの器に溜めて
`submit` で即時実行する。器の確保はコンストラクタで済ませる。
1 行目に `// @pluto-hot` を書き、export メソッドには `@hot` を付ける。

- `drawIndirect` は `caps.indirectDraw === false` なので `PlutoError(InvalidState)`。
- `dispatch` / `dispatchIndirect` は compute が無いので同じく例外。
- `writeTimestamp` は RHI では任意メソッドなので定義しない
  (T-3.2 と同じ判断。`docs/06` §4 との整合は T-3.4 で決める)。

### 状態キャッシュ (`webgl2-state-cache.ts`、HOT)

`docs/06` §7 に従い、`gl.enable` などを直接呼ばず全てここ経由にする。
ブレンド・カリング・ビューポート・シザー・バインドテクスチャの現在値を覚え、
変わった分だけ GL を叩く。

### デバイス (`webgl2-device.ts`)

- コンストラクタは既存の `WebGL2RenderingContext` を受ける
  (生成は T-3.4 の `create-device.ts`)。T-3.2 の `WebGpuDevice` と対称。
- `caps` は拡張の有無で決める。`compute: false`、`indirectDraw: false`、
  `storageBuffers: true` (読み取り代替あり)、`timestampQuery` は
  `EXT_disjoint_timer_query_webgl2` の有無。
- `createComputePipeline` は `validateComputePipelineDesc` が
  `UnsupportedFeature` を投げるので、そのまま通す。
- デバイスロストは `webglcontextlost` で `onDeviceLost` を発火する。

## 実装手順

1. `webgl2-convert.ts` を作る。GL 定数の数値表とブレンド係数展開。
2. `webgl2-state-cache.ts` を作る。**1 行目に `// @pluto-hot`**。
3. `webgl2-buffer.ts` を作る。用途別の 2 経路 (UBO / データテクスチャ)。
4. `webgl2-texture.ts` を作る。`texImage2D` 系の転送。
5. `webgl2-bind-group.ts` を作る。固定割当表。
6. `webgl2-pipeline.ts` を作る。コンパイル・リンク・リフレクション。
7. `webgl2-encoder.ts` を作る。器プールと即時実行。
8. `webgl2-device.ts` を作る。他 7 ファイルを組み合わせる。
9. ユニットテストを書く (`tests/unit/rhi/webgl2/`)。GL コンテキストは
   偽物で代替し、実機が必要な部分は T-3.4 に委ねる。
10. `pnpm verify` と `pnpm build` を通す。

## 受け入れる条件

T-3.2 と同じく T-3.4 で一括検証するので、ここでの条件は以下。

1. `pnpm verify` がエラー 0・警告 0 で成功する。
2. `pnpm build` の `check-bundle` が OK。
3. 新規 8 ファイルに対応するユニットテストが存在する。
4. 公開シンボルすべてに日本語 JSDoc がある。HOT 2 ファイルの export には
   `@hot` か `@cold` が付いている。
5. `docs/02` §12 の表に無いファイルを作らない。
6. GL 実機での動作は **T-3.4 で検証する**。

## 意図的にやらないこと

- **`tests/browser/rhi/*.spec.ts` は作らない。** T-3.4 の責務。
- **`create-device.ts` は作らない。** T-3.4 の責務。`webgl2-device.ts` は
  既に用意された `WebGL2RenderingContext` を受け取る形にする。
- **`.glsl` ファイルは書かない。** backend は受け取った GLSL を編むだけ。
  シェーダの著述は Phase 4 (T-4.1 以降)。
- **`webgl2/index.ts` は作らない。** `docs/02` §12 に無い。
- **書き込みストレージと compute のエミュレートはしない。**
  `docs/06` §1 の「能力差は隠さない」に従う。
