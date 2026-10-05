# T-2.2: 並列スケジューラ (Phase 2)

## 目的
Worker スレッドを用いて ECS カーネル関数を並列に実行する仕組み（ThreadedScheduler）を実装する。

## 編集・作成するファイル
- `src/jobs/sync.ts` (新規作成)
- `src/jobs/worker-protocol.ts` (新規作成)
- `src/jobs/worker-entry.ts` (新規作成)
- `src/jobs/threaded-scheduler.ts` (新規作成)

## 実装ステップ
1. **sync.ts の実装**: `SharedArrayBuffer` ベースの制御ブロック（CTRL_EPOCH, CTRL_KERNEL_ID等）のレイアウト定数を定義。
2. **worker-protocol.ts の実装**: メインと Worker 間のメッセージ（init, archetype, query, buffer, ready）の型定義と、受信データの展開ロジック。
3. **worker-entry.ts の実装**: Worker のエントリポイントを実装。Atomics.wait で待機し、Atomics.add でチャンクを奪い合って `kernel.fn` を実行するループを作成。
4. **threaded-scheduler.ts の実装**: `Scheduler` インターフェースを実装。Worker の生成と同期プロトコルの送信、World更新時の差分（Archetype, Query）送信、メインスレッド側からのチャンク処理と終了待機スピンを実装。
5. **テスト作成**: T-2.3 で結合パリティテストを行うため、ここでの単体テストは可能な範囲で実施するかスキップし、T-2.3 への結合を主眼に置く。

## 完了条件
- `ThreadedScheduler` などのクラス・関数が `docs/05-jobs-and-builds.md` §3.2-3.3 に従って実装されている。
- Lint、Typecheck、Format がすべて成功している。
