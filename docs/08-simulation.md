# 08. シミュレーション仕様 (GPU Tier / 物理)

> アルゴリズムは下記の出典に **忠実に** 実装する。独自の近似を入れる場合は `pluto-escalate`。
> 各実装ファイルの `@file` JSDoc に `@see` で出典を書くこと。

---

## 1. GPU Tier グループ (`src/sim/gpu-group.ts`)

- GPU Tier の各機能 (パーティクル・群衆・粒子流体) は **GpuGroup** を 1 つ以上所有する。
- GpuGroup = スプライトバッファ内の連続スロット範囲 (`GPU_GROUP_ALIGN = 1024` 整列) + 機能固有の SoA GPU バッファ。
- シミュレーションシェーダは最後に **自分の範囲のスプライトインスタンス (32 バイト) を直接書き込む**。CPU は読まない。
- CPU → GPU の操作はコマンドのみ: `spawn(count, params)`, `killAll()`, `setParam(index, value)`。コマンドは uniform / 小さな storage バッファで 1 フレーム 1 回転送。
- 生存数の管理: 各要素に `alive` フラグ (u32)。死亡要素はスプライト `flags = 0` を書く。空き要素の再利用は **フリーリストを GPU 上で持たない**。代わりにリングバッファ方式 (`emitCursor` を CPU が進める) とする (パーティクル)。群衆・流体は固定数 (spawn は初期化時のみ) とする。

## 2. WebGL2 品質レベル (この表にない省略は禁止)

| 機能                       | WebGPU                | WebGL2                                                                     |
| -------------------------- | --------------------- | -------------------------------------------------------------------------- |
| パーティクル               | 全機能                | GPGPU 版 (重力・速度・寿命・色/サイズ補間)。**パーティクル同士の衝突なし** |
| 群衆: フローフィールド     | Fast Iterative Method | GPGPU ヤコビ反復 (固定 64 反復/フレーム, 収束まで複数フレームに分散)       |
| 群衆: 追従 (steer)         | あり                  | あり (GPGPU)                                                               |
| 群衆: PBD 衝突回避         | あり                  | **なし** (エージェント同士はすり抜ける)                                    |
| 流体: Stable Fluids (格子) | あり                  | あり (GPGPU)                                                               |
| 流体: PBF                  | あり                  | **なし** (`PlutoError(UnsupportedFeature)`)                                |
| 流体: MLS-MPM              | あり                  | **なし** (同上)                                                            |
| GPU 空間ハッシュ           | あり                  | なし                                                                       |
| 2D GI (Radiance Cascades)  | あり                  | **なし** (点光源のみ)                                                      |

`UnsupportedFeature` を投げる機能は、高レベル API に `isSupported()` 静的チェックを用意する (`docs/09-api-design.md`)。

---

## 3. GPU 空間ハッシュ (`src/compute/gpu-spatial-hash.ts`, `spatial/spatial-hash.wgsl`)

カウンティングソート方式 (全近傍探索の共通基盤)。

1. `cs_cell`: 各粒子のセル座標 `cell = floor(pos / cellSize)` → ハッシュ `h = (cx * 73856093 ^ cy * 19349663) % tableSize` (`tableSize` = 2 の冪, 粒子数以上)
2. `cs_count`: `atomicAdd(cellCount[h], 1)`
3. `compute/gpu-prefix-sum` で `cellStart` を作る
4. `cs_scatter`: `sortedIndex[cellStart[h] + atomicAdd(cellCursor[h], 1)] = i`
5. 近傍探索: 自セル + 周囲 8 セルを走査 (`cellSize` は相互作用半径以上)

- 同一セル内の順序は不定になる。近傍の合計処理は順序非依存な演算 (和) にのみ使う。

## 4. パーティクル (`src/sim/particles/`)

- SoA バッファ (要素数 = `capacity`, `GPU_GROUP_ALIGN` の倍数): `posX, posY, velX, velY, age, life, seed` (f32/u32) + 書き出し先スプライト範囲。
- 更新式 (半陰的オイラー): `vel += (gravity + accel) * dt; vel *= pow(drag, dt); pos += vel * dt; age += dt`
- 補間: `t = age / life` で `scale = mix(scaleStart, scaleEnd, ease(t))`, `tint = mix(colorStart, colorEnd, t)`, `alpha` 同様。イージングは `animation/easing.ts` と同じ番号表を WGSL にも持つ (主要 8 種のみ: Linear, QuadIn/Out/InOut, CubicIn/Out/InOut, SineInOut)。
- 生成: CPU が `emitCursor` (リング) と `emitCount` を uniform で渡し、`particle-emit.wgsl` が該当要素を初期化。乱数は `pcg_hash(index ^ frame)`。
- 設定 (`particle-config.ts`): `capacity, frame, emitRate, lifeMin/Max, speedMin/Max, angleMin/Max, gravityX/Y, drag, scaleStart/End, colorStart/End, alphaStart/End, blend ('alpha'|'additive'), layer`。

