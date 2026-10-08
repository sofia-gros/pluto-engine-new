# 09. 高レベル API 設計規約と API カタログ

## 1. 目的

**「エンジンが持つ機能はすべて、数行で使える」** こと。Phaser 互換は不要だが、Phaser 並みかそれ以上に「書く量が少ない」ことを目指す。
内部は SoA / GPU 駆動でも、ユーザーにそれを意識させない。上級者には `pluto-engine/lowlevel` で内部を公開する。

## 2. 設計規約 (全 API 共通・必須)

| #   | 規約                                                                                                                                                                      |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1  | **機能を作ったら必ず高レベル入口を作る**。下位層 (render, sim, physics...) に機能を追加するタスクは、対応する `scene.*` API と `examples/` のサンプルまで含めて完了とする |
| A2  | 生成は `scene.add.<名前>(必須引数..., config?)`、戻り値は `<名前>Handle`。必須引数は最大 4 個、残りは `config` オブジェクト                                               |
| A3  | `config` の全フィールドは省略可能。既定値は `DEFAULT_<NAME>_CONFIG` (`Readonly`, export) に集約し JSDoc に記載                                                            |
| A4  | ハンドルの setter は `setXxx(v): this` (チェーン可)。プロパティアクセサ (`handle.x = 10`) も提供する                                                                      |
| A5  | 破棄は `handle.destroy()`。破棄済みハンドルの使用は `__DEBUG__` で `PlutoError(InvalidState)`                                                                             |
| A6  | 1,000 個を超える生成用に **一括 API** を用意する (`add.sprites`, `SpriteBatch`)。一括 API は個別オブジェクトを作らない                                                    |
| A7  | 時間の単位は **ミリ秒**、名前に `Ms` を付ける (`durationMs`, `delayMs`)。`update(time, deltaMs)` も ms。内部 ECS は秒 (`dt`) で変換は `scene/game.ts` だけが行う          |
| A8  | 角度は `rotation` (ラジアン) と `angle` (度) の両方を提供                                                                                                                 |
| A9  | 色は `0xRRGGBB` の数値、アルファは別引数 `alpha` (0〜1)                                                                                                                   |
| A10 | 非同期は `Game.create()` と `load.*` 系のみ。それ以外は同期 API                                                                                                           |
| A11 | イベント名は小文字連結 (`'pointerdown'`, `'complete'`)。`handle.on(name, fn)` / `off` / `once`                                                                            |
| A12 | バックエンドで使えない機能は `XxxHandle.isSupported(game)` で事前確認可能にし、非対応時に生成したら `PlutoError(UnsupportedFeature)` (理由と代替案を日本語で)             |
| A13 | オプション機能の **無言の無効化禁止**。品質表 (`docs/08-simulation.md` §2) で無効になる設定は `logger.warn` を 1 回出す                                                   |
| A14 | 入力検証は API 境界 (scene 層) で行う。下位層には検証済みの値だけを渡す                                                                                                   |
| A15 | A1 の例外: 機能の可視化を後続タスクに分ける場合 (流体: T-7.1〜T-7.3 → T-7.4) は、可視化タスクでまとめてサンプルを作る。ロードマップに明記したものに限る                   |

## 3. 最小コード例 (この形を保つこと)

```ts
import { Game, Scene } from 'pluto-engine';

class Main extends Scene {
  public preload(): void {
    this.load.atlas('units', 'units.png', 'units.json');
  }
  public create(): void {
    const army = this.add.crowd({
      count: 1_000_000,
      texture: 'units',
      frame: 'soldier',
      goal: { x: 1600, y: 900 },
    });
    this.input.on('pointerdown', (p) => army.setGoal(p.worldX, p.worldY));
  }
}

await Game.create({ parent: document.body, width: 1920, height: 1080, scenes: [Main] });
```

## 4. API カタログ (名前固定。実装タスクは右列)

### 4.1 Game / GameConfig (`scene/game.ts`, `scene/game-config.ts`) — T-5.1

