# レビュー記録: T-R.4 jobs の再実装と World 連携

## チェックリスト結果

- [x] `AGENTS.md` §3 の禁止事項を破っていない
  - 変更したのは次の範囲のみ: `src/jobs/**` (全面改修)、`src/worker-main.ts` (新規、02 §4 に記載済み)、`src/core/ecs/component.ts`・`archetype.ts` とそのテスト (ロードマップで範囲に追加)、`src/lowlevel.ts`、`vitest.config.ts` (10 §2 の除外表どおりに `worker-main.ts` を追加)、`eslint.config.js` (import 名に PascalCase を許可。05 §3.2 の `WorkerCtor` のため)、docs
- [x] チェックを弱めていない
  - ESLint の変更は、仕様書で定められた名前 (`WorkerCtor`) を使うための最小限
  - カバレッジ除外は 10 §2 の表に既に載っているファイルのみ
- [x] R1〜R3: `src/jobs/**` の check-structure / boundaries / rules は 0 件、lint は全体で 0 件。旧実装の `as unknown as` 5 件はすべて除去
- [ ] `pnpm verify` 成功: Phase R の規定により失敗を許容。残りは `bench/scenes/ecs-move.ts` だけ (T-R.5)
- [x] ロードマップ T-R.4 の受け入れ条件: 下記

## 設計の見直し (05 を再改訂)

実装前の設計で、改訂版 05 の 2 つの欠陥に気づいたので直した。

1. **前ジョブとの競合**
   - 改訂版の方式: `CTRL_ACTIVE` で Worker の参加数を数えて待つ。
   - 残っていた隙間: 起床の遅れた Worker が、メインが次ジョブのフィールドを書いている最中に読む可能性がある。
   - 新しい方式: NEXT / DONE カウンタの上位 15 ビットにジョブ番号を入れ、`compareExchange` で取得・完了する。
     - メインはフィールドを書いた後、最後に NEXT を書く。Worker は NEXT を読んでからフィールドを読む。
     - これで、チャンクを取れた Worker が読んだフィールドは必ずそのジョブのものになる。
     - 古いジョブの取得・完了は印の不一致で弾かれる。例外の後に残った完了報告も無視される。
   - `CTRL_ACTIVE` は廃止した (05 §3.2)。
2. **コンポーネント ID の不一致**
   - 問題: ID は `defineComponent` の呼び出し順で決まるので、メインと Worker でモジュールの評価順が違うとカーネルが別のカラムを読む。
   - 対策 (05 §3.3, 04 §3.1):
     - init でメインのコンポーネント表を送り、Worker は名前で ID を合わせ直す (`applyComponentLayout`)。フィールドトークンを同じオブジェクトのまま書き換えるので、カーネルが持つトークンも正しくなる。
     - コンポーネント名は一意にした。
     - ミラー (`fromShared`) は desc だけから作り、Worker のレジストリに依存しない。

その他の変更:

- `ready` は情報のみにした。メインはメインスレッドをブロックして待てないため。
- `synced` メッセージは廃止した。参加の可否は `CTRL_SYNC_VERSION` だけで判定できるため。
- テスト用に `createWorker` を注入できるようにした。

## 実装の要点

| ファイル                           | 内容                                                                                                                                                                                                                                         |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `kernel.ts` / `kernel-registry.ts` | ID = 名前の FNV-1a 32 ビット (UTF-16 コード単位)。同名・衝突は `InvalidArgument`。`findKernel` (Worker の参加判定用)。`MAX_KERNEL_PARAMS` を core から再公開                                                                                 |
| `sync.ts`                          | 制御ブロックの定数 (05 §3.2 の表)、`tagged` / `claimChunk` / `completeChunk` / `doneCount`                                                                                                                                                   |
| `scheduler.ts`                     | `Scheduler extends KernelExecutor`。`runKernel(KernelRef, …)` はカーネルを ID でレジストリから引く                                                                                                                                           |
| `serial-scheduler.ts`              | params を 64 要素の 0 埋めバッファで渡す (Threaded と同じ)。65 要素以上は例外                                                                                                                                                                |
| `worker-entry.ts`                  | `runWorkerLoop(port)`: `Atomics.waitAsync` によるイベント駆動、同期メッセージの適用、参加判定 (同期バージョン・クエリ・カーネルの有無) をチャンク取得の **前** にすべて行う。ミラーには本物の `Query` を使い、メインと同じチャンク分割にする |
| `threaded-scheduler.ts`            | 印付きカウンタ、ARCH_COUNTS、`CTRL_ERROR` による例外の伝播 (スピンを抜けて `PlutoError(InvalidState)`)、`__DEBUG__` のスピン上限、SAB の検査、クエリの対象が増えたら再送                                                                     |
| `src/worker-main.ts`               | `self` を `WorkerPort` に包んで `runWorkerLoop` を呼ぶ                                                                                                                                                                                       |
| `jobs/index.ts`                    | 05 §2 の公開範囲 (`SerialScheduler`・レジストリ操作は公開しない)                                                                                                                                                                             |