## 5. 群衆 (`src/sim/crowd/`)

### 5.1 データ (エージェント SoA, 要素数 = `count`)

`posX, posY, velX, velY, goalId (u32), radius, maxSpeed` + 書き出し先スプライト範囲。

### 5.2 フローフィールド (`flow-field.ts`, `crowd/flow-field.wgsl`)

- @see Treuille, Cooper, Popović, "Continuum Crowds", SIGGRAPH 2006
- @see Jeong & Whitaker, "A Fast Iterative Method for Eikonal Equations", SIAM 2008
- 格子: `width × height` セル、`cellSize` px。コスト格子 `cost: f32` (壁 = `+inf` (1e30))。
- ゴールごとにポテンシャル `phi` を Eikonal 方程式 `|∇phi| = cost` で解く (FIM: アクティブリストの代わりに「前回更新されたセルの近傍」フラグ配列で反復し、変化量 < 1e-4 で停止。WebGPU は 1 フレーム最大 `maxIterationsPerFrame = 32` 反復, 収束まで複数フレームに分散)。
- 方向場 `dir = -normalize(∇phi)` を中心差分で計算して保存 (`vec2<f32>`)。
- 最大ゴール数 `MAX_FLOW_GOALS = 8`。

### 5.3 追従 (`crowd-steer.wgsl`)

```
desired = sampleBilinear(dir[goalId], pos) * maxSpeed
vel = vel + (desired - vel) * min(1, steerStrength * dt)
pos = pos + vel * dt
壁セルに入った場合は直前位置に戻し vel を壁法線方向に反射 (反発係数 0)
rotation = atan2(vel.y, vel.x)  (alignToVelocity=true の場合)
```

### 5.4 PBD 衝突回避 (`crowd-pbd.ts`, `crowd-pbd.wgsl`) — WebGPU のみ

- @see Weiss, Litteneker, Jiang, Terzopoulos, "Position-Based Multi-Agent Dynamics for Real-Time Crowd Simulation", MIG 2017
- 短距離制約のみ実装: 距離 `d < ri + rj` のペアに対し、`Δ = 0.5 * (d - (ri + rj)) * n` を両者に逆向きに適用 (ヤコビ反復, 結果を一時バッファに `atomicAdd` せず **各エージェントが自分の補正だけを近傍から集計** して書く)。
- 反復回数 `pbdIterations` 既定 2。近傍探索は GPU 空間ハッシュ (セルサイズ = 最大半径 × 2)。
- 補正後 `vel = (posNew - posOld) / dt` で速度を更新。

## 6. 流体 (`src/sim/fluid/`)

### 6.1 Stable Fluids (格子) — 両バックエンド

- @see Stam, "Stable Fluids", SIGGRAPH 1999 / GPU Gems 1 Ch.38 (Harris)
- 格子: `velocity (RG32F)`, `density (R32F または RGBA16F で色)`, `pressure (R32F)`, `divergence (R32F)`。ping-pong。
- 1 ステップ: 移流 (セミラグランジュ, バイリニア) → 外力・ソース → 発散 → 圧力ヤコビ (`pressureIterations` 既定 20) → 勾配減算 → 密度移流 → 散逸 (`dissipation`)。
- 境界: 外周は no-slip (速度 0)。

### 6.2 PBF — WebGPU のみ

- @see Macklin & Müller, "Position Based Fluids", SIGGRAPH 2013
- カーネル: Poly6 (密度), Spiky 勾配。`restDensity`, `epsilon (CFM) = 100`, `solverIterations` 既定 3, 人工圧力 `sCorr (k=0.1, n=4, Δq=0.2h)`, XSPH 粘性 `c=0.01`。
- 近傍: GPU 空間ハッシュ (セル = h)。

### 6.3 MLS-MPM — WebGPU のみ

