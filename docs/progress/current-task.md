# T-1.3: メモリ

## 目的

ECSやRHI基盤となるメモリ管理システムを構築する。型の統一 (`ScalarType`)、SharedArrayBufferへの対応 (`buffer-factory.ts`)、ビットセットやフリーリスト、アロケータなどの汎用データ構造を提供する。

## 編集・作成するファイル

- `src/core/memory/index.ts` (公開窓口)
- `src/core/memory/scalar-type.ts` (`ScalarType`, `SCALAR_BYTES`, `TypedArrayOf` 定義)
- `src/core/memory/buffer-factory.ts` (`createBackingBuffer`, `growBackingBuffer`, `isSharedMemoryEnabled`)
- `src/core/memory/bitset.ts` (固定長ビットセット, `Uint32Array` ベース)
- `src/core/memory/free-list.ts` (u32インデックスの再利用スタック)
- `src/core/memory/range-allocator.ts` (first-fit の範囲確保・解放)
- `src/core/memory/ring-buffer.ts` (固定長のリングバッファ)
- `src/core/memory/object-pool.ts` (コールドパス/汎用オブジェクトプール)
- 対応するテストコード (`tests/unit/core/memory/*.test.ts`)

## 実装ステップ

1. **scalar-type.ts & buffer-factory.ts**
   - `docs/04-memory-and-ecs.md` §1 の仕様に基づき `ScalarType` (F32, I32, U32, I16, U16, I8, U8) と `SCALAR_BYTES` を実装。
   - `isSharedMemoryEnabled()` で `__PARALLEL__ && globalThis.crossOriginIsolated` を判定（`__PARALLEL__` が設定されていれば）。
   - `createBackingBuffer(initial, max)` を実装 (Resizable ArrayBuffer / Growable SharedArrayBuffer)。
2. **bitset.ts**
   - `Uint32Array` を用いた固定長のビットセット。指定されたビットの set, clear, test などを提供。
3. **free-list.ts**
   - `Uint32Array` を用いたスタック (LIFO)。ECS で削除されたエンティティIDなどを管理するため。
4. **range-allocator.ts**
   - バイト範囲 (start, size) を管理するアロケータ。first-fit で空き領域から確保、解放時には隣接ブロックと結合。
5. **ring-buffer.ts**
   - 固定長の TypedArray (Uint8Arrayなど) をリングバッファとして扱う。書き込みと読み出し位置の管理。
6. **object-pool.ts**
   - 関数などを通じて生成されるオブジェクトを再利用する簡単なプール `ObjectPool<T>` を実装。
7. **テストの作成・実行**
   - すべてのファイルに対して単体テストを作成し、境界値や再利用動作などを確認する。
   - カバレッジ (lines 95%, branches 90%) を満たすことを確認。

## 完了条件（受け入れ条件）

1. 仕様書のシグネチャ・定数名・値と完全一致すること（レビュー記録に対応表を書く）。
2. `buffer-factory` の挙動が `__PARALLEL__` 定数により SharedArrayBuffer / ArrayBuffer を返すこと（テストでモックして確認）。
3. ユニットテスト: 公開関数ごとに正常系・境界値・異常系が存在すること。
4. カバレッジ `core/memory/**` が lines 95% / branches 90% 以上であること。
5. HOT ファイル (`bitset.ts`, `free-list.ts`, `ring-buffer.ts`) は `pnpm check:rules` を通過すること。