## 受け入れ条件の確認

1. **Serial**: `tests/unit/jobs/serial-scheduler.test.ts`
   - 「params は常に 64 要素で、渡した値の後ろは 0 埋めされる」
   - 「境界値: 65 要素以上の params は PlutoError」
   - 「chunkIndex はクエリ全体の通し番号」(CHUNK_ROWS + 10 行 + 別アーキタイプ 5 行 → [0,0,16384], [1,16384,16394], [2,0,5])
2. **defineKernel**: `kernel.test.ts`・`kernel-registry.test.ts`
   - 同名の再定義を拒否
   - 既知の衝突ペア `costarring` / `liquid` を拒否
   - 登録順を入れ替えても ID が同じ
   - FNV-1a の既知値 (`""`, `"a"`, `"foobar"`) と一致
3. **World 連携**
   - `world.test.ts` (T-R.3): 実行者への委譲、`structureVersion` の変化時だけ `syncWorld`、未設定時は `NotInitialized`
   - `serial-scheduler.test.ts`: 実際の SerialScheduler 経由で kernel システムが動き、`x += vx * dt` が反映される
   - コンポーネント表の整合: `component.test.ts`。評価順の違いを ID で合わせる、トークンの書き換え、表に無いコンポーネントの再採番、構成の不一致で例外
4. **ビルド**
   - `pnpm build` の parallel / embed / debug / 型定義はすべて成功。`check-bundle` の parallel 検査は、エントリが ThreadedScheduler を参照する T-2.3 まで失敗する (想定どおり)。
   - その代わりに、ThreadedScheduler 単体を parallel-debug でビルドする検証をスクラッチ領域で行った。出力には次が含まれており、Worker がインライン化されることを確認した。
     - Worker の Blob (`new Blob` / `createObjectURL`)
     - `runWorkerLoop`
     - `applyComponentLayout`
     - `Atomics.waitAsync`
     - `claimChunk`
   - Threaded の実際の動作 (パリティ・競合・例外・伸長) は T-2.3 のブラウザテストで検証する。
5. **検査**: `src/jobs/**` の check-structure / boundaries / rules は 0 件。

## pnpm verify の要約 (Phase R の途中なので失敗を許容)

| 段階             | 結果 | 内容                                                            |
| ---------------- | ---- | --------------------------------------------------------------- |
| check:structure  | 成功 |                                                                 |
| check:boundaries | 成功 |                                                                 |
| check:rules      | 失敗 | `bench/scenes/ecs-move.ts` の `as unknown as` 2 件 (T-R.5)      |
| typecheck        | 成功 |                                                                 |
| lint             | 成功 |                                                                 |
| format:check     | 失敗 | `bench/scenes/ecs-move.ts` (T-R.5)                              |
| test:coverage    | 成功 | 196 件。全体 lines 99.41% / branches 95.36%、jobs 100% / 93.75% |

## 未解決 / 申し送り

- T-2.3:
  - `createScheduler` の追加と、`lowlevel` からの公開 (これで `check-bundle` の parallel 検査が通る)
  - Threaded のブラウザテスト: テスト用カーネルを含む Worker を `createWorker` で注入する
- git 管理外のため、コミットは行っていない。