| API                                                 | 説明                                   |
| --------------------------------------------------- | -------------------------------------- |
| `Game.create(config: GameConfig): Promise<Game>`    | デバイス生成・初期化・最初のシーン開始 |
| `game.pause()` / `game.resume()` / `game.destroy()` | ループ制御                             |
| `game.backend: 'webgpu' \| 'webgl2'`                | 使用中バックエンド                     |
| `game.isParallel: boolean`                          | 並列実行中か                           |

`GameConfig`: `parent?: HTMLElement`, `canvas?: HTMLCanvasElement`, `width`, `height`, `resolution?` (既定 `devicePixelRatio`), `backgroundColor?` (既定 `0x000000`), `pixelArt?` (既定 false), `backend?` (`'auto'`), `maxSprites?` (1,048,576), `maxEntities?` (1,048,576), `maxWorkers?` (7), `fixedStepHz?` (60), `maxSubSteps?` (4), `scenes: SceneClass[]`, `debug?: { stats?: boolean }`。

### 4.2 Scene (`scene/scene.ts`) — T-5.1

ライフサイクル: `init(data)`, `preload()`, `create()`, `update(time, deltaMs)`, `shutdown()`。

| プロパティ     | 型                                                            | タスク  |
| -------------- | ------------------------------------------------------------- | ------- |
| `this.add`     | `GameObjectFactory`                                           | T-5.1〜 |
| `this.load`    | `Loader`                                                      | T-5.1   |
| `this.input`   | 入力                                                          | T-5.2   |
| `this.cameras` | `CameraManager`                                               | T-5.1   |
| `this.tweens`  | `TweenManager`                                                | T-5.3   |
| `this.anims`   | `AnimsManager`                                                | T-5.4   |
| `this.time`    | `TimerManager`                                                | T-5.5   |
| `this.physics` | `PhysicsManager`                                              | T-8.1   |
| `this.sound`   | `SoundManager`                                                | T-9.6   |
| `this.fx`      | `FxManager`                                                   | T-9.7   |
| `this.lights`  | `LightsManager`                                               | T-9.5   |
| `this.scenes`  | `SceneManager` (`start`, `stop`, `pause`, `resume`, `launch`) | T-5.1   |
| `this.events`  | シーンイベント (`'update'`, `'shutdown'`)                     | T-5.1   |
| `this.world`   | 低レベル `World` (上級者向け)                                 | T-5.1   |

### 4.3 `this.add.*` (`scene/game-object-factory.ts`)

| API                                  | 戻り値                    | タスク |
| ------------------------------------ | ------------------------- | ------ |
| `image(x, y, texture, frame?)`       | `SpriteHandle`            | T-5.1  |
| `sprite(x, y, texture, frame?)`      | `SpriteHandle` (アニメ可) | T-5.1  |
| `sprites(config: SpriteBatchConfig)` | `SpriteBatch`             | T-5.1  |
| `container(x, y, children?)`         | `ContainerHandle`         | T-5.6  |
| `group(config?)`                     | `GroupHandle`             | T-5.6  |
| `particles(x, y, config)`            | `ParticlesHandle`         | T-6.2  |
| `crowd(config)`                      | `CrowdHandle`             | T-6.3  |
| `fluid(config)`                      | `FluidHandle`             | T-7.1  |
| `text(x, y, content, style?)`        | `TextHandle`              | T-9.2  |
| `tilemap(config)`                    | `TilemapHandle`           | T-9.3  |
| `graphics()`                         | `GraphicsHandle`          | T-9.4  |
| `light(x, y, config?)`               | `LightHandle`             | T-9.5  |

### 4.4 SpriteHandle (`scene/handles/sprite-handle.ts`) — T-5.1

