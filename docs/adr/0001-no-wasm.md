# ADR-0001: WASM を使わない

- 状態: 確定
- 日付: 2026-10-05

## 背景

高速化の手段として WASM (Rust / AssemblyScript) が候補に挙がった。

## 決定

WASM は一切使用しない。依存ライブラリ経由 (Basis Universal トランスコーダ等) も含む。

## 理由

- JS ⇔ WASM 境界の呼び出し・メモリコピーのオーバーヘッドがある。
- 本エンジンの重い処理 (大量エンティティ) は GPU に載せる方針であり、CPU 側の数倍の高速化より GPU 化の方が効果が大きい。
- TypeScript 単一言語の方が保守・ビルドが単純。

## 影響

- CPU 側のホットパスは SoA + TypedArray + 単相コードで JIT 最適化を最大化する (`.agents/rules/02-performance.md`)。
- KTX2 は事前圧縮フォーマット (BC/ETC2/ASTC) のみ対応し、Basis のトランスコードは非対応。

## 却下した代替案

- ホットカーネルのみ WASM SIMD 化 → 境界コストと二言語保守のため却下。
