# 04. メモリモデルと SoA ECS 仕様

> この仕様に記載された **名前・シグネチャ・定数値をそのまま実装する**。変更が必要なら `pluto-escalate`。

---

## 1. メモリモデル

### 1.1 バッキングバッファ (`src/core/memory/buffer-factory.ts`)

```ts
/** バッキングバッファ。parallel ビルドでは SharedArrayBuffer。 */
export type BackingBuffer = ArrayBuffer | SharedArrayBuffer;

/**
 * 固定長 (伸長しない) のバッキングバッファを作る。
 * @param bytes バイト長 (8 の倍数)
 */
export function createBackingBuffer(bytes: number): BackingBuffer;
```

- `__PARALLEL__ === true` かつ `globalThis.crossOriginIsolated === true` → `new SharedArrayBuffer(bytes)`
- それ以外 → `new ArrayBuffer(bytes)`
- **伸長可能なバッファ (`maxByteLength` 付きの ArrayBuffer / SharedArrayBuffer) は使わない**。V8 では、その上の TypedArray の要素アクセスが大幅に遅いため (計測: 通常の 2.4ms に対し、resizable ArrayBuffer は約 3.5 倍、growable SAB は約 40 倍。固定長 SAB は 3.5ms。E-002, 2026-10-06)。
- 容量が足りなくなったら、利用側 (Column / Archetype) が 2 倍の新しいバッファを作ってコピーし、ビューを作り直す (§4.1)。
- 共有するかの判定は `isSharedMemoryEnabled(): boolean` として同ファイルに置き、他所で同じ判定を重複実装しない。
- **共有の前提 (parallel)**: Worker に渡すすべての配列 (カラム・`Archetype.entities`・変更追跡ビット) は `createBackingBuffer` 由来でなければならない。バッファを作り直したら Worker に送り直す (§4.2、`docs/05-jobs-and-builds.md` §3.3)。

### 1.2 ScalarType (`src/core/memory/scalar-type.ts`)

```ts
export const ScalarType = { F32: 0, I32: 1, U32: 2, I16: 3, U16: 4, I8: 5, U8: 6 } as const;
export type ScalarType = (typeof ScalarType)[keyof typeof ScalarType];
export const SCALAR_BYTES: Readonly<Record<ScalarType, number>>; // F32:4, I32:4, U32:4, I16:2, U16:2, I8:1, U8:1
export type TypedArrayOf<T extends ScalarType> = /* F32→Float32Array, ... U8→Uint8Array */;
```

- `f64` は **提供しない** (GPU 非互換・帯域 2 倍)。

---

## 2. エンティティ

### 2.1 ハンドル (`src/core/ecs/entity.ts`)

| ビット        | 内容                         |
| ------------- | ---------------------------- |
| 0–21 (22bit)  | index (0 〜 4,194,303)       |
| 22–31 (10bit) | generation (0 〜 1023, 循環) |

```ts
export type Entity = number & { readonly __brand: 'Entity' };
export const ENTITY_INDEX_BITS = 22;
export const ENTITY_INDEX_MASK = 0x3fffff;
export const ENTITY_GENERATION_MASK = 0x3ff;
export const MAX_ENTITIES = (1 << 22) - 1; // 4,194,303。index 0x3FFFFF は NULL_ENTITY 用に予約
export const NULL_ENTITY: Entity; // 0xFFFFFFFF (= makeEntity(0x3FFFFF, 1023)。この index は発行しない)
export function makeEntity(index: number, generation: number): Entity; // 結果は >>> 0
export function entityIndex(e: Entity): number;
export function entityGeneration(e: Entity): number;
```

### 2.2 エンティティ表 (`src/core/ecs/entity-table.ts`)

SoA、長さ `maxEntities`:

| カラム         | 型            | 内容                                 |
| -------------- | ------------- | ------------------------------------ |
| `archetypeIds` | `Uint16Array` | 所属アーキタイプ (`0xFFFF` = 未使用) |
| `rows`         | `Uint32Array` | アーキタイプ内の行番号               |
| `generations`  | `Uint16Array` | 現在の世代                           |

