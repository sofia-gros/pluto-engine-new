# 04. メモリモデルと SoA ECS 仕様

> この仕様に記載された **名前・シグネチャ・定数値をそのまま実装する**。変更が必要なら `pluto-escalate`。

---

## 1. メモリモデル

### 1.1 バッキングバッファ (`src/core/memory/buffer-factory.ts`)

```ts
/** バッキングバッファ。parallel ビルドでは SharedArrayBuffer。 */
export type BackingBuffer = ArrayBuffer | SharedArrayBuffer;

/**
 * 伸長可能なバッキングバッファを作る。
 * @param initialBytes 初期バイト長 (8 の倍数)
 * @param maxBytes 最大バイト長 (8 の倍数, initialBytes 以上)
 */
export function createBackingBuffer(initialBytes: number, maxBytes: number): BackingBuffer;

/** バッファを newBytes まで伸長する (縮小不可)。 */
export function growBackingBuffer(buffer: BackingBuffer, newBytes: number): void;
```

- `__PARALLEL__ === true` かつ `globalThis.crossOriginIsolated === true` → `new SharedArrayBuffer(initialBytes, { maxByteLength: maxBytes })`
- それ以外 → `new ArrayBuffer(initialBytes, { maxByteLength: maxBytes })`
- 伸長は `buffer.grow()` / `buffer.resize()`。TypedArray は **長さ指定なし (length-tracking)** で作るため、伸長後も同じビューが使える。
- 共有するかの判定は `isSharedMemoryEnabled(): boolean` として同ファイルに置き、他所で同じ判定を重複実装しない。

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

| ビット | 内容 |
|--------|------|
| 0–21 (22bit) | index (0 〜 4,194,303) |
| 22–31 (10bit) | generation (0 〜 1023, 循環) |

```ts
export type Entity = number & { readonly __brand: 'Entity' };
export const ENTITY_INDEX_BITS = 22;
export const ENTITY_INDEX_MASK = 0x3fffff;
export const ENTITY_GENERATION_MASK = 0x3ff;
export const MAX_ENTITIES = 1 << 22;
export const NULL_ENTITY: Entity; // 0xFFFFFFFF
export function makeEntity(index: number, generation: number): Entity; // 結果は >>> 0
export function entityIndex(e: Entity): number;
export function entityGeneration(e: Entity): number;
```

### 2.2 エンティティ表 (`src/core/ecs/entity-table.ts`)

SoA、長さ `maxEntities`:

| カラム | 型 | 内容 |
|--------|----|------|
| `archetypeIds` | `Uint16Array` | 所属アーキタイプ (`0xFFFF` = 未使用) |
| `rows` | `Uint32Array` | アーキタイプ内の行番号 |
| `generations` | `Uint16Array` | 現在の世代 |

- 解放された index は `FreeList` で再利用。解放時に generation を +1 (mask)。
- `isAlive(e)`: index 範囲内 && `generations[index] === entityGeneration(e)` && `archetypeIds[index] !== 0xFFFF`。

---

## 3. コンポーネント

