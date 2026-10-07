# エスカレーション記録

> `pluto-escalate` スキルで作業を止めたとき、ここに追記する。ユーザーの回答も記録する。

## E-001 (2026-10-06, Phase 5〜10 の詳細化とコードベースレビュー)

- 状況: ロードマップ詳細化で未決事項 U-1〜U-10 を挙げた。さらにコードレビューで、既存実装の仕様違反と仕様自体の曖昧さ (Kernel シグネチャ、Worker エントリ、World とスケジューラの接続など) が見つかった。
- 選択肢: 各項目の推奨案は `docs/12-roadmap.md` の旧「未決事項」表を参照。
- 推奨: 推奨案を採用し、仕様書へ反映したうえで是正タスクを挿入する。
- ユーザー回答: 「これら対象に対して、判断を下してください。既存コードの変更方針をレビューしてまとめ、docs を更新し、修正タスクを挿入してください」(2026-10-06)。エージェントが判断し、`docs/12-roadmap.md` の「決定事項」D-1〜D-19 として確定した。`.agents/rules/03-architecture.md` も D-12・D-19 に合わせて更新した。

## E-002 (2026-10-06, T-R.5)

- 状況: ECS ベンチ (`bench/scenes/ecs-move.ts`, 100 万エンティティ) で、04 §1.1 のメモリモデルと 04 §10 の性能基準が両立しないことが分かった。04 §1.1 は「伸長可能なバッファ (growable SAB / resizable ArrayBuffer) 上の length-tracking ビュー」を定めている。
- 証拠 (WSL2 上の Chromium と Node 22 の V8。基準機ではないので絶対値は参考。比率に意味がある):
  - Node 22 で 100 万要素 × 2 フィールドを更新した p50 (`scratchpad/rab-bench.mjs`):

    | バッファの種類                          | p50      | 通常比    |
    | --------------------------------------- | -------- | --------- |
    | 通常の ArrayBuffer                      | 2.57ms   | 1 倍      |
    | resizable ArrayBuffer (length-tracking) | 8.11ms   | 約 3.2 倍 |
    | resizable ArrayBuffer (固定長ビュー)    | 10.14ms  | 約 3.9 倍 |
    | growable SAB (length-tracking)          | 121.48ms | 約 47 倍  |

  - ブラウザ (`pnpm bench --scene ecs-move`) の結果。基準は moveKernel ≤ 2.0ms / spawn ≤ 150ms / get・set ≤ 30ms。

    | ビルド                  | moveKernelP99Ms | spawnMs | setMs | getMs |
    | ----------------------- | --------------- | ------- | ----- | ----- |
    | embed (resizable AB)    | 18.82           | 223     | 45    | 30    |
    | parallel (growable SAB) | 188.96          | 251     | 55    | 42    |

- 選択肢:
  1. **(推奨) 固定長バッファ + 伸長時にコピー**: カラムと entities は伸長できない通常の ArrayBuffer / SAB にし、容量不足なら 2 倍のバッファを確保してコピーする。伸長したら `structureVersion` を進め、Worker にアーキタイプを再送する (伸長は対数回しか起きない)。
     - 必要な変更: 04 §1.1・§4.1・§4.2 と 05 §3.3 (「伸長後も同じビュー」の保証をやめ、ビューは毎回アーキタイプから取る)。
     - コード: core (column / archetype / change-tracking) と jobs (再送) を直す。T-R.3 / T-R.4 の範囲を再オープンする形になる。
  2. 最大サイズの固定バッファを最初から確保する (伸長なし): 最速で単純だが、メモリが「最大行数 × フィールド × アーキタイプ」になる (既定 100 万行 × 4 バイト = フィールドあたり 4MB)。
  3. 現行のまま (V8 の改善を待つ): 性能目標を満たせない。