プロパティ: `x, y, rotation, angle, scaleX, scaleY, alpha, tint, visible, layer, depth (=sortKey), flipX, flipY, frame, blend ('alpha'|'additive'|'opaque')`。
メソッド: `setPosition(x, y)`, `setScale(sx, sy?)`, `setRotation`, `setAngle`, `setAlpha`, `setTint`, `setVisible`, `setLayer`, `setDepth`, `setFlip(x, y)`, `setFrame`, `setBlend`, `setOrigin(ax, ay)`, `setInteractive()` (T-5.2), `play(animKey)` (T-5.4), `setOccluder(isOccluder)` (T-9.5), `on/off/once`, `destroy()`。

- `setOrigin` は `docs/07-renderer.md` §4 の派生フレームで実現する (既定 0.5, 0.5 = フレームのアンカー)。
- イベント: `'pointerdown' | 'pointerup' | 'pointerover' | 'pointerout'` (T-5.2, `setInteractive()` 後のみ), `'animationcomplete'` (T-5.4)。

### 4.5 SpriteBatch (`scene/handles/sprite-batch.ts`) — T-5.1

`SpriteBatchConfig`: `count`, `texture`, `frame?`, `x?: number | ((i) => number)`, `y?` 同, `layer?`, `blend?`。
メソッド: `count`, `setPositions(xs: Float32Array, ys: Float32Array)`, `setTints(Uint32Array)`, `column(name)` (内部カラムへの直接アクセス。`'x' | 'y' | 'rotation' | 'scaleX' | 'scaleY' | 'tint'`), `markDirty()`, `destroy()`。`column(name)` が返す配列は、同じアーキタイプに spawn すると (内部バッファの伸長で) 古くなることがあるので、保持せず使うたびに取り直す。

### 4.6 Loader (`assets/loader.ts` の `Loader` をそのまま公開。GPU 登録は `scene/scene.ts` の preload 完了処理が行う) — T-5.1 / 各タスク

`image(key, url)` T-5.1, `atlas(key, imageUrl, jsonUrl)` T-5.1, `json(key, url)` T-5.1, `audio(key, url)` T-9.6, `font(key, imageUrl, jsonUrl)` T-9.2, `tilemap(key, url)` T-9.3, `ktx2(key, url)` T-9.1。イベント: `'progress' (0〜1)`, `'complete'`, `'error'`。

> [!NOTE]
> メソッド名は `Loader` の実装 (`addImage` / `addAtlas` / `addJson`) に従う。このカタログの `image` / `atlas` / `json` は「その種別の読込」全般を指す略記である。

### 4.7 入力 (`this.input`) — T-5.2

`pointer` (`x, y, worldX, worldY, isDown, justDown, justUp`), `pointers[]`, `keyboard.isDown(KeyCode.X)`, `keyboard.justPressed(k)`, `keyboard.justReleased(k)`, `keyboard.cursors()` (`{ up, down, left, right, space, shift }` の bool ゲッター), `gamepads[i]`, イベント `'pointerdown' | 'pointerup' | 'pointermove' | 'wheel'`。
ハンドルのヒットテストは CPU Tier の AABB のみ (GPU Tier は非対応)。

### 4.8 カメラ (`this.cameras`) — T-5.1

`main`, `add(x, y, w, h)`, `remove(cam)`。Camera: `setZoom`, `setRotation`, `centerOn(x, y)`, `startFollow(handle, lerp?)`, `stopFollow()`, `setBounds(x, y, w, h)`, `shake(durationMs, intensity)` T-5.5, `fade(durationMs, color)` T-5.5, `flash(durationMs, color)` T-5.5, `screenToWorld(x, y, out)`。

### 4.9 トゥイーン・アニメ・時間

| API                                                                                                                              | タスク |
| -------------------------------------------------------------------------------------------------------------------------------- | ------ |
| `tweens.add({ targets, props, durationMs, delayMs?, ease?, repeat?, yoyo?, onComplete? }) → TweenHandle`                         | T-5.3  |
| `tweens.timeline(steps) → TimelineHandle`                                                                                        | T-5.3  |
| `anims.create({ key, frames, frameRate, repeat })`, `anims.frames(texture, { prefix, start, end, zeroPad? })`                    | T-5.4  |
| `time.delayedCall(delayMs, cb) → TimerEvent`, `time.addLoop(intervalMs, cb, repeat?) → TimerEvent`, `time.now`, `time.timeScale` | T-5.5  |

