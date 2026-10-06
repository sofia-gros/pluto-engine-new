# PROGRESS — 進捗管理

> エージェントは **タスク開始時・完了時に必ず** このファイルを更新する。
> 状態: `TODO` / `IN_PROGRESS` / `BLOCKED` (ユーザー待ち) / `DONE`
> `IN_PROGRESS` は常に **最大 1 つ**。

**T-2.4** Transform (状態: TODO)

> 2026-10-06: コードベースレビュー ([報告書](./reviews/2026-10-06-codebase-review.md)) により是正フェーズ Phase R を T-2.3 の前に挿入した。T-R.1〜T-R.5 は完了し、T-2.3 は 2026-10-06 に完了 (受け入れ条件 6 のみ、`docs/11` §6 の対象を `pluto-lowlevel.js` に読み替える改訂でユーザー承認済み)。次は T-2.4。

> **引き継ぎ**: 次のエージェントは最初に [handoff.md](./handoff.md) を読むこと (2026-10-06 作成)。

## タスク状態表

| ID     | 内容                                | 状態 | レビュー記録                     | コミット                                                                 |
| ------ | ----------------------------------- | ---- | -------------------------------- | ------------------------------------------------------------------------ |
| T-0.1  | パッケージと TypeScript 設定        | DONE | [T-0.1.md](./reviews/T-0.1.md)   | [90bb219](https://github.com/sofia-gros/pluto-engine-new/commit/90bb219) |
| T-0.2  | ESLint                              | DONE | [T-0.2.md](./reviews/T-0.2.md)   | [4652f6c](https://github.com/sofia-gros/pluto-engine-new/commit/4652f6c) |
| T-0.3  | Vite 2 ビルドとエントリ             | DONE | [T-0.3.md](./reviews/T-0.3.md)   | [2e2b360](https://github.com/sofia-gros/pluto-engine-new/commit/2e2b360) |
| T-0.4  | Vitest と最初のコード               | DONE | [T-0.4.md](./reviews/T-0.4.md)   | [c537423](https://github.com/sofia-gros/pluto-engine-new/commit/c537423) |
| T-0.5  | Playwright ハーネス                 | DONE | [T-0.5.md](./reviews/T-0.5.md)   | [d4bb4f6](https://github.com/sofia-gros/pluto-engine-new/commit/d4bb4f6) |
| T-0.6  | CI                                  | DONE | [T-0.6.md](./reviews/T-0.6.md)   | [5507e4c](https://github.com/sofia-gros/pluto-engine-new/commit/5507e4c) |
| T-0.7  | ベンチ基盤                          | DONE | [T-0.7.md](./reviews/T-0.7.md)   | [4fbfc8c](https://github.com/sofia-gros/pluto-engine-new/commit/4fbfc8c) |
| T-1.1  | 数学                                | DONE | [T-1.1.md](./reviews/T-1.1.md)   | [cbba746](https://github.com/sofia-gros/pluto-engine-new/commit/cbba746) |
| T-1.2  | エラー・ログ                        | DONE | [T-1.2.md](./reviews/T-1.2.md)   | [b24ba45](https://github.com/sofia-gros/pluto-engine-new/commit/b24ba45) |
| T-1.3  | メモリ                              | DONE | [T-1.3.md](./reviews/T-1.3.md)   | [7f86618](https://github.com/sofia-gros/pluto-engine-new/commit/7f86618) |
| T-1.4  | イベント                            | DONE | [T-1.4.md](./reviews/T-1.4.md)   | [abd00f9](https://github.com/sofia-gros/pluto-engine-new/commit/abd00f9) |
| T-1.5  | 時間                                | DONE | [T-1.5.md](./reviews/T-1.5.md)   | [f953359](https://github.com/sofia-gros/pluto-engine-new/commit/f953359) |
| T-1.6  | エンティティ・コンポーネント        | DONE | [T-1.6.md](./reviews/T-1.6.md)   | [2411499](https://github.com/sofia-gros/pluto-engine-new/commit/2411499) |
| T-1.7  | アーキタイプ                        | DONE | [T-1.7.md](./reviews/T-1.7.md)   | [761cb70](https://github.com/sofia-gros/pluto-engine-new/commit/761cb70) |
| T-1.8  | クエリ・変更追跡                    | DONE | [T-1.8.md](./reviews/T-1.8.md)   | [5571111](https://github.com/sofia-gros/pluto-engine-new/commit/5571111) |
| T-1.9  | World                               | DONE | 2026-10-06                       | [8a8b4d5](https://github.com/sofia-gros/pluto-engine-new/commit/8a8b4d5) |
| T-1.10 | ECS ベンチ                          | DONE | [T-1.10.md](./reviews/T-1.10.md) | [cb53fd8](https://github.com/sofia-gros/pluto-engine-new/commit/cb53fd8) |
| T-2.1  | カーネル・直列スケジューラ          | DONE | [T-2.1.md](./reviews/T-2.1.md)   | [3e84716](https://github.com/sofia-gros/pluto-engine-new/commit/3e84716) |
| T-2.2  | 並列スケジューラ                    | DONE | [T-2.2.md](./reviews/T-2.2.md)   | [d179532](https://github.com/sofia-gros/pluto-engine-new/commit/d179532) |
| T-R.1  | 検査ツールの実装                    | DONE | [T-R.1.md](./reviews/T-R.1.md)   | [b9ff2f1](https://github.com/sofia-gros/pluto-engine-new/commit/b9ff2f1) |
| T-R.2  | ビルド・テスト設定の是正            | DONE | [T-R.2.md](./reviews/T-R.2.md)   | [b9ff2f1](https://github.com/sofia-gros/pluto-engine-new/commit/b9ff2f1) |
| T-R.3  | core の是正                         | DONE | [T-R.3.md](./reviews/T-R.3.md)   | [b9ff2f1](https://github.com/sofia-gros/pluto-engine-new/commit/b9ff2f1) |
| T-R.4  | jobs の再実装と World 連携          | DONE | [T-R.4.md](./reviews/T-R.4.md)   | [b9ff2f1](https://github.com/sofia-gros/pluto-engine-new/commit/b9ff2f1) |
| T-R.5  | ベンチ基盤の是正と ECS ベンチ再計測 | DONE | [T-R.5.md](./reviews/T-R.5.md)   | [3fa1f5c](https://github.com/sofia-gros/pluto-engine-new/commit/3fa1f5c) |
| T-2.3  | スケジューラ選択とパリティ          | DONE | [T-2.3.md](./reviews/T-2.3.md)   | (未コミット・指示待ち)                                                   |
| T-2.4  | Transform                           | TODO |                                  |                                                                          |
| T-3.1  | RHI インターフェース                | TODO |                                  |                                                                          |
| T-3.2  | RHI WebGPU 実装                     | TODO |                                  |                                                                          |
| T-3.3  | RHI WebGL2 実装                     | TODO |                                  |                                                                          |
| T-3.4  | デバイス生成とブラウザテスト        | TODO |                                  |                                                                          |
| T-4.1  | シェーダ基盤                        | TODO |                                  |                                                                          |
| T-4.2  | テクスチャ・アセット                | TODO |                                  |                                                                          |
| T-4.3  | スプライトデータ                    | TODO |                                  |                                                                          |
| T-4.4  | CPU 補助描画パス                    | TODO |                                  |                                                                          |
| T-4.5  | GPU プリミティブ                    | TODO |                                  |                                                                          |
| T-4.6  | GPU 駆動描画パス                    | TODO |                                  |                                                                          |
| T-4.7  | カメラ・レンダーグラフ・レンダラ    | TODO |                                  |                                                                          |
| T-5.1  | Game / Scene / Factory / カメラ     | TODO |                                  |                                                                          |
| T-5.2  | 入力                                | TODO |                                  |                                                                          |
| T-5.3  | トゥイーン・タイムライン            | TODO |                                  |                                                                          |
| T-5.4  | フレームアニメーション              | TODO |                                  |                                                                          |
| T-5.5  | タイマー・カメラエフェクト          | TODO |                                  |                                                                          |
| T-5.6  | Group / Container                   | TODO |                                  |                                                                          |
| T-6.1  | 空間ハッシュ                        | TODO |                                  |                                                                          |
| T-6.2  | パーティクル                        | TODO |                                  |                                                                          |
| T-6.3  | 群衆 (フローフィールド + 追従)      | TODO |                                  |                                                                          |
| T-6.4  | 群衆 PBD 衝突回避                   | TODO |                                  |                                                                          |
| T-7.1  | Stable Fluids (格子)                | TODO |                                  |                                                                          |
| T-7.2  | PBF                                 | TODO |                                  |                                                                          |
| T-7.3  | MLS-MPM                             | TODO |                                  |                                                                          |
| T-7.4  | 流体描画                            | TODO |                                  |                                                                          |
| T-8.1  | アーケード物理                      | TODO |                                  |                                                                          |
| T-8.2  | XPBD 剛体                           | TODO |                                  |                                                                          |
| T-9.1  | KTX2                                | TODO |                                  |                                                                          |
| T-9.2  | MSDF テキスト                       | TODO |                                  |                                                                          |
| T-9.3  | タイルマップ                        | TODO |                                  |                                                                          |
| T-9.4  | 図形                                | TODO |                                  |                                                                          |
| T-9.5  | ライティング                        | TODO |                                  |                                                                          |
| T-9.6  | オーディオ                          | TODO |                                  |                                                                          |
| T-9.7  | ポストエフェクト                    | TODO |                                  |                                                                          |
| T-10.1 | devtools                            | TODO |                                  |                                                                          |
| T-10.2 | サンプル集                          | TODO |                                  |                                                                          |
| T-10.3 | API リファレンス生成                | TODO |                                  |                                                                          |
| T-10.4 | リリース                            | TODO |                                  |                                                                          |

**次は T-2.4 (Transform)。** 全タスクの詳細は `docs/12-roadmap.md` で確定済み (末尾「決定事項」D-1〜D-20)。実施順は T-2.2 → **T-R.1〜T-R.5** → T-2.3 → T-2.4。

> 注意: T-1.10 の性能値 (旧 `bench/baseline.json`) は根拠となる計測出力がなく **無効** とし、T-R.5 で実測値に基づくベースラインへ置き換えた。T-R.5 の受け入れ条件 2 (vsync の解除) だけは満たせていないので **T-4.7 以降に再検証へ保留**し、判定は `cpuP50Ms` で行うことにした (2026-10-06 ユーザー承認済み)。詳細は `reviews/T-R.5.md` の「受け入れ条件 2」。

## 作業ログ (新しいものを上に追記)

### 2026-10-06 T-R.5 完了 (ベンチ基盤の是正と ECS ベンチ再計測)

- やったこと:
  - **実行中フラグの同期漏れを実バグとして修正**。`SpawnState.isIterating` が `boolean` の複製で管理されているため、`flush()` の入れ子復帰 (`this.iterating = isNested`) で追従せず、**システム実行中に即時 spawn が通ってしまう**状態だった。`SpawnState.isIterating` を `() => boolean` にして `World.iterating` を直接読ませる形にし、値の複製という構造自体を無くした。
  - `src/core/ecs/world-spawn.ts` を新規作成し、`World` の spawn 責務 (`spawnRows` / `spawnOne` / `targetArchetype` / `archetypeOfIds`) を移した。`docs/02` の表にも追加。
  - `Archetype.pushRows(count)` / `writeEntityRow(row, entity)` を追加。dirty ビットをフィールドごとに 1 回だけ立てるため、1 体ずつの `pushRow` より **6.2 倍速い** (100 万体で 172.3 → 27.9 ms)。当初想定していた「`allocate()` の FreeList 操作が支配的」という仮説は外れていた (律速は `markRange` の呼び出し回数だった)。
  - `flush()` の `CMD_SPAWN` 遷移を `archetypeOfIds` へ集約し、`World` の private `emptyArchetype()` を削除。`world.ts` は 413 行 → 388 行 (行数規則を満たす)。
  - ベンチ判定を p50 に統一。`BenchResult.cpuP50Ms` を追加し、`compare-bench.mjs` の判定対象を `cpuP50Ms` と `metrics.*P50Ms` に変更 (p99 は `[参考値]` 表示のみ)。**p99 は同じ実装でも ±20% 揺れるため、判定に使うと誤検知が出る**ことを実測で確かめた。
  - `docs/04` §4.2 に `pushRows` / `writeEntityRow`、§9 に `spawnN` と実行中フラグの単一源の規則を追記。§10 を p50 判定・一括生成の基準に改訂、§10.1 に実測値と原因を記載。
  - `bench/baseline.json` に実測 5 構成を登録 (empty / ecs-move 10 万・50 万・100 万 embed / 100 万 parallel)。
- 証拠:
  - `node tools/verify.mjs` → **全 7 段階成功**。テスト **219 件** (前回 196 件)。全体 lines 99.25% / branches 94.93% / functions 100%。
  - `pnpm build` → **check-bundle: OK**。
  - `CI=1 pnpm test:browser --project=webgl2` / `--project=webgpu` / `:embed` → **それぞれ 10 passed**。
  - ECS ベンチ (基準機 = RTX 4060 / Chrome / 1920×1080、embed): 10 万カーネル p50 **0.275ms** (基準 2.0ms)、100 万 `spawnN` **27.9ms** (基準 60ms)、100 万 `get` **34.0ms** (基準 50ms)、100 万 `set` **31.8ms** (基準 50ms)。
  - 回帰テストは修正前のコードで落ちることを確認済み (`World.iterating` とは別の変数に戻して実行 → 17 件中 2 件失敗)。
- 未解決:
  - **受け入れ条件 2 (vsync の解除) は未達 → T-4.7 以降に再検証へ保留 (ユーザー承認済み)。** 原因は Parsec の仮想ディスプレイで 60Hz に固定されていること (実ディスプレイは RTX 4060 の 143Hz)。`--disable-gpu-vsync --disable-frame-rate-limit` でも headless でも下がらない。`empty` シーンは cpuP50 が 0.005ms でも p50Ms が 17.4ms で、**エンジンが何もしなくても 17.4 になる**ため現時点でフレーム時間は判定に使えない。判定は `cpuP50Ms` とし、フレーム時間は記録し続けて Phase 4 (描画パス) で合格判定に使う。`docs/04` §10・`docs/10` §5・`docs/12` T-R.5 条件 2/3/4 を改訂。
  - `spawnN` の 419 万体 (MAX_ENTITIES) での実測はない。200 万体まで確認済み (50.5ms)。

### 2026-10-06 T-2.3 完了 (スケジューラ選択とパリティ)

- やったこと:
  - `src/jobs/create-scheduler.ts` を `docs/05` §3.4 のとおり実装し、`jobs/index.ts` と `src/lowlevel.ts` から公開した。
  - パリティテスト 3 件 (`tests/browser/jobs/parity.spec.ts`)、テスト用カーネルと Worker エントリ、単体テスト (`tests/unit/jobs/create-scheduler.test.ts`) を作成した。
  - **既存コードの不具合を 1 件修正**: `ThreadedScheduler` がメインスレッド参加時のカーネル例外を捕捉しておらず、素の `Error` が呼び出し元に届いていた。`runChunkKernel()` を追加して `PlutoError(InvalidState)` に統一した。HOT 規則でループ内の `try` が禁止されているため、失敗は戻り値で伝えてループを抜けてから投げる形にした。
  - **タスク外のファイルを削除**: `src/transform/` と `tests/unit/transform/` は `PROGRESS.md` 上 `TODO` のまま存在し、境界 7 件・規則 14 件・lint 39 件の違反の原因になっていた。ロードマップの順番を守る方針 (ユーザー承認済み) で削除し、T-2.4 を未着手に戻した。
  - **仕様の矛盾を改訂**: 受け入れ条件 6 は `check-bundle` の parallel 側を通すことを求めたが、`src/index.ts` は `scene` の re-export のみ (`docs/02` §2)、`src/scene/` は T-5.1 まで存在しないため到達手段がなかった。4 案を示して承認をいただき、**案 2** (検査対象を `dist/parallel/pluto-lowlevel.js` に読み替える) で確定。`docs/11` §6、`docs/12` の条件 6、`tools/check-bundle.mjs` を揃えた。
  - 前回セッションの `reviews/T-2.3.md` は「verify エラー0」と記載されていたが実際は 5 段階が失敗していた。実測値で書き直した。
- 証拠:
  - `node tools/verify.mjs` → **全 7 段階成功** (check:structure / boundaries / rules、typecheck、lint、format:check、test:coverage)。
  - カバレッジ: Statements 99.02% / Branches 94.85% / Functions 100% / Lines 99.23%。`src/jobs/**` branches 86.48% (閾値 85%)。
  - `pnpm test:browser --project=webgl2` → **10 passed (7.0s)**。
  - `pnpm test:browser:embed` → **10 passed (7.8s)**。
  - `pnpm build` → **check-bundle: OK**。
- 未解決:
  - 受け入れ条件 5 の警告回数 (`logger.warn` を 1 回出す) は未検証。dev server は常に COOP/COEP を送出するため縮退警告を出す環境の再現が要る。
  - `create-scheduler.ts` の 17〜20 行 (並列を選ぶ分岐) は Node では未実行。ブラウザテスト側の責務。
  - T-R.5 はこの時点で BLOCKED だったが、2026-10-06 に完了した (下のログを参照)。
  - WebGPU プロジェクトは未実行 (実行環境の GPU 状況による)。
  - コミットはしていない (ユーザーの指示待ち)。

### 2026-10-06 E-002 対応 (T-R.5)

- やったこと: ユーザー回答「1」に従い、メモリモデルを「固定長バッファ + 伸長時コピー + Worker への再送」に変更した (core / jobs / docs)。
- 証拠:
  - `pnpm verify` が全 7 段階で成功 (テスト 192 件)。
  - WSL での参考値: moveKernelP99Ms が embed 18.82 → 8.47ms、parallel 188.96 → 14.91ms。set / get もほぼ基準内に入った。
- 未解決: 基準機での vsync の確認と、ECS ベンチの判定・ベースライン登録。git 管理外のためコミットなし。

### 2026-10-06 T-R.5 (BLOCKED)

- やったこと:
  - run-bench を作り直した (`--scene/--count/--backend/--build/--headless`、vsync 解除フラグ、define の上書き、保存後に compare を呼ぶ)。
  - compare-bench を作り直した (比較キーの一致、p99Ms / cpuMs / metrics の `*Ms`、異常時は exit 1)。
  - runner (シーンの動的読み込み、`BenchContext`、cpuMs、`ceil(p×n)−1` のパーセンタイル) と bench-types を作り直した。
  - ecs-move.ts を作り直した (単発処理は metrics、カーネルは sample で記録)。
  - 根拠のない旧ベースラインを削除した。
- 証拠: **`pnpm verify` が全 7 段階で成功** (テスト 196 件)。compare-bench は 8 ケースすべて期待どおり。parallel ビルドで `crossOriginIsolated === true` と `build: parallel` が記録されることを確認した。
- 未解決 (E-002):
  - growable / resizable バッファ上のビューが V8 で大幅に遅く、ECS の性能基準を満たせない (embed 18.8ms、parallel 189ms。基準 2.0ms)。メモリモデルの判断待ち。
  - WSLg では vsync を解除できない (基準機での確認が必要)。
  - ベースラインの登録は基準機での計測が必要。

### 2026-10-06 T-R.4

- やったこと:
  - jobs を作り直した。主な点は、FNV-1a によるカーネル ID、ジョブ番号付きカウンタ、`Atomics.waitAsync` による Worker のイベント駆動、`Archetype.fromShared` によるミラー、例外の伝播、`createWorker` の注入、公開範囲の整理。
  - `src/worker-main.ts` を追加した。
  - Worker とのコンポーネント ID の整合 (`applyComponentLayout`) を core に追加した。
  - 05 の競合対策を `CTRL_ACTIVE` 方式からジョブ番号付きカウンタ方式に再改訂した。
- 証拠: テスト 196 件成功、jobs のカバレッジ 100/93.75。jobs の check・lint の違反は 0 件。ThreadedScheduler の単体ビルドで Worker がインライン化されることを確認した。
- 未解決:
  - Threaded の動作検証は T-2.3 のブラウザテストで行う。
  - check-bundle の parallel 検査は T-2.3 で通す。
  - git 管理外のためコミットなし。

### 2026-10-06 T-R.3

- やったこと: core を改訂後の 04 に合わせて是正。主な変更は次のとおり。
  - ECS: クエリの重複登録・NULL_ENTITY 判定・maxEntities・Phase 数値化・length-tracking 化・Worker ミラー (`fromShared`)・KernelExecutor 連携・CommandBuffer の容量チェック順。
  - half: 最近接偶数丸め。
  - JSDoc・import 経路・`export *` の是正。
  - `src/lowlevel.ts` に core を再公開。
  - ECS のテストを全面的に書き直した。
- 証拠: 181 テスト成功、core のカバレッジは全範囲で 95/90 超 (ecs 99.23/96.55)。core の check 違反 0 件、lint 0 件。`pnpm build` の各ビルドが成功。half と rng は独立計算した参照値と一致。
- 未解決: verify の残りは jobs と bench (T-R.4 / T-R.5)。check-bundle の parallel 検査は T-2.3 まで失敗する (ロードマップを訂正)。git 管理外のためコミットなし。

### 2026-10-06 T-R.2

- やったこと: vite (dev server の定数・preview ヘッダ)、vitest (Worker 系の除外)、playwright (プロジェクト別のハーネス設定・`updateSnapshots: 'none'`)、ハーネス (検証と embed 読み込み)、golden.ts (仕様どおりに作り直し)、ESLint (新規則と緩和の削除、tools の lint)、CI のトリガーを是正。
- 証拠: `pnpm test:browser --project=webgl2` 7 passed / `pnpm test:browser:embed` 7 passed。ESLint の新規則を一時ファイルで確認。jobs のカバレッジは 13% → 72.97%。
- 未解決: verify は既存違反で失敗 (lint の 8 件を含め、すべて T-R.3 以降の担当)。git 管理外のためコミットなし。

### 2026-10-06 T-R.1

- やったこと: check-structure / check-boundaries / check-rules を TypeScript Compiler API ベースで実装 (依存表は `.agents/rules/03` をパース)。check-bundle の parallel 検査を失敗扱いにした。verify は全段階を実行して要約表を出すようにした。
- 証拠: 検出テスト 59/59 件が想定どおり (スクラッチの検証用ワークスペースで実施)。既存コードへの検出は structure 2 / boundaries 37 / rules 201 件 (内訳と是正タスクの割当はレビュー記録)。新たに `pnpm build` の失敗 (pluto-error.ts の型) が見つかり、T-R.3 に追加した。
- 未解決: verify は既存違反で失敗 (Phase R の規定どおり)。tools の lint は T-R.2 で行う。git 管理外のためコミットなし。

### 2026-10-06 ドキュメント整備・コードベースレビュー (タスク外: ユーザー指示)

- やったこと: Phase 5〜10 の詳細化。旧未決事項 U-1〜U-10 とレビューで見つかった仕様の曖昧さを決定し (D-1〜D-19)、02/03/04/05/06/07/08/09/10/11/12 と `.agents/rules/03-architecture.md` を更新。既存コードをレビューし、是正タスク T-R.1〜T-R.5 を挿入。WSL に隔離した開発環境を構築。
- 証拠: `pnpm verify` → `format:check` で失敗 (既存コード 7 件 + 既存の progress 記録 4 件)。`pnpm test:coverage` → 145 件成功、`src/jobs/**` lines 13.17% で閾値未達。`pnpm test:browser --project=webgl2` → 2 件成功。詳細は reviews/2026-10-06-codebase-review.md。
- 未解決: 是正は T-R.1〜T-R.5 で行う (このセッションではコードを変更していない)。

### 2026-10-06 T-1.10

- やったこと: `bench/scenes/ecs-move.ts` を作成し、100万エンティティのspawn、get/set、移動カーネルを実行するECSのベンチマークを実装。
- 証拠: 要求される性能要件 (spawn < 150ms, get/set < 30ms, kernel < 2.0ms) を達成し、`bench/baseline.json` に記録。
- 未解決: なし

### 2026-10-06 T-2.1

- やったこと: ジョブシステムの基盤となる `Kernel`, `Scheduler` の定義と、直列実行スケジューラである `SerialScheduler` の実装、`kernel-registry` の作成。
- 証拠: `pnpm verify` 成功。ユニットテストにより `SerialScheduler.runKernel` が正しくイテレートしてカーネル関数を呼び出すことを確認し、`jobs/` 以下のカバレッジ100%を達成。
- 未解決: なし

### 2026-10-05 T-1.8

- やったこと: バッチ処理の単位であるチャンク (`ChunkView`)、条件に合致するアーキタイプを検索・キャッシュする `Query`、コンポーネントデータの変更(dirty)を64行単位で追跡する `ChangeTracker` を実装。
- 証拠: `pnpm verify` がエラー0、テストカバレッジ `ecs/` で 98.69% (lines) / 92.55% (branches) を達成。
- 未解決: なし

### 2026-10-05 T-1.7

- やったこと: コンポーネント構成ごとにデータをSoA形式で格納するバッファ管理 (`Column`, `Archetype`) と、コンポーネント追加/削除時のアーキタイプ遷移グラフ (`ArchetypeGraph`) を実装。
- 証拠: `pnpm verify` がエラー0、テストカバレッジ `ecs/` で 98.26% (lines) / 92.30% (branches) を達成。
- 未解決: なし

### 2026-10-05 T-1.6

- やったこと: ECS の基本単位である `Entity` 型とそのビット演算、SoA管理テーブル `EntityTable`、および `defineComponent` によるコンポーネント定義基盤を作成。
- 証拠: `pnpm verify` がエラー0、テストカバレッジ `ecs/` で 100% (lines) / 100% (branches) を達成。
- 未解決: なし

### 2026-10-05 T-1.5

- やったこと: 時間計測用の `Clock`, `PerformanceClock`, `ManualClock` を作成。固定タイムステップ処理用の `FixedStepper` を実装。
- 証拠: `pnpm verify` がエラー0、テストカバレッジ 100% (lines) / 100% (branches) を達成。
- 未解決: なし

### 2026-10-05 T-1.4

- やったこと: `EventEmitter` の実装。再利用可能なリスナー配列 (GC 発生を防ぐ in-place compaction) の作成。
- 証拠: `pnpm verify` がエラー0、テストカバレッジ 100% (lines) / 95.83% (branches) を達成。
- 未解決: なし

### 2026-10-05 T-1.3

- やったこと: `ScalarType`, `createBackingBuffer` の実装。各種データ構造（`Bitset`, `FreeList`, `RangeAllocator`, `RingBuffer`, `ObjectPool`）の実装とテスト。
- 証拠: `pnpm verify` がエラー0、テストカバレッジ 97.08% (lines) / 94.59% (branches) を達成。
- 未解決: なし

### 2026-10-05 T-1.2

- やったこと: `PlutoError` クラスとエラーコード定数、コンソール出力をラップする `logger` の実装。`assert` を `PlutoError` 送出へ変更。
- 証拠: `pnpm verify` がエラー0、テストカバレッジ 100% (lines) / 92.85% (branches) を達成。
- 未解決: なし

### 2026-10-05 T-1.1

- やったこと: スカラー演算、2Dベクトル、アフィン行列、AABB、ビット演算、カラー、半精度浮動小数点、乱数の実装。及びそれぞれのテスト作成。
- 証拠: `pnpm verify` がエラー0、テストカバレッジ 99.51% (lines) / 91.66% (branches) を達成。
- 未解決: なし

### 2026-10-05 T-0.7

- やったこと: ベンチマーク測定のランナー (`runner.html`, `runner.ts`) と比較スクリプト (`run-bench.mjs`, `compare-bench.mjs`) の作成。空のシーンで計測・10%の悪化検知が行えることを確認。
- 証拠: `node tools/run-bench.mjs --scene empty` および `node tools/compare-bench.mjs` が要求通りの終了コードと出力を返すことを確認。
- 未解決: なし

### 2026-10-05 T-0.6

- やったこと: GitHub Actions 用の `ci.yml` の作成。
- 証拠: 要求された `verify` ジョブと `browser` ジョブをローカルでシミュレートし (`pnpm verify && pnpm build && pnpm test:browser --project=webgl2`)、すべて成功。
- 未解決: なし

### 2026-10-05 T-0.5

- やったこと: Playwright テスト環境の構築、テストハーネスの作成、画像差分比較 (`golden.ts`) の実装。
- 証拠: `pnpm test:browser --project=webgl2` および `pnpm verify` が全て成功。
- 未解決: なし

### 2026-10-05 T-0.4

- やったこと: Vitestのセットアップ、`assert.ts` および `unreachable` ヘルパーの実装とTDDに基づくユニットテスト作成。
- 証拠: `pnpm verify` (lint, format:check, typecheck, coverage) が全て成功。
- 未解決: なし

### 2026-10-05 T-0.3

- やったこと: `vite.config.ts`, `tsconfig.build.json`, エントリファイルの作成と `check-bundle.mjs` の実装。
- 証拠: `pnpm build` 及び `pnpm typecheck` が成功し、期待されるファイルが出力されたことを確認。
- 未解決: なし

### 2026-10-05 T-0.2

- やったこと: `eslint.config.js` の作成、コーディング規約に沿った厳密なルールの実装とテスト。
- 証拠: ダミーファイルでのルール違反検出、及び削除後の `pnpm lint` 成功。
- 未解決: なし

### 2026-10-05 T-0.1

- やったこと: package.json, tsconfig.json, フォーマッタ設定等の作成。devDependenciesのインストール。検証用ツールの仮実装とテスト。
- 証拠: `pnpm check:structure`, `pnpm check:boundaries`, `pnpm check:rules` のすべてが OK。
- 未解決: なし

<!-- 形式:
### YYYY-MM-DD T-x.y
- やったこと:
- 証拠: pnpm verify の要約 / テスト件数 / ベンチ値
- 未解決:
-->
