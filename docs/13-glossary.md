# 13. 用語集

| 用語 | 意味 |
|------|------|
| SoA (Structure of Arrays) | フィールドごとに配列を持つデータ配置。`x[]`, `y[]` |
| AoS (Array of Structures) | 要素ごとに構造体を並べる配置。GPU のスプライトインスタンス (32 バイト) は AoS |
| アーキタイプ | 同じコンポーネント構成を持つエンティティの集合と、その SoA カラム |
| カラム | 1 フィールド分の TypedArray |
| チャンク | アーキタイプ内の 16384 行の論理範囲。並列化の単位 |
| カーネル | チャンクに対して実行される純粋関数。Worker でも実行できる |
| 同期点 | CommandBuffer を適用して構造変更を反映するタイミング (`World.flush()`) |
| CPU Tier | CPU の ECS が正となるエンティティ (個別操作可能) |
| GPU Tier | GPU バッファが正となるエンティティ群 (グループ単位で操作) |
| GpuGroup | GPU Tier がスプライトバッファ内に所有する連続スロット範囲 |
| スロット | スプライトバッファ内の 1 要素 (32 バイト) の番号 |
| Unified Sprite Buffer | CPU Tier と GPU Tier が共有する 1 本のスプライトバッファ |
| ビン | 描画の分類 (Opaque / Alpha / Additive) |
| HOT | 毎フレーム/エンティティ毎に実行されるコード。厳しい性能規則が適用される |
| dirty range | 前回転送以降に変更された範囲。これだけを GPU に転送する |
| vertex pulling | 頂点バッファを使わず、シェーダが `vertex_index` / `instance_index` からデータを読む方式 |
| indirect draw | 描画数を GPU バッファから読む描画。GPU カリング結果を CPU に戻さずに描画できる |
| GPGPU (WebGL2) | フラグメントシェーダでテクスチャに書き込むことで汎用計算を行う手法 |
| RHI | Render Hardware Interface。WebGPU / WebGL2 の差を吸収する抽象層 |
| parallel / embed | `__PARALLEL__` が true / false のビルド |
| SSOT | Single Source of Truth。唯一の正となる定義 |
| ゴールデン画像 | 正解として保存した描画結果画像 |
| パリティテスト | 2 つの実装 (Serial/Threaded, WebGPU/WebGL2 等) の結果一致を検証するテスト |