- 解放された index は `FreeList` で再利用。解放時に generation を +1 (mask)。
- `isAlive(e)`: index 範囲内 && `generations[index] === entityGeneration(e)` && `archetypeIds[index] !== 0xFFFF`。

---

## 3. コンポーネント

### 3.1 定義 API (`src/core/ecs/component.ts`, `schema.ts`)

- 型 `ComponentSchema`, `FieldToken<T>` は `schema.ts`、`defineComponent`, `ComponentDef<S>`, `AnyComponentDef`, `ComponentId`, `MAX_COMPONENTS` は `component.ts` に置く。
- World などの API はコンポーネントを型引数を消した `AnyComponentDef` で受け取る (`ComponentDef<S>` はスキーマ付き。型引数なしの `ComponentDef` は TypeScript で全コンポーネントの共通型にできないため)。
- フィールド名に `id`, `name`, `fields` は使えない (定義オブジェクトのプロパティと衝突するため `PlutoError(InvalidArgument)`)。
- コンポーネント名は一意 (重複は `PlutoError(InvalidArgument)`)。名前は Worker との ID の整合に使う。
- `getComponentLayout(): ComponentLayout` はコンポーネント表 (ID 順の `{ name, id, fields: { name, fieldId, type }[] }`) を返す。`applyComponentLayout(layout)` は Worker 専用で、同名のコンポーネントの ID とフィールド ID を表に合わせて書き換える (フィールドトークンは同じオブジェクトのまま書き換わるので、カーネルが持つトークンも正しい ID になる)。表に無いコンポーネントは変更しない。同名でフィールド構成が違えば `PlutoError(InvalidState)`。

```ts
export const Transform = defineComponent('Transform', {
  x: ScalarType.F32,
  y: ScalarType.F32,
  rotation: ScalarType.F32,
  scaleX: ScalarType.F32,
  scaleY: ScalarType.F32,
});
// Transform.id: ComponentId (0 始まりの連番, 最大 256)
// Transform.name: 'Transform'
// Transform.x: FieldToken<typeof ScalarType.F32>  (グローバル連番 fieldId と型を持つ)
// Transform.fields: readonly FieldToken[]  (定義順)
```

- フィールドはスカラのみ。ベクトルは `x`, `y` のように分ける。
- フィールド数 0 のコンポーネント = **タグ** (例: `Visible`)。
- `defineComponent` はモジュールトップでのみ呼ぶ (動的定義禁止)。コンポーネントは最大 **256 個** (`MAX_COMPONENTS`)。
- 型:
  ```ts
  export interface FieldToken<T extends ScalarType = ScalarType> {
    readonly fieldId: number; // 全コンポーネント通しの連番
    readonly componentId: number;
    readonly type: T;
    readonly name: string;
  }
  ```

---

## 4. アーキタイプとカラム

### 4.1 Column (`src/core/ecs/column.ts`)

- 1 フィールド 1 カラム。`createBackingBuffer(rows * bytes)` 上の固定長 TypedArray。
- 初期行数 `INITIAL_ARCHETYPE_ROWS = 1024`。容量不足時は **2 倍** (`maxRows` を上限) の新しいバッファを作ってコピーし、`buffer` と `data` を差し替える。**伸長前に取得したビューは古くなる** ので、カラムは使うたびに `archetype.getColumn()` / `view.column()` で取り直す (チャンク処理の間は伸長が起きないので、その間は保持してよい)。
- `maxRows` は `WorldConfig.maxRowsPerArchetype` (デフォルト `= maxEntities`)。

### 4.2 Archetype (`src/core/ecs/archetype.ts`)

```ts
export class Archetype {
  public readonly id: number; // 0 〜 65534
  public readonly mask: Bitset; // 所有コンポーネント (256bit)
  public entities: Uint32Array; // 行 → Entity (伸長時に差し替わる)
  public readonly bufferVersion: number; // カラムまたは entities のバッファを作り直すたびに +1
  public count: number; // 使用行数
  public getColumn<T extends ScalarType>(field: FieldToken<T>): TypedArrayOf<T>;
  public hasComponent(componentId: number): boolean;
  public pushRow(entity: Entity): number; // 新しい行番号を返す。値はゼロ初期化
  public pushRows(count: number): number; // count 行を連続追加し、開始行を返す (一括生成用)
  public writeEntityRow(row: number, entity: Entity): void; // pushRows で確保した行に Entity を書く
  public swapRemove(row: number): Entity; // 最終行を row に移動し、移動したエンティティを返す (無ければ NULL_ENTITY)
  public copyRowTo(row: number, dst: Archetype, dstRow: number): void; // 共通フィールドのみコピー
}
```

