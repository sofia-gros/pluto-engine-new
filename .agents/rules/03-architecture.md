---
trigger: always_on
---

# R3: アーキテクチャ境界ルール

詳細は `docs/01-architecture.md`。`tools/check-boundaries.mjs` が機械的に検査する。

## モジュールと許可される依存先 (これ以外の import は禁止)

`core/*` = `core/debug, core/math, core/memory, core/events, core/time, core/ecs`

| モジュール (src/ 配下) | import してよいモジュール                                            |
| ---------------------- | -------------------------------------------------------------------- |
| `core/debug`           | なし                                                                 |
| `core/math`            | `core/debug`                                                         |
| `core/memory`          | `core/debug`, `core/math`                                            |
| `core/events`          | `core/debug`                                                         |
| `core/time`            | `core/debug`, `core/math`                                            |
| `core/ecs`             | `core/debug`, `core/math`, `core/memory`, `core/events`              |
| `jobs`                 | `core/*`                                                             |
| `rhi`                  | `core/debug`, `core/math`, `core/memory`, `core/events`              |
| `assets`               | `core/*`                                                             |
| `input`                | `core/*`                                                             |
| `audio`                | `core/*`, `assets`                                                   |
| `transform`            | `core/*`, `jobs`                                                     |
| `shaders`              | `core/debug`                                                         |
| `compute`              | `core/*`, `jobs`, `rhi`, `shaders`                                   |
| `render`               | `core/*`, `jobs`, `rhi`, `assets`, `transform`, `shaders`, `compute` |
| `sim`                  | `core/*`, `jobs`, `rhi`, `transform`, `shaders`, `compute`, `render` |
| `physics`              | `core/*`, `jobs`, `rhi`, `transform`, `shaders`, `compute`           |
| `animation`            | `core/*`, `transform`, `render`                                      |
| `devtools`             | `core/*`, `jobs`, `rhi`, `render`                                    |
| `scene`                | 上記すべて                                                           |
| `src/index.ts`         | `scene` のみ                                                         |
| `src/lowlevel.ts`      | すべて                                                               |
| `src/worker-main.ts`   | すべて (組込カーネルを持つモジュールと `jobs`)                       |

## 追加の封印ルール

- `rhi/webgpu/**` と `rhi/webgl2/**` を import してよいのは `rhi/` 内部のみ。外部はバックエンドを意識しない。
- `jobs/threaded-scheduler.ts` を import してよいのは `jobs/create-scheduler.ts` のみ。`src/worker-main.ts` を import してよいのは `jobs/threaded-scheduler.ts` のみ (`?worker&inline` で別バンドルになるため、レイヤー逆転の例外として許可)。`jobs/worker-entry.ts` の `runWorkerLoop` を使ってよいのは `src/worker-main.ts` のみ。
- `*.wgsl` / `*.glsl` を `?raw` で import してよいのは `src/shaders/` 内部のみ。
- 他モジュールの import は必ず `index.ts` 経由 (`../../render` は OK、`../../render/sprite/sprite-buffer` は NG)。
- `tests/` と `bench/` は `src/` の何でも (内部ファイルも) import してよい。`examples/` は `src/index.ts` (と `src/lowlevel.ts`) だけを import する。`src/` は `tests/`, `bench/`, `examples/`, `tools/` を import してはならない。
