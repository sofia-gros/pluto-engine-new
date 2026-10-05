---
trigger: always_on
---

# R2: 性能必須ルール (HOT パス)

## HOT とは

- `docs/02-directory-structure.md` の表で **HOT 列が `HOT`** のファイル。
- HOT ファイルは **1 行目に `// @pluto-hot`** を書く (`tools/check-rules.mjs` が検査する)。
- HOT ファイル内のコードは「毎フレーム」または「エンティティごと」に実行されると見なす。

## HOT ファイルで禁止 (例外は行末に `// pluto-allow: 日本語の理由` を書き、レビューで正当性を説明する)

1. フレームループ中のメモリ確保: オブジェクトリテラル `{}`、配列リテラル `[]`、`new` (TypedArray 含む)、クロージャ生成、スプレッド `...`、配列の分割代入、テンプレート文字列/文字列連結。
   → 確保は初期化時に行い、再利用する。
2. 配列高階関数: `.forEach` `.map` `.filter` `.reduce` `.some` `.every` `.find` `.flatMap` `.sort` (TypedArray の `.sort` 含む)。→ 素の `for (let i = 0; i < n; i++)`。
3. `for...of`、`Object.keys/values/entries`、`Map` / `Set` の内側ループでの使用、`delete`、`arguments`。
4. ループ内の `try/catch`、`throw`。
5. ループ内でのプロパティチェーン探索の繰り返し。→ TypedArray と長さはループ前にローカル変数へキャッシュする。
6. 多相呼び出し: 同じ関数に形の異なるオブジェクトを渡さない。クラスのフィールドはすべてコンストラクタで同じ順に初期化する。

## HOT パスの推奨

- 整数演算は `| 0` / `>>> 0` で明示。
- ECS データは `ChunkView` から TypedArray を取り出して直接ループする (`docs/04-memory-and-ecs.md`)。
- 1 エンティティ 1 オブジェクトを作らない。ハンドルは `u32` 整数。

## GPU の禁止事項

- フレーム中の `createBuffer` / `createTexture` / `createBindGroup` / `createPipeline` 禁止 (初期化時またはリサイズ時のみ)。
- フレーム中の同期読み戻し禁止 (`gl.readPixels`, `gl.getBufferSubData`, `gl.getError` (`__DEBUG__` 以外), WebGPU の `mapAsync` を await してフレームを止めること)。
- CPU→GPU 転送は **dirty range のみ**。全量 `writeBuffer` は初期化時のみ。
- WebGL2 の状態変更は必ず `webgl2-state-cache.ts` 経由。

## 予算

- 144FPS 予算 6.94ms。目安: CPU ロジック ≤ 2.0ms、GPU シミュレーション ≤ 2.0ms、描画 ≤ 2.5ms、余裕 0.44ms。
- HOT ファイルを変更したら `pluto-perf` スキルでベンチを取る。ベースライン比 10% 以上の悪化は不合格。
