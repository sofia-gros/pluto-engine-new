# 05. ジョブシステムと parallel / embed ビルド

## 1. 基本方針

- **1 つのコード、2 つのビルド**。`__PARALLEL__` (ビルド時定数) で切り替える。
- 並列化の単位は **チャンク** (`CHUNK_ROWS = 16384` 行)。
- 並列に実行できるのは **カーネル** (`Kernel`) だけ。カーネルは純粋関数で、`kernel-registry.ts` に登録された組込のもの。
- **メインスレッドも作業に参加する** (Atomics.wait はメインスレッドで使えないため、完了待ちは「自分も働き、最後に短くスピン」方式)。
- Serial と Threaded は **同じカーネル・同じチャンク分割** で動き、結果はビット単位で一致しなければならない (パリティテスト必須)。

## 2. Kernel (`src/jobs/kernel.ts`)

```ts
export type KernelId = number & { readonly __brand: 'KernelId' };

/** カーネルが参照できる共有バッファ表。index は `KernelBufferSlot` 定数で固定。 */
export interface KernelBuffers {
  readonly u32: readonly Uint32Array[];
  readonly f32: readonly Float32Array[];
  readonly i32: readonly Int32Array[]; // Atomics 用
}

/** カーネル本体。view の範囲だけを読み書きする純粋関数。 */
export type KernelFn = (view: ChunkView, params: Float32Array, buffers: KernelBuffers) => void;

export interface KernelDef {
  readonly id: KernelId;
  readonly name: string;
  readonly fn: KernelFn;
}

/** カーネルに渡すパラメータの最大要素数 (= 64)。core/ecs/system.ts で定義し、ここから再公開する (ecs は jobs を import できないため)。 */
export { MAX_KERNEL_PARAMS } from '../core/ecs';

/**
 * カーネルを定義し、レジストリに登録する。ID は name の FNV-1a 32bit ハッシュ
 * (登録順に依存しないので、メインと Worker で同じ ID になる)。
 * 名前の重複・ハッシュ衝突は PlutoError(InvalidArgument)。モジュールトップでのみ呼ぶ。
 */
export function defineKernel(name: string, fn: KernelFn): KernelDef;

/** 共有バッファの固定スロット番号 (追加はタスクの指示がある場合のみ)。 */
export const KernelBufferSlot = {
  SpriteStagingU32: 0, // u32[0]: スプライトステージング (u32 ビュー)
  SpriteStagingF32: 0, // f32[0]: 同じバッファの f32 ビュー
  SpriteDirtyBits: 0, // i32[0]: 64 スロット単位の dirty ビット (Atomics.or で立てる)
  CullOutput: 1, // u32[1]: CPU カリング結果
  CullCounters: 1, // i32[1]: CPU カリングのビン別カウンタ (Atomics.add)
} as const;
```

- 共有バッファは初期化時に `scheduler.registerBuffer(kind, slot, typedArray)` で登録する。parallel では `createBackingBuffer` 由来 (SAB) でなければならない (`ThreadedScheduler` は SAB でなければ `PlutoError(InvalidArgument)`)。
- `params` は **常に長さ `MAX_KERNEL_PARAMS` の `Float32Array`** としてカーネルに渡す (Serial / Threaded とも、スケジューラが自前の 64 要素バッファに 0 埋め + コピーして渡す)。65 要素以上は `PlutoError(InvalidArgument)`。
- 組込カーネルは `transform` / `render` / `physics` などの各モジュールが `defineKernel` で定義する。`kernel-registry.ts` は ID → `KernelDef` の表だけを持つ。Worker 側では `src/worker-main.ts` (§3.3) が全組込カーネルのモジュールを import して同じ表を作る。
- `jobs/index.ts` が公開するのは `createScheduler`、`defineKernel`、`MAX_KERNEL_PARAMS`、`KernelBufferSlot`、`runWorkerLoop` (使ってよいのは `src/worker-main.ts` だけ。`tools/check-boundaries.mjs` が検査) と型だけ (`SerialScheduler`・レジストリ操作・テスト用関数は公開しない。テストは内部ファイルを直接 import する)。

### カーネルの契約 (違反は不具合。レビューで必ず確認)

