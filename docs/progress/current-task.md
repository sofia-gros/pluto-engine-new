# 現在のタスク: T-5.1 Game / Scene / Factory / カメラ / Loader 統合 (修正フェーズ)

## 1. タスク概要

- **ID**: `T-5.1`
- **状態**: 修正フェーズ F1〜F3 完了、F4 (Docs) 進行中。`pluto-task-finish` は未実施。
- **参照ドキュメント**:
  - `docs/09-api-design.md` §2 (A1〜A15), §3 (最小コード例), §4.1〜4.6・§4.8
  - `docs/02-directory-structure.md` §22 (`src/scene/` 表)
  - `docs/12-roadmap.md` T-5.1 (受け入れ条件 1〜9) および D-23
  - `docs/01-architecture.md` §3〜4 (フレーム順・Phase)

## 2. 確定済み方針 (ユーザー承認済み)

- `camera.ts` は削除して `camera-manager.ts` に統合 (利用感は同一)
- sort-key は GPU 側 (`clamp` + `1048575`) に統一
- `launch` を追加 (`start` は再開、`launch` は重ね起動)
- docs の不備分 (`04 §7.1`, `07 §8`, `11 §6`, CI, `00` 注記, `09 §4.6` 注記, D-23) は修正可
- `Loader` メソッド名は実装 (`addImage` / `addAtlas` / `addJson`) に従う

## 3. 残件

- F4: 本ファイル以外の docs 反映は完了。`PROGRESS.md` の T-5.1 行は `pluto-task-finish` 時に更新する。
- 受け入れ条件 8 (batch 対 static の 10% 以内) は基準機 (headed) での `pnpm bench` が必要。
- レビュー残件 (見送り): CPU カリング半径 128、renderer 複数カメラ Clear、`DATA_TEXTURE_WIDTH` の多重定義。