### 3.1 定義 API (`src/core/ecs/component.ts`, `schema.ts`)

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
    readonly fieldId: number;     // 全コンポーネント通しの連番
    readonly componentId: number;
    readonly type: T;
    readonly name: string;
  }
  ```

---

## 4. アーキタイプとカラム

### 4.1 Column (`src/core/ecs/column.ts`)

- 1 フィールド 1 カラム。`createBackingBuffer(initialRows * bytes, maxRows * bytes)` 上の length-tracking TypedArray。
- 初期行数 `INITIAL_ARCHETYPE_ROWS = 1024`。容量不足時は **2 倍** に伸長 (`maxRows` を上限)。
- `maxRows` は `WorldConfig.maxRowsPerArchetype` (デフォルト `= maxEntities`)。

### 4.2 Archetype (`src/core/ecs/archetype.ts`)

```ts
export class Archetype {
  public readonly id: number;                 // 0 〜 65534
  public readonly mask: Bitset;               // 所有コンポーネント (256bit)
  public readonly entities: Uint32Array;      // 行 → Entity (length-tracking)
  public count: number;                       // 使用行数
  public getColumn<T extends ScalarType>(field: FieldToken<T>): TypedArrayOf<T>;
  public hasComponent(componentId: number): boolean;
  public pushRow(entity: Entity): number;     // 新しい行番号を返す。値はゼロ初期化
  public swapRemove(row: number): Entity;     // 最終行を row に移動し、移動したエンティティを返す (無ければ NULL_ENTITY)
  public copyRowTo(row: number, dst: Archetype, dstRow: number): void; // 共通フィールドのみコピー
}
```

- 行は常に密 (0 〜 count-1)。削除は swap-remove。**行の順序は保証しない**。
- アーキタイプ ID 0 は「コンポーネントなし」の空アーキタイプとして予約。

### 4.3 ArchetypeGraph (`src/core/ecs/archetype-graph.ts`)

- `(archetypeId, componentId, add|remove) → archetypeId` を `Map<number, number>` (キー = `archetypeId * 512 + componentId * 2 + (add ? 1 : 0)`) でキャッシュ。
- マスク → アーキタイプの検索は `Map<string, Archetype>` (キーはマスクの 16 進文字列)。コールドパスなので文字列キー可。

---

## 5. チャンクとクエリ

### 5.1 チャンク

- **チャンク = アーキタイプ内の 16384 行 (`CHUNK_ROWS = 16384`) の論理範囲**。物理的な分割はしない。
- チャンク `k` の範囲: `[k * CHUNK_ROWS, min((k + 1) * CHUNK_ROWS, count))`。
- ジョブシステムの並列単位はチャンク。

### 5.2 ChunkView (`src/core/ecs/chunk-view.ts`)

```ts
export class ChunkView {
  public archetype: Archetype;   // 再利用のため readonly にしない
  public start: number;          // 開始行 (含む)
  public end: number;            // 終了行 (含まない)
  public chunkIndex: number;
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

- クエリはキャッシュされ、新しいアーキタイプ生成時にマッチ判定して登録される。
- 同じ条件の `world.query()` は同じインスタンスを返す。

---

## 6. 変更追跡 (`src/core/ecs/change-tracking.ts`)

- アーキタイプのフィールドごとに `Uint32Array` の dirty ビット (1bit = 64 行ブロック、`DIRTY_BLOCK_ROWS = 64`)。
- `markRange(fieldId, startRow, endRow)` / `forEachDirtyRange(fieldId, cb(startRow, endRow))` / `clear(fieldId)`。
- 連続する dirty ブロックは 1 つの範囲に結合して返す (転送回数削減)。
- `render/sprite-pack-system` が `Sprite`/`WorldTransform` の dirty 範囲だけをパックする。

---

## 7. 構造変更と同期点

### 7.1 CommandBuffer (`src/core/ecs/command-buffer.ts`)

- システム実行中の `spawn` / `despawn` / `addComponent` / `removeComponent` は **即時実行しない**。CommandBuffer に積む。
- `spawn` は index を即時予約して `Entity` を返す (ただし行はまだない。`isAlive` は false)。
- 初期値の設定は `cmd.set(entity, field, value)` (数値 1 個ずつ積む)。
- 適用は `World.flush()` (同期点、`Phase.PostUpdate` の最後に `Game` が呼ぶ)。
- 容量は `WorldConfig.commandCapacity` (デフォルト 1,048,576)。超えたら `PlutoError(CapacityExceeded)`。

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
  writes: [Transform],         // dirty 追跡と並列安全性の宣言
  kernel: MoveKernel,          // jobs の Kernel (並列可能)。kernel か run のどちらか一方
  // run: (world, dt) => void  // 並列不可の自由処理 (メインスレッド)
  order: 0,                    // 同フェーズ内の実行順 (小さい順、同値は登録順)
});
```

- `kernel` を持つシステムは `Scheduler.runKernel()` でチャンク並列に実行される (`docs/05-jobs-and-builds.md`)。
- ユーザー定義システムは `run` のみ (v1)。`kernel` は組込のみ (Worker に関数を送れないため)。

---

## 9. World (`src/core/ecs/world.ts`)

```ts
export interface WorldConfig {
  maxEntities?: number;          // デフォルト 1_048_576 (上限 MAX_ENTITIES)
  maxRowsPerArchetype?: number;  // デフォルト maxEntities
  commandCapacity?: number;      // デフォルト 1_048_576
}
export class World {
  public constructor(config?: WorldConfig);
  public spawn(...components: ComponentDef[]): Entity;
  public despawn(e: Entity): void;
  public addComponent(e: Entity, c: ComponentDef): void;
  public removeComponent(e: Entity, c: ComponentDef): void;
  public hasComponent(e: Entity, c: ComponentDef): boolean;
  public isAlive(e: Entity): boolean;
  public get<T extends ScalarType>(e: Entity, field: FieldToken<T>): number;      // コールドパス用
  public set<T extends ScalarType>(e: Entity, field: FieldToken<T>, v: number): void; // コールドパス用 (dirty を立てる)
  public query(desc: QueryDesc): Query;
  public readonly commands: CommandBuffer;
  public addSystem(s: SystemDef): void;
  public runPhase(phase: Phase, dt: number): void;
  public flush(): void;
  public readonly isIterating: boolean;
}
```

## 10. 性能受け入れ基準

| 項目 | 基準 (基準機, embed ビルド, Node ではなくブラウザで計測) |
|------|------|
| 100 万エンティティ (Transform+Velocity) の移動カーネル 1 回 | ≤ 2.0ms |
| 100 万 spawn (即時 API, 同一アーキタイプ) | ≤ 150ms |
| `world.get/set` 100 万回 | ≤ 30ms |