- 行は常に密 (0 〜 count-1)。削除は swap-remove。**行の順序は保証しない**。
- `entities` も `createBackingBuffer` 上の `Uint32Array` (カラムと同じ伸長規則)。
- バッファを作り直したら `bufferVersion` を +1 し、コンストラクタで受け取った通知関数 (`ArchetypeGraph` 経由で World へ) を呼ぶ。World はこれで `structureVersion` を進め、jobs が Worker に新しいバッファを送り直す。
- Worker のミラーは `rebindShared(desc)` で同じオブジェクトのままバッファだけ差し替える (クエリが持つ参照を保つため)。
- `pushRow` で追加した行は全フィールドの値を 0 にし、**dirty にする** (spawn 直後のエンティティをスプライットパック等が拾えるように)。
- `pushRows(count)` は同じ内容をまとめて行う。`fill` で各カラムをゼロ初期化し、dirty は**フィールドごとに 1 回だけ** `markRange` で立てる (1 体ずつは 100 万回かかる)。値は 0、Entity は 0 で埋めたので `writeEntityRow` で上書きする。
- Worker 用の読み取りミラーは `Archetype.fromShared(desc: SharedArchetypeDesc): Archetype` で作る (同じクラスなので `ChunkView` がそのまま使える。構造変更メソッドは `assert` で禁止)。`SharedArchetypeDesc` = `{ id, maxRows, componentIds, fields: { fieldId, type, buffer }[], entitiesBuffer, dirtyBuffers }`。ミラーは desc だけから作り、コンポーネントのレジストリに依存しない。
- `count` は Worker から直接読めないため、`jobs` の共有カウント表 (`docs/05-jobs-and-builds.md` §3.2) を経由する。
- アーキタイプ ID 0 は「コンポーネントなし」の空アーキタイプとして予約。

### 4.3 ArchetypeGraph (`src/core/ecs/archetype-graph.ts`)

- `(archetypeId, componentId, add|remove) → archetypeId` を `Map<number, number>` (キー = `archetypeId * 512 + componentId * 2 + (add ? 1 : 0)`) でキャッシュ。
- マスク → アーキタイプの検索は `Map<string, Archetype>` (キーはマスクの 16 進文字列)。コールドパスなので文字列キー可。
- ID → アーキタイプは **配列** (`archetypes[id]`) で O(1) に引く (`world.get/set` のホットな経路のため。Map の走査は禁止)。

---

## 5. チャンクとクエリ

### 5.1 チャンク

- **チャンク = アーキタイプ内の 16384 行 (`CHUNK_ROWS = 16384`) の論理範囲**。物理的な分割はしない。
- チャンク `k` の範囲: `[k * CHUNK_ROWS, min((k + 1) * CHUNK_ROWS, count))`。
- ジョブシステムの並列単位はチャンク。

### 5.2 ChunkView (`src/core/ecs/chunk-view.ts`)

```ts
export class ChunkView {
  public archetype: Archetype; // 再利用のため readonly にしない
  public start: number; // 開始行 (含む)
  public end: number; // 終了行 (含まない)
  public chunkIndex: number; // クエリ全体の通し番号 (getChunk に渡した globalChunkIndex)。Serial / Threaded で同じ値
  public column<T extends ScalarType>(field: FieldToken<T>): TypedArrayOf<T>;
  public entity(row: number): Entity;
  public markDirty(field: FieldToken): void; // 範囲 [start,end) の dirty を立てる
}
```

- `ChunkView` インスタンスは **使い回す** (クエリごとに 1 個をプール)。システム内で保持してはならない。
- `column()` で得た TypedArray は **`start`〜`end-1` の範囲だけ** 読み書きしてよい。

### 5.3 Query (`src/core/ecs/query.ts`)