1. ECS カラムに書き込んでよいのは `view.start` 〜 `view.end - 1` の行だけ。
2. 共有バッファに書き込んでよいのは「その行が一意に所有する位置」(例: 行の `SpriteSlot.slot`) だけ。複数の行が同じ位置に触れうる場合 (ビットセット・カウンタ) は **必ず `Atomics.or` / `Atomics.add`** を使う (`Atomics` は非共有の TypedArray でも動くので serial でも同じコードでよい)。
3. グローバル変数・モジュール変数・クロージャの状態を **読み書きしない** (定数は可)。
4. パラメータは `params: Float32Array` (最大 `MAX_KERNEL_PARAMS = 64` 要素) で受け取る。`dt` は `params[0]` 固定。
5. 構造変更 (spawn/despawn) をしない。必要なら出力用カラムにフラグを書き、メインスレッドが後で処理する。
6. 乱数が必要なら、エンティティ index とフレーム番号から決定的に生成する (`hash32(index ^ frame)`)。
7. 出力の順序が実行順に依存する処理 (Atomics.add による追記など) は、後段で決定的な順序に並べ直す (例: CPU カリング結果はビン内を slot 昇順にソートしてからキー生成)。

## 3. Scheduler (`src/jobs/scheduler.ts`)

```ts
export interface Scheduler {
  /** 並列実行に使うスレッド数 (メイン含む)。Serial は 1。 */
  readonly concurrency: number;
  /** ワーカーへ World の共有メモリ情報を同期する (アーキタイプ・クエリの新規作成後に World が呼ぶ)。 */
  syncWorld(world: World): void;
  /** カーネル用共有バッファを登録する (初期化時のみ)。 */
  registerBuffer(
    kind: 'u32' | 'f32' | 'i32',
    slot: number,
    array: Uint32Array | Float32Array | Int32Array,
  ): void;
  /** クエリの全チャンクに対してカーネルを実行し、完了まで戻らない (kernel は ID でレジストリから引く。KernelDef も KernelRef を満たす)。 */
  runKernel(kernel: KernelRef, query: Query, params: Float32Array): void;
  /** ワーカーを終了する。 */
  dispose(): void;
}
```

### 3.1 SerialScheduler (`serial-scheduler.ts`)

```
for chunk in 0 .. query.chunkCount()-1:
  query.getChunk(chunk, view)
  kernel.fn(view, params)
```

### 3.2 ThreadedScheduler (`threaded-scheduler.ts`)

- Worker 数 = `min(navigator.hardwareConcurrency - 1, GameConfig.maxWorkers ?? 7)`、最低 1。
- Worker 生成: `import WorkerCtor from '../worker-main?worker&inline';` (インライン化で配信の手間をなくす。§3.3)。
- 共有制御ブロック `Int32Array(SharedArrayBuffer)` のレイアウト (`sync.ts` に定数で定義):

| index | 名前                | 内容                                                                         |
| ----- | ------------------- | ---------------------------------------------------------------------------- |
| 0     | `CTRL_EPOCH`        | ジョブ世代。メインが +1 して `Atomics.notify`                                |
| 1     | `CTRL_KERNEL_ID`    | 実行するカーネル ID (u32 を int32 として格納)                                |
| 2     | `CTRL_QUERY_ID`     | クエリ ID                                                                    |
| 3     | `CTRL_NEXT_CHUNK`   | 次に取るチャンク番号。**上位 15 ビット = ジョブ番号、下位 16 ビット = 番号** |
| 4     | `CTRL_TOTAL_CHUNKS` | 総チャンク数 (≤ `MAX_JOB_CHUNKS` = 65535)                                    |
| 5     | `CTRL_DONE_CHUNKS`  | 完了チャンク数。NEXT と同じくジョブ番号で印を付ける                          |
| 6     | `CTRL_SHUTDOWN`     | 1 で終了                                                                     |
| 7     | `CTRL_SYNC_VERSION` | このジョブに必要な同期バージョン (§3.3)                                      |
| 8〜71 | `CTRL_PARAMS`       | パラメータ (Float32 として再解釈、64 要素)                                   |
| 72    | `CTRL_ERROR`        | 0 = 正常、1 = Worker で例外発生                                              |

`CTRL_BLOCK_LENGTH = 73`。別に **アーキタイプ行数表** `ARCH_COUNTS: Int32Array(SAB, 65536)` を持ち、メインが runKernel のたびに対象クエリの各アーキタイプの `count` を書く (Worker は `Archetype.count` を直接読めないため)。