`TimerEvent`: `remove(): void` (二重呼び出しは何もしない), `readonly isActive: boolean`。`addLoop` の `repeat` 既定 -1 (無限)、`repeat: n` は n 回呼んで終了。
`time.timeScale` (既定 1, 0 以上) は **このシーンのタイマーだけ** に影響する (トゥイーン・アニメ・物理には影響しない)。`time.now` はシーン開始からの経過 ms (timeScale 適用後)。

`TweenHandle`: `play()`, `pause()`, `stop()` (現在値で停止), `isPlaying`, `on('complete')`, `destroy()`。対象 `props` は `x, y, rotation, angle, scaleX, scaleY, alpha` のみ。`repeat` 既定 0、`-1` で無限。

`ease` は `animation/easing.ts` の名前 (`'Linear'`, `'QuadIn'`, `'QuadOut'`, `'QuadInOut'`, `'CubicIn'` ... `'BounceOut'`, `'ElasticOut'`, `'BackOut'`)。番号表 `Ease` (WGSL と共有, 値固定):

| 値  | 名前         | 値  | 名前         | 値  | 名前        | 値  | 名前           |
| --- | ------------ | --- | ------------ | --- | ----------- | --- | -------------- |
| 0   | `Linear`     | 8   | `QuartOut`   | 16  | `ExpoIn`    | 24  | `BackInOut`    |
| 1   | `QuadIn`     | 9   | `QuartInOut` | 17  | `ExpoOut`   | 25  | `ElasticIn`    |
| 2   | `QuadOut`    | 10  | `QuintIn`    | 18  | `ExpoInOut` | 26  | `ElasticOut`   |
| 3   | `QuadInOut`  | 11  | `QuintOut`   | 19  | `CircIn`    | 27  | `ElasticInOut` |
| 4   | `CubicIn`    | 12  | `QuintInOut` | 20  | `CircOut`   | 28  | `BounceIn`     |
| 5   | `CubicOut`   | 13  | `SineIn`     | 21  | `CircInOut` | 29  | `BounceOut`    |
| 6   | `CubicInOut` | 14  | `SineOut`    | 22  | `BackIn`    | 30  | `BounceInOut`  |
| 7   | `QuartIn`    | 15  | `SineInOut`  | 23  | `BackOut`   |     |                |

### 4.9a カメラエフェクト — T-5.5

`shake(durationMs, intensity)`: `intensity` はビューポート短辺に対する最大振幅の割合 (既定 0.01)。`fade(durationMs, color, alpha = 1)`: 透明 → 指定色。`flash(durationMs, color, alpha = 1)`: 指定色 → 透明。描画は `camera:fx` パス (`docs/07-renderer.md` §12)。同種エフェクトの再呼び出しは上書き。完了時にカメラが `'camerafadecomplete' | 'cameraflashcomplete' | 'camerashakecomplete'` を発火。

### 4.9b Group / Container — T-5.6

`group(config?: GroupConfig)`: `GroupConfig` = `{ maxSize?: number }` (既定 0 = 無制限)。
`GroupHandle`: `add(handle)`, `remove(handle, destroyMember = false)`, `contains(handle)`, `size`, `getMembers(): readonly SpriteHandle[]` (コールドパス), `setVisible`, `setAlpha`, `setTint`, `setLayer`, `incPosition(dx, dy)`, `clear(destroyMembers = false)`, `destroy(destroyMembers = false)`。一括操作は **呼び出し時点のメンバーに即時適用** (継承はしない)。破棄されたメンバーは自動で外れる。`maxSize` 超過は `PlutoError(CapacityExceeded)`。

