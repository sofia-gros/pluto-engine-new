# T-1.9: World

## 目的

ECSのコアを統合する最重要クラス `World` と、システム(ゲームロジック)の定義基盤である `System` およびフェーズ(`Phase`)、さらに構造変更を遅延評価するための `CommandBuffer` を実装する。

## 編集・作成するファイル

- `src/core/ecs/command-buffer.ts` (作成済)
- `src/core/ecs/system.ts` (作成済)
- `src/core/ecs/world.ts`
- `src/core/ecs/index.ts`
- `tests/unit/core/ecs/world.test.ts`
- `tests/unit/core/ecs/command-buffer.test.ts`

## 実装ステップ

1. **コンポーネント定義のレジストリ対応** (対応済)
   - `component.ts` で `defineComponent` された全コンポーネントを保持する `COMPONENT_REGISTRY` を追加し、グローバルIDで引けるようにした。
2. **command-buffer.ts と system.ts の実装** (対応済)
   - `CommandBuffer`: `Uint32Array` と `Float32Array` / `Int32Array` のビューを用いて、エンティティの構造変更やデータ更新コマンドをアロケーション無しでストリームとして蓄積する。
   - `SystemDef` および `Phase`: システムの実行順序や依存関係を定義。
3. **world.ts の実装**
   - 内部に `EntityTable`, `ArchetypeGraph`, `CommandBuffer` を保持。
   - `query` による抽出とキャッシュの管理。
   - `spawn`, `despawn`, `addComponent`, `removeComponent`, `get`, `set` の即時APIの提供。
   - `isIterating` 中の即時構造変更に対するアサーション。
   - `flush` の実装。コマンドバッファのストリームをループして実際の構造変更(Archetype遷移等)を反映。
   - システム群 (`SystemDef`) をフェーズおよび `order` に従ってソートして登録し、`runPhase` で逐次実行する。
4. **テスト作成**
   - `command-buffer.test.ts`: コマンドストリームの正常記録のテスト。
   - `world.test.ts`: 全体のインテグレーションテスト。`spawn`, コンポーネント付与、クエリ取得、`flush` による遅延適用の確認。システムのフェーズ単位実行の確認。

## 完了条件

1. `World` クラスが仕様どおりのAPIを提供し、正しく動作すること。
2. `CommandBuffer` による構造変更のバッチ化と `flush` がアロケーションなしで正常に行われること。
3. カバレッジ `core/ecs/**` が lines 95% / branches 90% 以上であること。
4. ホットパスのルールに準拠していること。