- 実行手順 (ジョブ番号 `seq` = ジョブ通番の下位 15 ビット):
  1. メイン: ERROR=0、KERNEL / QUERY / TOTAL / SYNC_VERSION / params / ARCH_COUNTS を書く → DONE=`seq<<16` → **最後に** NEXT=`seq<<16` → EPOCH+1 → `Atomics.notify(ctrl, CTRL_EPOCH)`
  2. Worker (`Atomics.waitAsync` で待機): 起床したら **先に NEXT を読んで `seq` を得て**、その後でジョブのフィールドを読む。適用済み同期バージョンが `CTRL_SYNC_VERSION` 未満なら今回は参加しない (メッセージ処理に戻る)。参加する場合は、**メイン自身** と一緒に `claimChunk` (NEXT の印が `seq` で、番号が TOTAL 未満なら `Atomics.compareExchange` で +1) でチャンクを取り合い、処理したら `completeChunk` (DONE の印が `seq` なら +1)
  3. メイン: 自分の取るチャンクが尽きたら `DONE === seq<<16 | TOTAL` になるか ERROR が立つまでスピン (`Atomics.load`)
  4. 印付きカウンタの意味: メインは前のジョブの完了を確認してからフィールドを書き、NEXT を最後に書く。そのため、NEXT の印を読んでからフィールドを読んだ Worker は必ずそのジョブのフィールドを読む。遅れて起きた Worker が古い印でチャンクを取ろうとしても `compareExchange` が失敗するので、前ジョブとの競合は起きない (メインが「Worker が手を離すまで待つ」必要はない)
  5. Worker で例外が出たら、その Worker は `CTRL_ERROR = 1` を書いて `error` メッセージを送る。メインはスピン中に ERROR を見て `PlutoError(InvalidState)` を投げる (無限スピンさせない)。例外後に残った古いジョブの完了報告は、印の不一致で無視される。`__DEBUG__` ではスピン回数の上限 (2^31) でも同じエラーにする
- チャンク数が 2 未満のときは Worker を起こさずメインだけで実行する (起床コストの方が高い)。

### 3.3 Worker 同期プロトコル (`worker-protocol.ts`)

`postMessage` はコールドパスのみ:

| メッセージ  | 方向          | 内容                                                                                                                                  |
| ----------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------- |
| `init`      | メイン→Worker | 制御ブロック SAB、ARCH_COUNTS SAB、コンポーネント表 (名前 → コンポーネント ID・フィールド ID)                                         |
| `archetype` | メイン→Worker | アーキタイプ ID、フィールド ID → カラム SAB の対応、entities SAB                                                                      |
| `query`     | メイン→Worker | クエリ ID → 対象アーキタイプ ID 列                                                                                                    |
| `buffer`    | メイン→Worker | `registerBuffer` された共有バッファ (kind, slot, SAB, byteOffset, length)                                                             |
| `ready`     | Worker→メイン | 初期化完了 (情報のみ。メインはメインスレッドをブロックして待てないので、未初期化の Worker は参加しないだけで正しさはメインが保証する) |
| `error`     | Worker→メイン | カーネル実行中の例外、またはコンポーネント表の不一致 (メッセージ文字列)                                                               |

- カラムや entities のバッファは伸長時に作り直される (`docs/04-memory-and-ecs.md` §1.1, §4.1)。`syncWorld` は `bufferVersion` が変わったアーキタイプの共有記述を送り直し、Worker は `Archetype.rebindShared()` でミラーのバッファを差し替える。
- `syncWorld` は `World.structureVersion` が変わったときに呼ばれ、**新規アーキタイプ・バッファを作り直したアーキタイプ** と、**新規クエリおよび対象アーキタイプが増えた既存クエリ** を送る。各メッセージには単調増加の `syncVersion` を付け、メインは送った最新値を `CTRL_SYNC_VERSION` に書く。
- Worker は `Atomics.wait` で **ブロックしない** (メッセージを受け取れなくなるため)。`Atomics.waitAsync(ctrl, CTRL_EPOCH, 前回値)` でイベント駆動にし、ジョブ処理の合間にメッセージを処理する。
- Worker 側は `Archetype.fromShared()` (`docs/04-memory-and-ecs.md` §4.2) で本物と同じクラスのミラーを作り、`ChunkView` をそのまま使う (型キャストでの代用は禁止)。行数は `ARCH_COUNTS` から読む。
- **コンポーネント ID の整合**: コンポーネント ID とフィールド ID は `defineComponent` の呼び出し順で決まるため、メインと Worker でモジュールの評価順が違うと ID がずれる。Worker は `init` で受け取ったコンポーネント表で、自分の定義の ID を **名前で合わせ直す** (`applyComponentLayout`, `docs/04-memory-and-ecs.md` §3.1)。同じ名前のフィールド構成が違う場合は `error` を送って参加しない。
- テストでは、テスト用カーネルを含む Worker を使うために `new ThreadedScheduler({ maxWorkers, createWorker })` で Worker の生成関数を注入できる (省略時は `../worker-main?worker&inline`)。
- **Worker のエントリは `src/worker-main.ts`** (ルート直下。`lowlevel.ts` と同じく全モジュールを import できる)。組込カーネルを含むモジュールを import してレジストリを満たし、`jobs/worker-entry.ts` の `runWorkerLoop()` を呼ぶ。`worker-entry.ts` 自身は副作用を持たない。

