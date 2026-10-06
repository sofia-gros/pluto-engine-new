# レビュー記録: T-R.5 ベンチ基盤の是正と ECS ベンチの再計測 (途中: BLOCKED)

## 状態

受け入れ条件 1・3・5 は満たした。条件 2 (vsync の解除) と 4 (基準機で計測しベースライン登録) は、この環境 (WSL2) では満たせない。さらに、**メモリモデルと性能基準が両立しない** ことが分かったので、AGENTS.md §4 に従って作業を止めた (`escalations.md` の E-002)。

## 変更内容

| ファイル                   | 内容                                                                                                                                                                                                                                                                                                    |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tools/run-bench.mjs`      | 引数 `--scene <name\|all>` `--count` `--backend` `--build` `--headless` `--no-compare`。プロジェクトの vite.config.ts と define の上書き (`__PARALLEL__` を `--build` に合わせ、`__DEBUG__` = false)。WebGPU と vsync 解除のフラグ付きで headed 起動。結果は配列で保存し、保存後に compare-bench を呼ぶ |
| `tools/compare-bench.mjs`  | `(scene, backend, build, count)` が一致する要素同士で、p99Ms・cpuMs・metrics の `*Ms` を比較し、10% 超の悪化で exit 1。空なら exit 0、不正な JSON や配列でなければ exit 1、未登録は「新規」で exit 0                                                                                                    |
| `bench/bench-types.ts`     | `BenchContext` (`metrics` / `sample` / `now`)、`BenchScene.defaultCount`、`BenchResult` (`crossOriginIsolated`・`cpuMs`・`metrics`)                                                                                                                                                                     |
| `bench/runner.ts`          | シーンを `import.meta.glob` で動的に読み込む。フレーム時間と step の CPU 時間を分けて計測し、パーセンタイルは `ceil(p×n)−1`                                                                                                                                                                             |
| `bench/scenes/ecs-move.ts` | spawn・set・get を各 100 万回計時して metrics に記録。移動カーネルは SerialScheduler 経由で実行し、毎フレーム sample に記録。`as unknown as` と毎フレームのクロージャ生成を除去                                                                                                                         |
| `bench/baseline.json`      | 根拠のない旧値を削除して `[]`                                                                                                                                                                                                                                                                           |
| `package.json` / 11 §3     | `bench` を `node tools/run-bench.mjs` に変更 (pnpm は引数をスクリプトの末尾に付けるため、比較は run-bench から呼ぶ)                                                                                                                                                                                     |
| `eslint.config.js`         | Node のグローバルに `URLSearchParams` を追加                                                                                                                                                                                                                                                            |
| 10 §5                      | `BenchResult.crossOriginIsolated`、metrics のキーの規則 (`*Ms` だけを比較する)                                                                                                                                                                                                                          |

## 受け入れ条件の確認

1. **build の記録**: `pnpm bench --scene empty --build embed` と `--build parallel` の結果は次のとおりで、どちらも crossOriginIsolated が記録された (成功)。
   - embed → `"build": "embed"`
   - parallel → `"build": "parallel"`, `"crossOriginIsolated": true`
2. **vsync の解除: 未達 (環境の制約)**
   - `empty` の p50 は次のとおりで、どれも 60Hz (16.7ms) から下がらなかった。
     - headed: embed 17.505ms / parallel 17.545ms
     - headless: 17.545ms
   - WSLg では `--disable-gpu-vsync --disable-frame-rate-limit` が効かない。基準機での確認が必要 (E-002)。
3. **compare-bench**: スクラッチ領域で 8 ケースを確認し、すべて期待どおりだった。
   - 空: exit 0
   - 悪化 (exit 1): p99Ms +15% / cpuMs +15% / metrics.spawnMs +11%
   - +9%: exit 0 (checksum は比較対象外)
   - 未登録の構成: 「新規」で exit 0
   - 不正な JSON: exit 1
   - 配列でない: exit 1
4. **ECS ベンチ: 未達**
   - WSL2 での参考値 (100 万):

     | ビルド   | spawnMs | setMs | getMs | moveKernelP99Ms |
     | -------- | ------- | ----- | ----- | --------------- |
     | embed    | 223.2   | 45.2  | 30.1  | 18.82           |
     | parallel | 251.4   | 55.3  | 41.9  | 188.96          |

   - 基準 (spawn ≤ 150 / get・set ≤ 30 / カーネル ≤ 2.0) を満たさない。
   - 主な原因は、伸長可能なバッファ上のビューの要素アクセスが V8 で遅いこと。Node 22 での比較では、通常の ArrayBuffer の 2.57ms に対し、resizable は 8.11ms、growable SAB は 121.48ms だった。
   - これは 04 §1.1 のメモリモデル自体の問題なので、仕様の判断を仰いでいる (E-002)。
   - ベースラインは登録していない。
5. **`pnpm verify`: 全 7 段階で成功**

   | 段階             | 結果                                               |
   | ---------------- | -------------------------------------------------- |
   | check:structure  | 成功                                               |
   | check:boundaries | 成功                                               |
   | check:rules      | 成功                                               |
   | typecheck        | 成功                                               |
   | lint             | 成功                                               |
   | format:check     | 成功                                               |
   | test:coverage    | 成功 (196 件、全体 lines 99.41% / branches 95.36%) |

## 未解決

- E-002 の回答待ち (メモリモデル、vsync の解除方法、基準機での計測)。
- git 管理外のため、コミットは行っていない。

## E-002 対応 (2026-10-06、ユーザー回答「1」)

メモリモデルを「固定長バッファ + 伸長時コピー + Worker への再送」に変更した (D-20、04 §1.1・§4.1・§4.2、05 §3.3、02、09 §4.5)。

| ファイル                                   | 変更                                                                                                                         |
| ------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------- |
| `core/memory/buffer-factory.ts`            | `createBackingBuffer(bytes)` は固定長の ArrayBuffer / SharedArrayBuffer を作る。`growBackingBuffer` は削除                   |
| `core/ecs/column.ts`                       | 伸長時は 2 倍の新しいバッファにコピーして `buffer` / `data` を差し替える (戻り値 = 作り直したか)。ミラー用の `rebind` を追加 |
| `core/ecs/archetype.ts`                    | entities も同様に作り直す。`bufferVersion` と伸長の通知、ミラー用の `rebindShared` を追加                                    |
| `core/ecs/archetype-graph.ts` / `world.ts` | 伸長の通知で `structureVersion` を進める                                                                                     |
| `core/ecs/change-tracking.ts`              | 固定長バッファ (最大行数分を最初に確保。小さいので伸長しない)                                                                |
| `jobs/threaded-scheduler.ts`               | `bufferVersion` が変わったアーキタイプを送り直す                                                                             |
| `jobs/worker-entry.ts`                     | 既存のミラーは `rebindShared` で差し替える (クエリが持つ参照を保つ)                                                          |

テスト: 旧仕様 (伸長前のビューで読める) の 2 件を新仕様のテストに置き換え、次を追加した。

- 伸長でデータが保たれる
- `bufferVersion` が進み、通知が呼ばれる
- ミラーが `rebindShared` で追従する
- World の `structureVersion` が伸長で進む
- バッファが伸長不可である

### 計測 (WSL2 の Chromium。参考値。100 万エンティティ)

| 項目            | embed 変更前 → 後 | parallel 変更前 → 後 | 基準  |
| --------------- | ----------------- | -------------------- | ----- |
| moveKernelP99Ms | 18.82 → 8.47      | 188.96 → 14.91       | ≤ 2.0 |
| spawnMs         | 223.2 → 154.2     | 251.4 → 157.5        | ≤ 150 |
| setMs           | 45.2 → 27.0       | 55.3 → 29.1          | ≤ 30  |
| getMs           | 30.1 → 26.7       | 41.9 → 41.0          | ≤ 30  |

- Node 22 で同じ計測をすると、固定長 SAB の p50 は 3.48ms、通常の ArrayBuffer は 2.42ms だった (growable SAB は 96.9ms)。
- このマシンでは、単純ループ (通常の ArrayBuffer) 自体の p99 が 5.7ms かかる。そのため基準の判定は基準機で行う。

### pnpm verify (変更後)

全 7 段階が成功。テストは 192 件で、全体のカバレッジは lines 99.51% / branches 95.6%。

### 残る作業 (基準機が必要)

1. `pnpm bench --scene empty` で vsync が解除されるか (p50 が 1000 / リフレッシュレートより明確に小さいか) を確認する。
2. `pnpm bench --scene ecs-move --build embed` と `--build parallel` で 04 §10 の基準を判定し、満たせばベースラインに登録する (`pluto-perf`)。