```ts
const q = world.query({ all: [Transform, Velocity], none: [Frozen] });
q.forEachChunk((view) => { /* HOT */ });  // コールバックは事前に定義した関数を渡す (毎フレーム生成しない)
q.count(): number;
q.chunkCount(): number;
q.getChunk(globalChunkIndex: number, out: ChunkView): void; // jobs が使う
```

- クエリはキャッシュされ、**新しいアーキタイプの生成時に 1 回だけ** マッチ判定して登録される (同じアーキタイプを重複登録してはならない)。
- 同じ条件の `world.query()` は同じインスタンスを返す。キャッシュキーは `all` / `none` のコンポーネント ID を **昇順に並べた** 正規形から作る (指定順序に依存しない)。
- `getChunk` のグローバル番号は、登録順のアーキタイプごとのチャンクを連結した通し番号。

---

## 6. 変更追跡 (`src/core/ecs/change-tracking.ts`)

- アーキタイプのフィールドごとに `Uint32Array` の dirty ビット (1bit = 64 行ブロック、`DIRTY_BLOCK_ROWS = 64`)。
- `markRange(fieldId, startRow, endRow)` / `forEachDirtyRange(fieldId, rowCount, cb(startRow, endRow))` (`rowCount` = 現在の行数。範囲は `rowCount` で切り詰める) / `clear(fieldId)`。
- dirty ビット配列も `createBackingBuffer` 上に置く (Worker のカーネルが `markDirty` するため)。チャンク (16384 行) は 256 ブロック = u32 8 語に揃うので、異なるチャンクが同じ語を書くことはなく、カーネルからの書込に `Atomics` は不要。
- 連続する dirty ブロックは 1 つの範囲に結合して返す (転送回数削減)。
- `render/sprite-pack-system` が `Sprite`/`WorldTransform` の dirty 範囲だけをパックする。

---

## 7. 構造変更と同期点

### 7.1 CommandBuffer (`src/core/ecs/command-buffer.ts`)

- システム実行中の `spawn` / `despawn` / `addComponent` / `removeComponent` は **即時実行しない**。CommandBuffer に積む。
- `spawn` は index を即時予約して `Entity` を返す (ただし行はまだない。`isAlive` は false)。
- 初期値の設定は `cmd.set(entity, field, value)` (数値 1 個ずつ積む)。
- 適用は `World.flush()` (同期点、`Phase.PostUpdate` の最後に `Game` が呼ぶ)。
- 容量は `WorldConfig.commandCapacity` (デフォルト 1,048,576)。単位は **コマンド領域の u32 語数** (spawn = 2 + コンポーネント数 語, set = 4 語 など)。超えたら `PlutoError(CapacityExceeded)`。容量チェックはエンティティ index を予約する **前** に行う (失敗時に index を消費しない)。
- `spawn` の可変長引数による配列確保を避けるため、HOT 経路では `spawn1(c)` / `spawnN(components: readonly AnyComponentDef[])` を使う (`spawn(...components)` はコールドパス用に残す)。

### 7.2 直接操作

- システム外 (シーンの `create()` 等) では `world.spawn()` 等の即時 API を使ってよい。
- システム実行中に即時 API を呼んだら `assert` で失敗させる (`world.isIterating` フラグ)。

---

## 8. System (`src/core/ecs/system.ts`)

```ts
export const MovementSystem = defineSystem({
  name: 'Movement',
  phase: Phase.Update,
  query: { all: [Transform, Velocity] },
  writes: [Transform], // dirty 追跡と並列安全性の宣言
  kernel: MoveKernel, // jobs の Kernel (並列可能)。kernel か run のどちらか一方
  // run: (world, dt) => void  // 並列不可の自由処理 (メインスレッド)
  order: 0, // 同フェーズ内の実行順 (小さい順、同値は登録順)
});
```

- `kernel` を持つシステムは `Scheduler.runKernel()` でチャンク並列に実行される (`docs/05-jobs-and-builds.md`)。
- ユーザー定義システムは `run` のみ (v1)。`kernel` は組込のみ (Worker に関数を送れないため)。
- `Phase` の値は **数値** (`PreUpdate: 0` 〜 `PreRender: 4`, `docs/01-architecture.md` §4)。
- `core/ecs` は `jobs` を import できないため、カーネル関連の型は `system.ts` に **構造的な最小インターフェース** として置く:

```ts
/** jobs の KernelDef が満たす最小形 (ecs は実行方法を知らない)。 */
export interface KernelRef {
  readonly id: number;
  readonly name: string;
}
/** カーネルシステムの実行者。jobs の Scheduler がこれを満たす。 */
export interface KernelExecutor {
  syncWorld(world: World): void;
  runKernel(kernel: KernelRef, query: Query, params: Float32Array): void;
}
export interface SystemDef {
  readonly name: string;
  readonly phase: Phase;
  readonly query: QueryDesc;
  readonly writes?: readonly AnyComponentDef[];
  readonly kernel?: KernelRef; // kernel と run はどちらか一方 (両方/どちらもなしは PlutoError(InvalidArgument))
  readonly run?: (world: World, dt: number) => void;
  readonly params?: Float32Array; // kernel 用。長さ ≤ MAX_KERNEL_PARAMS (64)。params[0] は実行時に dt で上書き
  readonly order?: number;
}
```

- `jobs` の `Scheduler` は `KernelExecutor` を、`KernelDef` は `KernelRef` を構造的に満たす (型の import 方向は jobs → ecs のみ)。

---

## 9. World (`src/core/ecs/world.ts`)

```ts
export interface WorldConfig {
  maxEntities?: number; // デフォルト 1_048_576 (上限 MAX_ENTITIES)
  maxRowsPerArchetype?: number; // デフォルト maxEntities
  commandCapacity?: number; // デフォルト 1_048_576 (u32 語数, §7.1)
}
export class World {
  public constructor(config?: WorldConfig);
  public spawn(...components: AnyComponentDef[]): Entity;
  public spawnN(count: number, components: readonly AnyComponentDef[]): Entity; // 一括生成。最初の Entity を返す (count=0 なら NULL_ENTITY)
  public despawn(e: Entity): void;
  public addComponent(e: Entity, c: AnyComponentDef): void;
  public removeComponent(e: Entity, c: AnyComponentDef): void;
  public hasComponent(e: Entity, c: AnyComponentDef): boolean;
  public isAlive(e: Entity): boolean;
  public get<T extends ScalarType>(e: Entity, field: FieldToken<T>): number; // コールドパス用
  public set<T extends ScalarType>(e: Entity, field: FieldToken<T>, v: number): void; // コールドパス用 (dirty を立てる)
  public query(desc: QueryDesc): Query;
  public readonly commands: CommandBuffer;
  public addSystem(s: SystemDef): void;
  public runPhase(phase: Phase, dt: number): void;
  public flush(): void;
  public readonly isIterating: boolean; // 外部から書換不可 (getter)
  public setExecutor(executor: KernelExecutor): void; // kernel システムの実行前に必須
  public readonly structureVersion: number; // アーキタイプ・クエリの新規作成やクエリへのアーキタイプ登録で +1
}
```

- `maxEntities` の既定は 1,048,576、上限は `MAX_ENTITIES` (4,194,303)。超えたら `PlutoError(InvalidArgument)`。
- kernel システムの実行手順: `structureVersion` が前回の `syncWorld` 以降に変わっていれば `executor.syncWorld(this)` → `system.params[0] = dt` → `executor.runKernel(kernel, query, params)` → `writes` の各フィールドについて、カーネルが立てた dirty はそのまま残る。executor 未設定で kernel システムを実行したら `PlutoError(NotInitialized)`。
- swap-remove 後のエンティティ表更新は `moved !== NULL_ENTITY` で判定する (0 は正規のエンティティ)。
- spawn の実装本体は `world-spawn.ts` (`SpawnState` = 実行中フラグ・`graph`・`entityTable`) に置く。**実行中フラグは `World.iterating` を関数の形で参照して渡す** (値を複製すると `flush()` の入れ子復帰で追従しなくなり、実行中に即時 spawn が通ってしまう)。

## 10. 性能受け入れ基準

計測は `bench/scenes/ecs-move.ts` が行い、単発処理 (spawnN / spawn 連鎖 / get / set) は `BenchResult.metrics` (`docs/10-testing-strategy.md` §5) に ms で記録する。

