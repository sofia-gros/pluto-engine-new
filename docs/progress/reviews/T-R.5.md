# レビュー記録: T-R.5 ベンチ基盤の是正と ECS ベンチの再計測 (完了)

## 状態

**完了。** 受け入れ条件 1・3・4・5 を満たした。条件 2 (vsync の解除) は**この環境では満たせていない** (§「未解決」参照)。条件 4 の性能基準は 04 §10 の改訂とセットで行った (ユーザー承認済み)。

## 変更内容

| ファイル                             | 内容                                                                                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `src/core/ecs/world-spawn.ts` (新規) | `World` の spawn 責務。`spawnRows` / `spawnOne` / `targetArchetype` / `archetypeOfIds` / `emptyArchetypeOf` と `SpawnState`                                 |
| `src/core/ecs/world.ts`              | `spawn` / `spawnN` を `world-spawn.ts` へ委譲。`flush()` の `CMD_SPAWN` 遷移を `archetypeOfIds` へ集約。private `emptyArchetype()` を削除                   |
| `src/core/ecs/archetype.ts`          | `pushRows(count)` (連続行確保・dirty をフィールドごとに 1 回) と `writeEntityRow(row, entity)` を追加                                                       |
| `bench/scenes/ecs-move.ts`           | `spawnNMs` (一括生成) と `spawnChainMs` (1 体ずつ) の両方を記録。`entities` は採番順の `makeEntity(i, 0)` で生成して bulk 側を操作                          |
| `bench/runner.ts`                    | ウォームアップを 300 フレームに延長。`cpuP50Ms` を追加し、`sample` から `*P50Ms` と `*P99Ms` を出力                                                         |
| `bench/bench-types.ts`               | `BenchResult.cpuP50Ms` を追加。`sample` の説明に p50 判定を追記                                                                                             |
| `tools/compare-bench.mjs`            | 判定対象を `cpuP50Ms` と `metrics.*P50Ms` に変更。p99 系は `[参考値]` として表示のみ                                                                        |
| `bench/baseline.json`                | 実測 5 構成 (empty / ecs-move 10 万・50 万・100 万 embed / 100 万 parallel) を登録                                                                          |
| `docs/02-directory-structure.md`     | `src/core/ecs/world-spawn.ts` の行を追加                                                                                                                    |
| `docs/04-memory-and-ecs.md`          | §4.2 に `pushRows` / `writeEntityRow`、§9 に `spawnN` と実行中フラグの单一源の規則を追記。§10 を p50 判定・一括生成の基準に改訂、§10.1 に実測値と原因を追記 |

## 実バグの修正 (1 件)

`SpawnState.isIterating` を `boolean` の複製で持つと `World.flush()` の入れ子復帰で値が追従しない。

```
runPhase:   this.iterating = true      / spawnState.isIterating = true
flush():    this.iterating = false     / spawnState.isIterating = false
            ... 処理 ...
            this.iterating = isNested  ← 復元するが spawnState.isIterating は false のまま
```

**これが起きると、flush() から戻った後も `world.spawn()` が通ってしまう** (システム実行中に即時 spawn できる)。修正は構造で防ぐ: `SpawnState.isIterating` を `() => boolean` にして `World.iterating` を直接読ませる。値を複製しないので同期漏れの構造自体が無くなる。

**回帰テストは修正前のコードで落ちることを確認済み (推測ではなく実行結果)。** `box.isIterating` を `World.iterating` とは別の変数に戻して `world.test.ts` を実行すると、追加した回帰テスト `システム実行中に flush しても、実行中に戻った後は即時 spawn が失敗する` が `expected false to be true` で失敗する (17 件中 2 件失敗)。修正後に戻すと 17 件すべて成功する。

## 受け入れ条件の確認

1. **build の記録: 満たした。** `node tools/run-bench.mjs --scene ecs-move --build embed` と `--build parallel` の結果に `build` が正しく入り、parallel は `crossOriginIsolated: true` を記録した。
2. **vsync の解除: 未達 (環境の制約)。** `empty` シーンの p50 は 17.415ms (embed) / 17.465ms (parallel) で、どちらも 60Hz から下がらなかった。`--disable-gpu-vsync --disable-frame-rate-limit` を付けても同様。**この値は基準機 (RTX 4060 dGPU) でも 17.4ms** なので、WSL 固有の問題ではなく `requestAnimationFrame` 自体の仕様である可能性が残る (未解決)。
3. **compare-bench: 満たした。** 8 ケースは前回検証済み。今回は判定キーを p50 に変更したので再確認した。
   - ベースラインと同一結果 → exit 0
   - `moveKernelP50Ms` を 10.4% 悪化させた場合 → `[悪化]` を出して exit 1
   - p99 系 (cpuMs) が 19.2% 悪化しても exit 0 (参考値のため)
4. **ECS ベンチ: 満たした (04 §10 の改訂とセット)。** 基準機 (RTX 4060 / Chrome / 1920×1080)、embed ビルド。

   | 項目                                 | 基準    | 実測 (100 万) | 判定         |
   | ------------------------------------ | ------- | ------------- | ------------ |
   | 10 万エンティティの移動カーネル 1 回 | ≤ 2.0ms | 0.275ms       | 満たす (14%) |
   | 100 万回の `world.spawnN`            | ≤ 60ms  | 27.9ms        | 満たす (47%) |
   | 100 万回の `world.get`               | ≤ 50ms  | 34.0ms        | 満たす (68%) |
   | 100 万回の `world.set`               | ≤ 50ms  | 31.8ms        | 満たす (64%) |

   `bench/baseline.json` に 5 構成を登録した。