`container(x, y, children?: readonly SpriteHandle[])`: `ContainerHandle` = `x, y, rotation, angle, scaleX, scaleY` (Transform の親として子に **継承される**), `setPosition`, `setRotation`, `setAngle`, `setScale`, `add(handle)`, `remove(handle)`, `setVisible(v)` (現在の子孫すべてに即時適用), `destroy()` (子孫も破棄)。コンテナはコンテナを子に持てる (最大深さ 8、超過・循環は `PlutoError(InvalidArgument)`)。

### 4.9c テキスト・タイルマップ・図形・ライト — T-9.2〜T-9.5

**テキスト** `text(x, y, content, style?: TextStyle) → TextHandle` (T-9.2)
`TextStyle` (`DEFAULT_TEXT_STYLE`): `font?: string` (既定: 最初に読み込んだフォント。1 つも無ければ `PlutoError(InvalidState)`), `fontSize` (32, px), `color` (0xffffff), `alpha` (1), `align` (`'left' | 'center' | 'right'`, 既定 `'left'`), `lineHeight` (1.2, fontSize に対する倍率), `letterSpacing` (0, px), `maxWidth` (0 = 折り返しなし。正なら空白位置で折り返し、空白が無い行は文字単位), `maxGlyphs` (`TEXT_DEFAULT_MAX_GLYPHS` = 256), `layer` (0), `depth` (0)。
`TextHandle`: `setText(content)`, `setStyle(partial)`, `width` / `height` (レイアウト後の px), スプライトと同じ変換・表示系 (`x, y, rotation, angle, scaleX, scaleY, alpha, visible, layer, depth` と対応 setter, `setOrigin`), `destroy()`。改行は `\n`。フォントに無いグリフは `'?'` (それも無ければ空白) に置換し `logger.warn` を 1 回。`maxGlyphs` 超過は `PlutoError(CapacityExceeded)`。描画順の制約は `docs/07-renderer.md` §12。

**タイルマップ** `tilemap(config: TilemapConfig) → TilemapHandle` (T-9.3)
`TilemapConfig`: `key` (必須, `load.tilemap` のキー), `tilesets?: Readonly<Record<string, string>>` (Tiled のタイルセット名 → テクスチャキー。既定は同名), `x` (0), `y` (0), `baseLayer` (0。Tiled のタイルレイヤー i は `layer = baseLayer + i`)。
`TilemapHandle`: `width`, `height` (タイル数), `tileWidth`, `tileHeight`, `layerNames: readonly string[]`, `getTileAt(layerName, tx, ty): number` (GID, 0 = 空), `putTileAt(layerName, tx, ty, gid)`, `removeTileAt(layerName, tx, ty)`, `worldToTile(x, y, out)`, `tileToWorld(tx, ty, out)`, `setLayerVisible(name, v)`, `setLayerOccluder(name, v)` (T-9.5 の GI 用), `getObjects(layerName): readonly TiledObject[]` (`TiledObject` = `{ id, name, type, x, y, width, height, rotation, properties }`), `destroy()`。
対応形式: orthogonal、有限マップ、タイルレイヤー / オブジェクトレイヤー、データは CSV 配列・base64 (非圧縮 / gzip / zlib。展開はブラウザ組込の `DecompressionStream`)。isometric 等・無限マップ・zstd は `PlutoError(UnsupportedFeature)`。チャンクは `TILEMAP_CHUNK_SIZE` (32) タイル四方。

**図形** `graphics() → GraphicsHandle` (T-9.4)
スタイル: `fillStyle(color, alpha = 1)`, `lineStyle(width, color, alpha = 1)`。描画コマンド: `fillRect(x, y, w, h)`, `strokeRect`, `fillCircle(x, y, r)`, `strokeCircle`, `fillTriangle(x1, y1, x2, y2, x3, y3)`, `fillPolygon(points)`, `strokePolygon(points, closed = true)`, `lineBetween(x1, y1, x2, y2)`, `clear()`。`points` は `[x0, y0, x1, y1, ...]` (`readonly number[] | Float32Array`)。すべて `this` を返す。変換・表示系はテキストと同じ。
円の分割数 `clamp(ceil(2πr / 8), 12, 128)`。多角形の塗りは単純多角形のみ (イヤークリッピング)、自己交差は `PlutoError(InvalidArgument)`。線の結合はマイター (マイター長が線幅の 4 倍を超えたらベベル)。頂点は全 GraphicsHandle 共有の `GRAPHICS_MAX_VERTICES` から割り当て、超過は `PlutoError(CapacityExceeded)`。コマンドの変更はコールドパス (毎フレーム描き直す用途は想定しない)。