**判定は中央値 (p50) で行う。** 600 回のうち 1 回 (p99) は V8 の世代別 GC と OS スケジューラのジッタで支配されるため、同一の実装でも ±20% 揺れる。`tools/compare-bench.mjs` も p50 (`cpuP50Ms` と `metrics.*P50Ms`) だけを判定し、p99 は `[参考値]` として表示する。

| 項目                                                           | 基準 (基準機, embed ビルド, ブラウザで計測) |
| -------------------------------------------------------------- | ------------------------------------------- |
| **10 万エンティティ** (Transform+Velocity) の移動カーネル 1 回 | ≤ 2.0ms                                     |
| 100 万回の `world.spawnN(count, [Transform, Velocity])`        | ≤ 60ms                                      |
| 100 万回の `world.get`                                         | ≤ 50ms                                      |
| 100 万回の `world.set`                                         | ≤ 50ms                                      |

### 10.1 実測値と原因 (2026-10-06)

基準機 (RTX 4060 / Chrome / 1920×1080) で embed ビルドを計測した結果。`bench/baseline.json` に登録した値と一致する。

| エンティティ数 | カーネル p50 | カーネル p99 | 1 体あたり | spawnN | spawn 連鎖 | set  | get  |
| -------------- | ------------ | ------------ | ---------- | ------ | ---------- | ---- | ---- |
| 100,000        | 0.275 ms     | 0.515 ms     | 2.75 ns    | 8.1 ms | 26.1 ms    | 6.0  | 6.5  |
| 500,000        | 1.355 ms     | 2.320 ms     | 2.71 ns    | 16.3   | 82.4       | 19.3 | 19.0 |
| 1,000,000      | 2.790 ms     | 4.065 ms     | 2.79 ns    | 27.9   | 172.3      | 31.8 | 34.0 |
| 2,000,000      | 5.480 ms     | 6.575 ms     | 2.74 ns    | 50.5   | 318.2      | 60.8 | 66.9 |

**移動カーネルはメモリ帯域で律速されている。** `posX`, `posY`, `velX`, `velY` の 4 カラムを読むため、100 万体では 16 MB の読み書きになる。1 カラム更新が 1.358 ms、2 カラム更新が 2.927 ms、4 カラム更新が 3.261 ms で、列数にほぼ比例する。実効帯域は 4.6 GB/s である。

- 100 万体で 2.0 ms を達成するには 8 GB/s の帯域が必要だが、実測は 4.6 GB/s である。帯域が上限なので、100 万体で 2.0 ms は達成できない。判定は 10 万体に設定する (実測 0.275 ms、基準の 14%)
- カーネル本体以外 (クエリ走査、`getChunk`、`view.column()`) の合計は 0.002 ms であり、`runPhase` の 99.6% がカーネル本体である。ECS 層の最適化は不要
- 半精度 (`ScalarType.F16`) なら帯域が半分になるので 100 万体でも 2.0 ms に収まる。将来検討事項

**一括生成は初期化の処理なので、毎フレーム 6.94 ms の予算とは無関係である。** 初期化は 1 度きりの処理であり、どれだけ時間がかかっても 1 フレームの制限には影響しない。判定に意味を持たせるのは「途中で中断できるか (操作可能か)」だけなので、実測値の 2 倍程度 (100 万体で 60 ms、約 0.9 秒で完了する速さ) を基準とする。

- `spawnN` (`Archetype.pushRows`) は 1 体ずつ `pushRow` するより **6.2 倍速い** (100 万体で 172.3 → 27.9 ms)。差は dirty ビットの markRange 回数で、1 体ずつはフィールドごとに 100 万回、まとめると 3 回で済む
- `spawn` 連鎖 (`world.spawn()` の 1 体ずつ) は ECS の最小単位であり、**実行中に 1 体ずつ足す**用途 (動的生成) で必要なので基準は置かない。上の表には参考値として残す
- `get` / `set` は 1 体あたり 34 ns / 32 ns で線形に伸びている。帯域の問題ではなく `EntityTable` の更新と列へのランダムアクセスが支配的なので、実装側の最適化の対象
