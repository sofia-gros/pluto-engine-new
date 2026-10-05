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

export function defineKernel(name: string, fn: KernelFn): KernelDef;

/** 共有バッファの固定スロット番号 (追加はタスクの指示がある場合のみ)。 */
export const KernelBufferSlot = {
  SpriteStagingU32: 0,  // u32[0]: スプライトステージング (u32 ビュー)
  SpriteStagingF32: 0,  // f32[0]: 同じバッファの f32 ビュー
  SpriteDirtyBits: 0,   // i32[0]: 64 スロット単位の dirty ビット (Atomics.or で立てる)
  CullOutput: 1,        // u32[1]: CPU カリング結果
  CullCounters: 1,      // i32[1]: CPU カリングのビン別カウンタ (Atomics.add)
} as const;
```

- 共有バッファは初期化時に `scheduler.registerBuffer(kind, slot, typedArray)` で登録する。parallel では `createBackingBuffer` 由来 (SAB) でなければならない。

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
  registerBuffer(kind: 'u32' | 'f32' | 'i32', slot: number, array: Uint32Array | Float32Array | Int32Array): void;
  /** クエリの全チャンクに対してカーネルを実行し、完了まで戻らない。 */
  runKernel(kernel: KernelDef, query: Query, params: Float32Array): void;
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
- Worker 生成: `import WorkerCtor from './worker-entry?worker&inline';` (インライン化で配信の手間をなくす)。
- 共有制御ブロック `Int32Array(SharedArrayBuffer)` のレイアウト (`sync.ts` に定数で定義):

| index | 名前 | 内容 |
|-------|------|------|
| 0 | `CTRL_EPOCH` | ジョブ世代。メインが +1 して `Atomics.notify` |
| 1 | `CTRL_KERNEL_ID` | 実行するカーネル ID |
| 2 | `CTRL_QUERY_ID` | クエリ ID |
| 3 | `CTRL_NEXT_CHUNK` | 次に取るチャンク番号 (`Atomics.add` で取得) |
| 4 | `CTRL_TOTAL_CHUNKS` | 総チャンク数 |
| 5 | `CTRL_DONE_CHUNKS` | 完了チャンク数 |
| 6 | `CTRL_SHUTDOWN` | 1 で終了 |
| 8〜71 | `CTRL_PARAMS` | パラメータ (Float32 として再解釈) |

- 実行手順:
  1. メイン: params 書込 → NEXT=0, DONE=0, TOTAL 設定 → EPOCH+1 → `Atomics.notify(ctrl, CTRL_EPOCH)`
  2. 各 Worker (`Atomics.wait` で待機中) と **メイン自身** がチャンクを `Atomics.add(ctrl, CTRL_NEXT_CHUNK, 1)` で取り合って処理し、`Atomics.add(ctrl, CTRL_DONE_CHUNKS, 1)`
  3. メイン: 自分の取るチャンクが尽きたら `DONE === TOTAL` までスピン (`Atomics.load`)
- チャンク数が 2 未満のときは Worker を起こさずメインだけで実行する (起床コストの方が高い)。

### 3.3 Worker 同期プロトコル (`worker-protocol.ts`)

`postMessage` はコールドパスのみ:

| メッセージ | 方向 | 内容 |
|-----------|------|------|
| `init` | メイン→Worker | 制御ブロック SAB |
| `archetype` | メイン→Worker | アーキタイプ ID、フィールド ID → カラム SAB の対応、entities SAB |
| `query` | メイン→Worker | クエリ ID → 対象アーキタイプ ID 列 |
| `buffer` | メイン→Worker | `registerBuffer` された共有バッファ (kind, slot, SAB, byteOffset, length) |
| `ready` | Worker→メイン | 初期化完了 |

- growable SAB の伸長は他スレッドから見える (再送不要)。アーキタイプ・クエリの **新規作成** 時のみ `syncWorld` で送る。
- Worker 側は受け取った情報で `Archetype` の読み取り専用ミラーを作り、`ChunkView` を構築する。

### 3.4 create-scheduler.ts (唯一の選択場所)

```ts
export function createScheduler(config: { maxWorkers?: number }): Scheduler {
  if (__PARALLEL__ && globalThis.crossOriginIsolated === true) {
    return new ThreadedScheduler(config);
  }
  if (__PARALLEL__) logger.warn('crossOriginIsolated ではないため直列実行に縮退します。COOP/COEP ヘッダを設定してください。');
  return new SerialScheduler();
}
```

- `__PARALLEL__ === false` のビルドでは `ThreadedScheduler` と Worker コードがツリーシェイクで **完全に消える** こと (`tools/check-bundle.mjs` で検査)。

## 4. ビルド定数 (`src/build-flags.d.ts`)

```ts
declare const __PARALLEL__: boolean; // parallel ビルドで true
declare const __DEBUG__: boolean;    // 開発・テストで true、本番ビルドで false
declare const __VERSION__: string;   // package.json の version
```

| 実行環境 | `__PARALLEL__` | `__DEBUG__` |
|----------|----------------|-------------|
| `vite build --mode parallel` | true | false |
| `vite build --mode embed` | false | false |
| `vite build --mode parallel-debug` | true | true |
| `vite build --mode embed-debug` | false | true |
| vitest | false | true |
| `vite` dev server (ブラウザテスト) | true (dev server は COOP/COEP ヘッダを送る) | true |
| `vite preview` (ベンチ、ビルド成果物を配信) | ビルドに従う | false |

> [!NOTE]
> embed 版の動作確認は dev server ではなく **embed ビルドの成果物** に対して行う (`pnpm test:browser:embed`)。

## 5. 出力

| ファイル | 内容 |
|----------|------|
| `dist/parallel/pluto.js` | parallel リリース (ESM) |
| `dist/parallel/pluto.debug.js` | parallel デバッグ |
| `dist/embed/pluto.js` | embed リリース (ESM) |
| `dist/embed/pluto.debug.js` | embed デバッグ |
| `dist/types/` | 型定義 (`tsc --emitDeclarationOnly`) |

`package.json` の `exports`:

```json
{
  ".": { "types": "./dist/types/index.d.ts", "default": "./dist/embed/pluto.js" },
  "./parallel": { "types": "./dist/types/index.d.ts", "default": "./dist/parallel/pluto.js" },
  "./embed": { "types": "./dist/types/index.d.ts", "default": "./dist/embed/pluto.js" },
  "./lowlevel": { "types": "./dist/types/lowlevel.d.ts", "default": "./dist/embed/pluto-lowlevel.js" }
}
```

既定 (`.`) は **embed** (どこでも動く方を既定にする)。
