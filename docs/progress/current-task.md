# T-3.2 RHI WebGPU 実装 (実施計画)

## 目的

`docs/06-rhi.md` §4・§4.1 が定義する RHI インターフェースを WebGPU で実装する。
`src/rhi/webgpu/` に 7 ファイルを作る。T-3.3 (WebGL2) と T-3.4 (デバイス生成) の土台になる。

RHI は「バックエンド差を隠す薄い抽象」なので、この層では `GPUDevice` を扱い、
`RhiDevice` を満たすラッパーを返すだけにする。上位層は `RHI インターフェースしか
触らないという規則はここを守る。

## 作成するファイル (docs/02 §12 と完全一致)

| ファイル                              | 責務                                                                  |
| ------------------------------------- | --------------------------------------------------------------------- |
| `src/rhi/webgpu/webgpu-convert.ts`    | RHI 定数から WebGPU 定数への変換表 (純関数)                           |
| `src/rhi/webgpu/webgpu-buffer.ts`     | `GPUBuffer` のラッパー。`readBufferAsync` を持つ                      |
| `src/rhi/webgpu/webgpu-texture.ts`    | `GPUTexture` と `GPUSampler` のラッパー                               |
| `src/rhi/webgpu/webgpu-bind-group.ts` | レイアウト・パイプラインレイアウト・バインドグループのラッパー        |
| `src/rhi/webgpu/webgpu-pipeline.ts`   | シェーダモジュールと render / compute パイプラインのラッパー          |
| `src/rhi/webgpu/webgpu-encoder.ts`    | コマンドエンコーダとパスのラッパー。**HOT**                           |
| `src/rhi/webgpu/webgpu-device.ts`     | `RhiDevice` の実装。caps の判定、デバイスロスト監視、スワップチェーン |

## 実装の要点

### 定数変換 (`webgpu-convert.ts`)

`docs/06` §5 の並びを前提にした表を置く。`BufferUsage` と `TextureUsage` は
ビットフラグなので、変換表で 1 ビットずつ並べて合成する。

圧縮フォーマット (BC7 / ETC2 / ASTC) は WebGPU では
`GPUCompressedTextureFormat` になる。ETask は 3 つの feature 名に対応する。
`RGBA16Float` は `float32-blendable` が無いとレンダーターゲットにできないので、
`webgpu-texture.ts` で `validateTextureDesc` を先に呼ぶ。

### 検証の呼び出し位置

`src/rhi/validate.ts` の 9 関数を `create*` の直前に呼ぶ。これは `docs/06`
§5.1.1 が要求している。`createBindGroupDesc` は `caps` を要求するので、
`webgpu-device.ts` が保持する caps を渡す。

### エンコーダのプール (`webgpu-encoder.ts`、HOT)

`docs/06` §4 の注記「エンコーダ・パスオブジェクトはフレーム毎に新規生成しない
実装にする」に従う。`GPUCommandEncoder` は 1 フレームで 1 個しか作れないので、

1. コンストラクタで 2 個作る (描画パスとコピー用の予備)。
2. `submit` 後に使用済み印を付け、次の `createCommandEncoder` で再利用する。
3. 予備も使用中なら `PlutoError(InvalidState)` を投げる。

パスオブジェクト (描画パス、コンピュートパス) もプールから借りる。パスごとに
`GPUTextureView` の配列と `GPUViewport` の値が必要だが、初期化時に確保した
フィールドへ書き込むだけにする。**このため `RhiRenderPass` の実装は
コンストラクタで確保したフィールドだけを使い、フレーム中に `new` しない。**

### 間接描画

`caps.indirectDraw` は `GPUDevice.features` に `indirect-first-instance` があるかで
決める。`docs/06` §2 の `requiredFeatures` は `indirect-first-instance` を
要求していないので、無い環境では `false` になる。

### シェーダのエントリポイント

`docs/06` §6 の固定名に従う。`GPUShaderModule` はシェーダごとに 1 つだけ作る。
頂点とフラグメントは別々 (`vertexShader` と `fragmentShader` が別_descriptor)。
Compute は `cs_` 接頭辞のエントリポイントが存在することを前提に、`entryPoint` を
`cs_main` に固定する。

### エラーチェック

`docs/06` §9 に従い、`__DEBUG__` 時だけ `pushErrorScope('validation')` を
パイプライン生成時に使い、`popErrorScope()` の結果で `PlutoError` を投げる。
release 時は框架の検査だけを行う。

### デバイスロスト

`docs/06` §8 に従い、`device.lost` を監視して `onDeviceLost` を発火する。
自動復旧はしない (v1 の範囲外)。

## 実装手順

1. `webgpu-convert.ts` を作る。定数変換表と、ビットフラグ合成関数。
2. `webgpu-buffer.ts` を作る。`readBufferAsync` は `mapAsync` を待つ。
   HOT ではないが、フレーム中に呼ばない前提の関数に `@cold` を付ける。
3. `webgpu-texture.ts` を作る。`writeTexture` の `bytesPerRow` の計算
   (256 の倍数 / ブロックサイズの倍数) を含む。
4. `webgpu-bind-group.ts` を作る。`createPipelineLayout` も含める。
5. `webgpu-pipeline.ts` を作る。WGSL から `GPUShaderModule` を作る。
6. `webgpu-encoder.ts` を作る。**1 行目に `// @pluto-hot` を書く。export 関数には
   必ず `@hot` か `@cold` を付ける。** フレーム中にオブジェクトリテラルを
   作らない (テーブルや配列はモジュールトップで確保する)。
7. `webgpu-device.ts` を作る。他 6 ファイルを組み合わせ、`RhiDevice` を満たす。
8. ユニットテストを書く (`tests/unit/rhi/`)。WebGPU 実機が必要な部分は
   T-3.4 のブラウザテストに委ねる。
9. `pnpm verify` と `pnpm build` を通す。

## 受け入れる条件

`docs/12` は「受け入れ条件 (T-3.4 で一括検証)」とだけ書いてあるので、T-3.2
自体の受け入れ条件は無い。代わりにここで守るべき条件を確定する。

1. `pnpm verify` がエラー 0・警告 0 で成功する。
2. `pnpm build` の `check-bundle` が OK。**embed ビルドに WebGPU 実装が
   混入しても Worker 依赖が増えないこと** (現在の parallel / embed の検証が
   退化していない)。
3. 新規 7 ファイルすべてに対応するユニットテストが存在する。
4. 公開シンボルすべてに日本語 JSDoc がある。`webgpu-encoder.ts` の export 関数
   には `@hot` か `@cold` が付いている。
5. `docs/02` §12 の表に無いファイルを作らない。`tools/check-structure.mjs` が OK。
6. WebGPU 実機での動作 (描画・compute・間接描画・圧縮テクスチャ) は
   **T-3.4 で検証する**。ここで Node テストとして可能なのは変換表と
   ラッパーの構造だけ。

## 意図的にやらないこと

- **`tests/browser/rhi/*.spec.ts` は作らない。** `docs/12` はこれを T-3.4 の
  ファイルとして挙げている。ブラウザで WebGPU を実際に動かすのは T-3.4。
- **`create-device.ts` は作らない。** T-3.4 の責務。`webgpu-device.ts` は
  既に用意された `GPUDevice` を受け取る形にする。
- **頂点バッファ API は作らない。** `docs/06` §4 の頂点バッファの注記どおり。
- **`webgpu/index.ts` は作らない。** `docs/02` §12 に無い。バックエンド実装は
  `rhi/` 内部以外から import できない (`.agents/rules/03-architecture.md`)。