**ライト** `light(x, y, config?: LightConfig) → LightHandle` (T-9.5)
`LightConfig` (`DEFAULT_LIGHT_CONFIG`): `radius` (200, px), `color` (0xffffff), `intensity` (1), `visible` (true)。減衰は `(1 - d / radius)^2` (d ≥ radius で 0)。`LightHandle`: `x, y, radius, color, intensity, visible` と setter, `destroy()`。同時 `MAX_LIGHTS` (4096) を超えたら `PlutoError(CapacityExceeded)`。
`this.lights` (`LightsManager`): `enable({ ambientColor = 0xffffff, ambientIntensity = 0.2, mode = 'simple' })`, `disable()`, `static isGiSupported(game)`。`mode: 'gi'` は Radiance Cascades (WebGPU のみ)。遮蔽物は `SpriteHandle.setOccluder(true)` (`FLAG_OCCLUDER`) と `TilemapHandle.setLayerOccluder`。WebGL2 で `'gi'` を指定すると `logger.warn` 1 回で `'simple'` に縮退 (A13)。ライティング無効時はライトを生成しても描画に影響しない (生成時に `logger.warn` 1 回)。

### 4.10 GPU Tier ハンドル

| ハンドル          | 主な API                                                                                                                                                                                | タスク        |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------- |
| `ParticlesHandle` | `start()`, `stop()`, `explode(count, x?, y?)`, `setEmitRate(perSec)`, `setPosition(x, y)`, `aliveEstimate`                                                                              | T-6.2         |
| `CrowdHandle`     | `setGoal(x, y, goalIndex?)`, `addObstacleRect(x, y, w, h)`, `clearObstacles()`, `setMaxSpeed(v)`, `count`, 設定 `avoidance?: boolean` (WebGL2 では無効 + warn)                          | T-6.3 / T-6.4 |
| `FluidHandle`     | `type: 'grid' \| 'pbf' \| 'mpm'`, `addForce(x, y, fx, fy, radius)`, `addDye(x, y, color, radius)` (grid), `addParticles(x, y, w, h, count)` (pbf/mpm), `static isSupported(game, type)` | T-7.x         |

### 4.11 物理 (`this.physics`) — T-8.x

`arcade.add(handle, config?) → BodyHandle`, `arcade.collide(a, b, cb?)`, `arcade.overlap(a, b, cb)`, `arcade.setGravity(x, y)`, `arcade.setBounds(x, y, w, h)`, `rigid.add(handle, shape, config?) → BodyHandle`, `rigid.setGravity(x, y)`。
`BodyHandle`: `setVelocity(x, y)`, `setAcceleration`, `setBounce`, `setDrag`, `setImmovable`, `velocityX/Y`, `onCollide(cb)`。

### 4.12 音・FX — T-9.6 / T-9.7

`sound.play(key, { volume?, loop?, rate?, pan? }) → Sound`, `sound.setVolume(v)`, `sound.mute`。`Sound`: `stop()`, `pause()`, `resume()`, `setVolume`, `setRate`, `setPan`, `isPlaying`, `on('complete')`。
`load.ktx2(key, url)` (T-9.1) の制約は `docs/07-renderer.md` §5。
`fx.bloom({ threshold?, strength?, radius? })`, `fx.colorMatrix(preset: 'grayscale' | 'sepia' | 'none')`, `fx.clear()`。
