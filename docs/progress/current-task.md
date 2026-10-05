# T-2.1: カーネル・直列スケジューラ (Phase 2)

## 目標

ジョブシステムの基盤となる `Kernel`, `Scheduler` のインターフェースと、直列実行を行う `SerialScheduler` の実装。

## 実装対象ファイル

- `src/jobs/index.ts`
- `src/jobs/kernel.ts`
- `src/jobs/kernel-registry.ts`
- `src/jobs/scheduler.ts`
- `src/jobs/serial-scheduler.ts`

## 参照ドキュメント

- `docs/05-jobs-and-builds.md` §2〜3.1
- `docs/02-directory-structure.md`

## やること

1. `src/jobs/kernel.ts`:
   - `KernelId`, `KernelBuffers`, `KernelFn`, `KernelDef` インターフェースの定義。
   - `defineKernel` 関数の実装。
   - `KernelBufferSlot` の定義。
2. `src/jobs/kernel-registry.ts`:
   - 定義されたすべての Kernel を管理し、ID から Kernel を引けるようにするレジストリを実装。
   - `defineKernel` で登録される仕組みを作る。
3. `src/jobs/scheduler.ts`:
   - `Scheduler` インターフェースの定義 (`concurrency`, `syncWorld`, `registerBuffer`, `runKernel`, `dispose`)。
4. `src/jobs/serial-scheduler.ts`:
   - `SerialScheduler` の実装。
   - `concurrency = 1`。
   - `registerBuffer` で `u32`, `f32`, `i32` のバッファを管理。
   - `runKernel` で `query.chunkCount()` 回数分 `query.getChunk()` を呼んでカーネルを直列実行。
   - `syncWorld` / `dispose` は特に何もしない。
5. ユニットテストの作成 (`tests/unit/jobs/`)
   - `kernel.test.ts`
   - `serial-scheduler.test.ts`
6. `pnpm verify`, カバレッジチェックを通す。

## 受け入れ条件

- 各ファイルの型や定数が `docs/05-jobs-and-builds.md` の仕様と一致している。
- `SerialScheduler.runKernel` が正しくチャンクをイテレートし、カーネル関数を呼び出す。
- `registerBuffer` で登録されたバッファがカーネルの第3引数に正しく渡される。
- ユニットテストが全てパスし、要件カバレッジを満たす。