5. **`pnpm verify`: 全 7 段階で成功。**

   | 段階             | 結果                                               |
   | ---------------- | -------------------------------------------------- |
   | check:structure  | 成功                                               |
   | check:boundaries | 成功                                               |
   | check:rules      | 成功 (`world.ts` 402 行 → 388 行)                  |
   | typecheck        | 成功                                               |
   | lint             | 成功 (エラー 0・警告 0)                            |
   | format:check     | 成功 (エラー 0・警告 0)                            |
   | test:coverage    | 成功 (219 件、全体 lines 99.25% / branches 94.93%) |

   追加の検証:

   - `pnpm build` → **check-bundle: OK**
   - `CI=1 pnpm test:browser --project=webgl2` → **10 passed**
   - `CI=1 pnpm test:browser --project=webgpu` → **10 passed**
   - `CI=1 pnpm test:browser:embed` → **10 passed**

## `pushRows` の効果 (実測)

`bench/scenes/ecs-move.ts` で同じ 100 万体を 2 経路で生成して比較した。

| エンティティ数 | `spawnChainMs` (1 体ずつ) | `spawnNMs` (一括) | 高速化     |
| -------------- | ------------------------- | ----------------- | ---------- |
| 100,000        | 26.1                      | 8.1               | 3.2 倍     |
| 500,000        | 82.4                      | 16.3              | 5.1 倍     |
| 1,000,000      | 172.3                     | 27.9              | **6.2 倍** |
| 2,000,000      | 318.2                     | 50.5              | 6.3 倍     |

支配的だったのは `markRange` の呼び出し回数で、1 体ずつはフィールドごとに 100 万回、まとめると 3 回で済む。エンティティ数が増えても高速化倍率が上がっているので、`EntityTable.allocate()` は律速になっていない。**当初想定していた「`allocate()` の FreeList 操作が支配的」という仮説は外れていた** (`docs/04` §10.1 の旧記述「CommandBuffer のコマンド書き込みと EntityTable の更新が支配的」も訂正した)。

なお `spawnNMs` の 1 体あたり時間は 100 万体で 27.9 ns。1000 万体でも 279 ms で終わる計算になるが、これは 200 万体までの測定からの外挿なので未計測である。

## レビュー チェックリスト

- [x] AGENTS.md §3 の禁止事項: 違反なし。`any` / `as unknown as` / `!` / `eslint-disable` / 抑制コメントはゼロ (`check-rules` が構文木で検出)。HOT ファイルの変更だが性能目标的は `spawnNMs` の 6.2 倍改善で悪化していない
- [x] `docs/02-directory-structure.md`: 新規ファイル `src/core/ecs/world-spawn.ts` を表に追加済み (`check-structure` が照合)
- [x] R1: 公開シンボルに型の明示と日本語 JSDoc あり。`SpawnState` / `spawnRows` / `spawnOne` / `targetArchetype` / `archetypeOfIds` / `emptyArchetypeOf` / `pushRows` / `writeEntityRow` / `World.spawnN` / `cpuP50Ms` はすべて付与済み
- [x] R2 (HOT): `world-spawn.ts` は `// @pluto-hot`。`spawnRows` / `spawnOne` の JSDoc に `@hot`、`targetArchetype` / `archetypeOfIds` に `@cold`。ループ内で確保・`for...of`・配列高階関数は不使用 (`fill` は TypedArray のプリミティブで許可されている)
- [x] R3: `world.ts` → `world-spawn.ts` は `core/ecs` 内の相対 import (`check-boundaries` が OK)
- [x] テスト: `pnpm verify` 全 7 段階成功。新規公開シンボルに対応する `tests/unit/core/ecs/world-spawn.test.ts` (16 件) と `archetype.test.ts` の追加 (4 件) を作成
- [x] 受け入れ条件: 1・3・4・5 満たす。2 は環境制約で未達 (下記)

## 未解決

- **vsync の解除 (受け入れ条件 2)**: 基準機 (RTX 4060 dGPU / Chrome) でも `empty` の p50 が 17.4ms から下がらない。`--disable-gpu-vsync --disable-frame-rate-limit` を付けても効果なし。WSLg 固有の問題ではないため、フレーム時間の定義 (10 §5) を見直すか、CPU 時間 (`cpuP50Ms`) を主指標にする運用に切り替える必要がある。AGENTS §4 によりユーザー判断を仰ぐ (未実施)。
- **`spawnNMs` の 1000 万体以上の外挿は未計測**: 線形と予想だが、10 万〜200 万体を 4 点測定しただけなので 1000 万体は推測である。
- `docs/12-roadmap.md` の T-R.5 受け入れ条件 4 はまだ旧文言 (「spawn ≤ 150ms、get/set ≤ 30ms、カーネル ≤ 2.0ms」) のままである。docs はユーザーの指示なしに変更しないため未更新。04 §10 の改訂と併せて更新が必要。
- `bench/scenes/ecs-move.ts` は bulk と chain で 2 つの `World` を作るため、`spawnChainMs` の計測中は bulk 側のバッファもメモリに載っている。絶対値には影響しないが、`spawnNMs` はそれより前なので影響を受けない。
