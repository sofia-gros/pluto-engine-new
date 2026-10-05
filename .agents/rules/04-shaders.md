---
trigger: model_decision
description: シェーダファイル (*.wgsl, *.glsl) や GPU バッファのレイアウト、RHI、レンダリングパスを作成・変更するときに必ず適用する。
---

# R4: シェーダ・GPU データ規則

詳細は `docs/06-rhi.md`, `docs/07-renderer.md`。手順は `pluto-shader` スキル。

1. **レイアウトの唯一の正 (SSOT)** は TypeScript 側の `*-layout.ts` (例: `src/render/sprite/sprite-instance-layout.ts`)。WGSL/GLSL の構造体はそれに合わせて書き、オフセット・サイズを変えたら **3 箇所 (TS / WGSL / GLSL) を同時に更新** し、レイアウトテストを更新する。
2. 描画シェーダは **WGSL と GLSL ES 3.00 の両方** を用意する (`foo.wgsl` / `foo.vert.glsl` + `foo.frag.glsl`)。
3. コンピュートシェーダは WGSL。WebGL2 で同機能を提供する場合は Fragment GPGPU 版 `foo.gpgpu.frag.glsl` を用意する。WebGL2 で提供しない機能は `docs/08-simulation.md` の「WebGL2 品質レベル」表に従う (表にない省略は禁止)。
4. WGSL の `@workgroup_size` は `docs/07-renderer.md` §定数 の値を使う (デフォルト 256)。マジックナンバー禁止。
5. GLSL は `#version 300 es` + `precision highp float; precision highp int;` を必ず先頭に書く。
6. シェーダの共通コードは `#include "common/xxx"` (自前プリプロセッサ `src/shaders/preprocess.ts`) で共有する。コピペ禁止。
7. シェーダ内のコメントも日本語。
8. 頂点バッファは使わない (vertex pulling)。インスタンスデータはストレージバッファ (WebGL2 ではデータテクスチャ) から読む。
9. 新しいシェーダを追加したら `src/shaders/shader-library.ts` に登録し、ブラウザテストでコンパイル成功を確認する。
