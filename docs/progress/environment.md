# 開発環境 (WSL2 / 隔離ツールチェーン)

2026-10-06 に構築。**システムやグローバル設定は一切変更していない** (sudo・apt install・npm -g・シェル設定ファイルの編集なし)。

## 構成

| 置き場所                                     | 中身                                                                                                                                                               |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `~/.pluto-toolchain/bin/pnpm`                | pnpm 10.0.0 の単体バイナリ (`package.json` の `packageManager` と一致)                                                                                             |
| `~/.pluto-toolchain/pnpm-store/`             | pnpm のパッケージストア                                                                                                                                            |
| `~/.pluto-toolchain/ms-playwright/`          | Playwright の Chromium (`PLAYWRIGHT_BROWSERS_PATH`)                                                                                                                |
| `~/.pluto-toolchain/syslibs/`                | Chromium が必要とする共有ライブラリ (`libnss3`, `libnspr4`, `libasound2t64`)。`apt-get download` で取得し `dpkg-deb -x` で展開しただけで、インストールはしていない |
| `~/.pluto-toolchain/xdg/`                    | pnpm などの設定・キャッシュ (XDG 変数でここに閉じ込める)                                                                                                           |
| `~/.pluto-toolchain/env.sh`                  | 上記を **現在のシェルだけ** に有効化するスクリプト                                                                                                                 |
| `<repo>/node_modules/`, `test-results/` など | プロジェクト内の生成物 (`.gitignore` 済み)                                                                                                                         |

Node.js はシステムの v22.22.1 (`/usr/bin/node`, `engines: >=22` を満たす) をそのまま使う。

## 使い方

```sh
. ~/.pluto-toolchain/env.sh          # シェルごとに 1 回
pnpm install --frozen-lockfile
pnpm verify
pnpm test:browser --project=webgl2   # WSL では WebGPU プロジェクトは対象外
```

## 削除方法

```sh
rm -rf ~/.pluto-toolchain
rm -rf <repo>/node_modules <repo>/test-results <repo>/playwright-report
```

## 確認済みの動作 (2026-10-06)

- `pnpm install --frozen-lockfile`: 成功
- `pnpm typecheck` / `pnpm lint`: 成功
- `pnpm test:coverage`: 145 件成功 (カバレッジ閾値は未達。`reviews/2026-10-06-codebase-review.md`)
- `pnpm test:browser --project=webgl2`: 2 件成功

## 制約

- WSL には GPU / WebGPU がないため、`webgpu` プロジェクトのブラウザテストとベンチ (`pnpm bench`、基準機での計測) はこの環境では実行できない。性能の受け入れ条件は基準機 (`docs/00-vision.md` §2) で計測すること。
- `pnpm test:browser` を CI 相当で実行するときは `CI=1` を付ける (Playwright の HTML レポートサーバーを起動しないため)。
