# T-3.4 デバイス生成とブラウザテスト (実施計画)

## 目的

`docs/06-rhi.md` §2 に基づき、WebGPU → WebGL2 の順でデバイス生成を試みる `src/rhi/create-device.ts` を実装し、`rhi/index.ts` および `src/lowlevel.ts` から公開する。
また、Phase 3 (RHI) の全受け入れ条件 (`docs/12-roadmap.md` T-3.4) をブラウザテスト (`tests/browser/rhi/*.spec.ts`) で実機検証する。

## 作成・編集するファイル (docs/02 §12, §23 と完全一致)

| ファイル                                   | 責務                                                                                            |
| ------------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `src/rhi/create-device.ts`                 | WebGPU → WebGL2 の順でデバイス生成を試みる唯一の場所 (新規)                                     |
| `src/rhi/index.ts`                         | `createDevice`, `CreateDeviceOptions` を公開窓口に追加 (変更)                                   |
| `src/lowlevel.ts`                          | `createDevice`, `CreateDeviceOptions` 等を再公開 (変更)                                         |
| `tests/unit/rhi/create-device.test.ts`     | `createDevice` のオプション検証とモックによる分岐のユニットテスト (新規)                        |
| `tests/browser/rhi/create-device.spec.ts`  | バックエンド指定、caps、デバイスロスト等のブラウザテスト (新規)                                 |
| `tests/browser/rhi/render.spec.ts`         | クリアカラー、四角形描画 (ゴールデン画像)、ストレージ読取四角形、writeBuffer 部分転送 (新規)    |
| `tests/browser/rhi/compute.spec.ts`        | WebGPU の compute (配列 2 倍) と readBufferAsync、drawIndirect (新規)                           |
| `tests/browser/rhi/compression.spec.ts`    | 圧縮テクスチャ形式の対応判定、非対応での UnsupportedFeature 送出、対応形式のサンプリング (新規) |
| `tests/browser/golden/webgpu/rhi-quad.png` | WebGPU 版四角形描画のゴールデン画像 (新規)                                                      |
| `tests/browser/golden/webgl2/rhi-quad.png` | WebGL2 版四角形描画のゴールデン画像 (新規)                                                      |

## 実装ステップ

1. **Step 1: 計画策定と準備 (`pluto-task-start`)**
   - `docs/progress/current-task.md` を作成。
   - `docs/progress/PROGRESS.md` を `IN_PROGRESS` に更新。
2. **Step 2: `create-device.ts` と単体テストの実装 (`pluto-implement`)**
   - `src/rhi/create-device.ts` を実装。
   - `src/rhi/index.ts` と `src/lowlevel.ts` に export を追加。
   - `tests/unit/rhi/create-device.test.ts` で引数検証や fallback ロジックをテスト。
3. **Step 3: ブラウザテストとゴールデン画像の実装**
   - `tests/browser/rhi/create-device.spec.ts` (backend 選択、caps の整合性、webgl2 で caps.compute === false)
   - `tests/browser/rhi/render.spec.ts` (クリアカラー、四角形描画、ストレージ読取四角形、writeBuffer 部分転送)
   - `tests/browser/rhi/compute.spec.ts` (WebGPU の compute と readBufferAsync、drawIndirect)
   - `tests/browser/rhi/compression.spec.ts` (caps.textureCompression* と実際の機能の一致、非対応時の UnsupportedFeature、対応形式のサンプリング)
   - ゴールデン画像の生成 (`tests/browser/golden/<backend>/rhi-quad.png`)
4. **Step 4: テスト・検証 (`pluto-test`)**
   - `pnpm verify` がエラー 0・警告 0 で成功することを確認。
   - `pnpm test:browser --project=webgl2` および `pnpm test:browser --project=webgpu` が全件成功することを確認。
5. **Step 5: レビュー・完了 (`pluto-review` / `pluto-task-finish`)**
   - `docs/progress/reviews/T-3.4.md` を作成。
   - `docs/progress/PROGRESS.md` を `DONE` に更新。

## 受け入れ条件 (docs/12-roadmap.md T-3.4)

1. 両バックエンドで:
   - クリアカラー
   - vertex pulling による 1 つの四角形描画 (ゴールデン画像)
   - ストレージ (WebGL2 はデータテクスチャ) から色を読む四角形描画
   - `writeBuffer` の部分転送
2. WebGPU のみ:
   - compute で配列を 2 倍にし `readBufferAsync` で検証
   - `drawIndirect`
3. `backend: 'webgl2'` 強制時に `caps.compute === false`
4. 圧縮テクスチャ (06 §3・§5):
   - `caps.textureCompression*` が実際の機能・拡張の有無と一致する
   - `false` の形式で `createTexture` すると `PlutoError(UnsupportedFeature)` (必ず検証する)
   - `true` の形式は単色ブロックをアップロードしてサンプルした色が期待値 (環境により検証内容を分岐してよいが、`test.skip` は禁止)
5. `pnpm verify` が警告・エラー 0 で成功