### 3.4 create-scheduler.ts (唯一の選択場所)

```ts
export function createScheduler(config: { maxWorkers?: number }): Scheduler {
  if (__PARALLEL__ && globalThis.crossOriginIsolated === true) {
    return new ThreadedScheduler(config);
  }
  if (__PARALLEL__)
    logger.warn(
      'crossOriginIsolated ではないため直列実行に縮退します。COOP/COEP ヘッダを設定してください。',
    );
  return new SerialScheduler();
}
```

- `__PARALLEL__ === false` のビルドでは `ThreadedScheduler` と Worker コードがツリーシェイクで **完全に消える** こと (`tools/check-bundle.mjs` で検査)。

## 4. ビルド定数 (`src/build-flags.d.ts`)

```ts
declare const __PARALLEL__: boolean; // parallel ビルドで true
declare const __DEBUG__: boolean; // 開発・テストで true、本番ビルドで false
declare const __VERSION__: string; // package.json の version
```

| 実行環境                                                | `__PARALLEL__`                              | `__DEBUG__` |
| ------------------------------------------------------- | ------------------------------------------- | ----------- |
| `vite build --mode parallel`                            | true                                        | false       |
| `vite build --mode embed`                               | false                                       | false       |
| `vite build --mode parallel-debug`                      | true                                        | true        |
| `vite build --mode embed-debug`                         | false                                       | true        |
| vitest                                                  | false                                       | true        |
| `vite` dev server (ブラウザテスト)                      | true (dev server は COOP/COEP ヘッダを送る) | true        |
| ベンチ (`tools/run-bench.mjs` が起動する Vite サーバー) | `--build` に従う (`parallel` → true)        | false       |

> [!NOTE]
> embed 版の動作確認は dev server 上の src ではなく **embed ビルドの成果物** に対して行う (`pnpm test:browser:embed`。ハーネスが `?build=embed` で `/dist/embed/pluto.debug.js` を読み込む。`docs/10-testing-strategy.md` §3)。
> dev server は `command === 'serve'` のとき `__PARALLEL__ = true`, `__DEBUG__ = true` を define する (mode 名から判定しない)。

## 5. 出力

| ファイル                       | 内容                                 |
| ------------------------------ | ------------------------------------ |
| `dist/parallel/pluto.js`       | parallel リリース (ESM)              |
| `dist/parallel/pluto.debug.js` | parallel デバッグ                    |
| `dist/embed/pluto.js`          | embed リリース (ESM)                 |
| `dist/embed/pluto.debug.js`    | embed デバッグ                       |
| `dist/types/`                  | 型定義 (`tsc --emitDeclarationOnly`) |

`package.json` の `exports`:

```json
{
  ".": { "types": "./dist/types/index.d.ts", "default": "./dist/embed/pluto.js" },
  "./parallel": { "types": "./dist/types/index.d.ts", "default": "./dist/parallel/pluto.js" },
  "./embed": { "types": "./dist/types/index.d.ts", "default": "./dist/embed/pluto.js" },
  "./lowlevel": {
    "types": "./dist/types/lowlevel.d.ts",
    "default": "./dist/embed/pluto-lowlevel.js"
  }
}
```

既定 (`.`) は **embed** (どこでも動く方を既定にする)。
