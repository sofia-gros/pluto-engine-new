# ADR-0005: WebGPU 優先・WebGL2 フォールバック

- 状態: 確定
- 日付: 2026-10-05

## 背景

GPU カリング・indirect draw・コンピュートシミュレーションには WebGPU が必要だが、WebGPU 非対応の環境も残る。

## 決定

- WebGPU が使えれば WebGPU、使えなければ WebGL2 を使う。Canvas2D フォールバックはしない。
- 能力差は `RhiCapabilities` で公開し、上位層は初期化時に描画パス (GPU 駆動 / CPU 補助) を選ぶ。
- WebGL2 で提供しない機能は `docs/08-simulation.md` §2 の品質表で明示する。

## 理由

- WebGL2 で compute を無理にエミュレートすると複雑化し、どちらの性能も中途半端になる。
- 能力差を明示することで、ユーザーが `isSupported()` で分岐できる。

## 影響

- 上位層は `GPUDevice` / `WebGL2RenderingContext` に直接触れない。
- 描画シェーダは WGSL と GLSL の両方を用意する。

## 却下した代替案

- WebGL2 のみ → 100 万スプライト目標に届かないため却下。
- WebGPU のみ → 対応環境が限られるため却下。