- @see Hu et al., "A Moving Least Squares Material Point Method with Displacement Discontinuity and Two-Way Rigid Body Coupling", SIGGRAPH 2018
- 2D, 二次 B スプライン重み, APIC。材料は `water` (弱圧縮の状態方程式) と `jelly` (Neo-Hookean 弾性体) の **2 種のみ**。`sand` / `snow` は v1 非対応 (実装禁止)。
- P2G の格子への散布は **固定小数点 `atomicAdd<i32>`** (スケール `FIXED_POINT_SCALE = 1e5`) で行う (WGSL に浮動小数 atomic がないため)。
- 1 ステップ: clear grid → P2G → grid update (重力・境界) → G2P。サブステップ `substeps` 既定 4。

### 6.4 流体の描画 (`fluid-renderer.ts`)

- 格子流体: 密度テクスチャをフルスクリーン (カメラ変換付き) で合成。
- 粒子流体: (a) 粒子を円スプライトとして加算描画 → (b) 閾値処理 + 法線近似のメタボール合成。WebGPU のみ。

---

## 7. 物理 (`src/physics/`)

### 7.1 アーケード物理 (CPU, 両ビルド)

- ボディ: AABB または円。`velX, velY, accelX, accelY, dragX, dragY, bounce, maxSpeed, mass, isStatic, isSensor, collideWorldBounds`。
- 積分: 半陰的オイラー (`FixedUpdate`, 既定 60Hz)。
- 衝突: `compute/cpu-spatial-hash.ts` でブロードフェーズ → AABB/円の判定 → 最小侵入軸で分離 → `bounce` で速度反射。
- コールバック: 衝突ペアは `RingBuffer` に (a, b) を積み、ステップ後にメインスレッドで `collide`/`overlap` イベントとして発火。
- 目標: 動的ボディ 10 万個 で ≤ 2ms (parallel ビルド)。

### 7.2 剛体物理 (CPU, XPBD)

- @see Müller et al., "Detailed Rigid Body Simulation with Extended Position Based Dynamics", SCA 2020
- 形状: 円・凸多角形 (最大 8 頂点)・カプセル。ナローフェーズ: 円-円は解析、多角形は SAT。
- サブステップ `substeps` 既定 8、位置反復 1。接触: 法線方向の非貫通制約 + 静/動摩擦。
- v1 は CPU 実装。GPU 剛体 (AVBD 等) は将来タスク (現在は実装禁止)。

---

## 8. 性能受け入れ基準 (基準機, 1920×1080, `docs/10-testing-strategy.md` §5 の方法で計測)

| シーン (`bench/scenes/`)   | 条件                                            | 基準                                                      | タスク |
| -------------------------- | ----------------------------------------------- | --------------------------------------------------------- | ------ |
| `particles.ts`             | WebGPU, 1,000,000 パーティクル                  | フレーム p99 ≤ 6.94ms、`gpuMs` (シミュレーション) ≤ 2.0ms | T-6.2  |
| `particles.ts`             | WebGL2, 100,000 パーティクル                    | フレーム p99 ≤ 6.94ms                                     | T-6.2  |
| `crowd.ts` (**G2**)        | WebGPU, 1,000,000, `avoidance: false`           | フレーム p99 ≤ 6.94ms                                     | T-6.3  |
| `crowd.ts`                 | WebGPU, 250,000, `avoidance: true`              | フレーム p99 ≤ 6.94ms                                     | T-6.4  |
| `fluid-grid.ts`            | WebGPU 512×512 / WebGL2 256×256                 | フレーム p99 ≤ 6.94ms                                     | T-7.4  |
| `fluid-particles.ts`       | WebGPU, PBF 100,000 粒子 / MLS-MPM 100,000 粒子 | フレーム p99 ≤ 6.94ms                                     | T-7.4  |
| `cpu-entities.ts` (**G4**) | parallel ビルド, アーケード動的ボディ 100,000   | `cpuMs` ≤ 2.0ms                                           | T-8.1  |
| `rigid-bodies.ts`          | 1,000 剛体 (半数が接触中)                       | `cpuMs` ≤ 2.0ms                                           | T-8.2  |

- G2 (`docs/00-vision.md`) は `avoidance: false` の条件で判定する。
- 上記は基準機での **暫定目標**。初回計測で満たせない場合は最適化を試みたうえで `pluto-escalate` (勝手に基準を下げない)。
- 表にないベンチシーン (`tweens.ts`, `tilemap.ts` など) は初回計測値をベースライン登録し、以降 10% を超える悪化を不合格とする。