- 推奨: 1。
- 追加の確認事項 (どちらも基準機が必要):
  1. vsync の解除: `--disable-gpu-vsync --disable-frame-rate-limit` を付けても、WSLg (headed / headless とも) では `empty` の p50 が 17.5ms (60Hz) から下がらなかった。基準機 (dGPU の Chrome) で効くか確認したい。効かなければ、フレーム時間の定義 (10 §5) を見直す必要がある。
  2. ベースラインの登録: 04 §10 の性能基準の判定とベースライン登録は、基準機での計測が必要。根拠のない旧ベースラインは削除し、`bench/baseline.json` は `[]` にした。
- ユーザー回答: 「1」(2026-10-06)。固定長バッファ + 伸長時コピー + Worker への再送を採用。04 §1.1・§4.1・§4.2、05 §3.3、02、09 §4.5 を更新し、core / jobs の該当箇所を T-R.5 の範囲で直す。vsync の解除とベースライン登録は、引き続き基準機での確認待ち。
- 対応結果: 変更後の WSL での参考値は moveKernelP99Ms が embed 8.47ms / parallel 14.91ms (変更前は 18.82 / 188.96)。詳細は `reviews/T-R.5.md`。

<!-- 形式:
## E-003 (2026-10-07, T-3.1)

- 状況: Phase 3 の入口 T-3.1 (RHI インターフェース) を着手したが、`docs/06-rhi.md` §4 の `RhiDevice` が参照する記述子型 10 個と GPU リソースのインターフェースが、`docs/` のどこにも定義されていなかった。T-3.1 の成果物そのものが仕様として欠落している状態。
- 証拠: `docs/` 全体を検索した結果、一致したのは `docs/06-rhi.md` の使用箇所のみ (定義 0 件)。

  | 種類           | 型                                                                                                                                                                                                                              | 定義の有無 |
  | -------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------- |
  | 記述子型       | `BufferDesc`, `TextureDesc`, `SamplerDesc`, `BindGroupLayoutDesc`, `BindGroupDesc`, `RenderPipelineDesc`, `ComputePipelineDesc`, `TextureWriteDesc`, `RenderPassDesc` (加えて §5.1 で使う `BindGroupLayoutEntryDesc`, `BindGroupEntryDesc`, `ColorTargetDesc`, `DepthStencilDesc`, `ColorAttachmentDesc`) | なし       |
  | リソース       | `RhiBuffer`, `RhiTexture`, `RhiSampler`, `RhiBindGroup`, `RhiBindGroupLayout`, `RhiRenderPipeline`, `RhiComputePipeline`, `RhiQuerySet`                                                                                            | なし       |
  | 定数           | テクスチャ用途を表す `TextureUsage` 相当、`CullMode`, `LoadAction`, `ColorWrite`                                                                                                                                                  | なし       |

  加えて `docs/02` §12 の `src/rhi/device.ts` の責務一覧に `RhiBindGroupLayout` と `RhiQuerySet` が無く、`docs/06` §4 が要求するものと食い違っていた。

- 選択肢:
  1. **(推奨) `docs/06` に定義を追記してから実装する。** 方針 (§1「WebGPU のモデルに寄せた薄い抽象」) と既存定数 (§5) から導出し、`§5` に定数 4 種、`§5.1` に記述子型、`§4.1` にリソースインターフェースを追記する。仕様を完成させてからコードを書く。
  2. 最小構成 (バッファ・テクスチャ・サンプラ・レンダーパスのみ) を先に実装し、パイプライン系は T-3.2 と並行して詰める。T-3.1 は部分完了。
  3. 実装を保留し、`docs/06` の補完だけを今回の作業にする。
- 推奨: 1。
- ユーザー回答: 「docs/06 に定義を追記してから実装 (推奨)」(2026-10-07)。選択肢 1 を採用。`docs/12` の決定事項 **D-21** として記録し、`docs/02` §12 の `device.ts` 責務一覧と `tests/browser/fixtures/assets/` の許可パターンをこれに合わせて更新した。
- 対応結果: `docs/06` §5・§5.1・§4.1・§5.1.1 と `docs/12` D-21、`docs/02` §12・§23 を改訂済み。実装は T-3.1 で着手する。

## E-001 (YYYY-MM-DD, T-x.y)
- 状況:
- 選択肢:
- 推奨:
- ユーザー回答:
-->
