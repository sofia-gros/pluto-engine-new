# ADR-0004: parallel / embed の 2 ビルド

- 状態: 確定
- 日付: 2026-10-05

## 背景

マルチスレッド (Worker + SharedArrayBuffer) には COOP/COEP ヘッダが必要で、iframe 埋め込みやゲームポータル・CDN では満たせないことが多い。

## 決定

- 並列前提でコードを書き、ビルド時定数 `__PARALLEL__` で **parallel** (Worker 使用) と **embed** (直列) の 2 ビルドを出力する。
- ソースコードは 1 つ。ロジックの分岐は `src/jobs/create-scheduler.ts` と `src/core/memory/buffer-factory.ts` に限定する。
- parallel ビルドでも `crossOriginIsolated` が false なら直列に縮退する。
- パッケージの既定エクスポートは embed。

## 理由

- 同じカーネル・同じチャンク分割を Serial / Threaded の両スケジューラで実行するため、結果が一致し保守が容易。
- embed ビルドでは Worker コードがツリーシェイクで消え、サイズも小さくなる。

## 影響

- 並列処理は「カーネル」(純粋関数) としてのみ書く (`docs/05-jobs-and-builds.md` の契約)。
- Serial と Threaded のパリティテストを必須とする。
- `tools/check-bundle.mjs` で embed に Worker が混入していないことを検査する。

## 却下した代替案

- 実行時判定のみ (1 ビルド) → embed 環境でも Worker コードが同梱されるため却下。
- 別々のコードベース → 二重保守のため却下。
