# 描画システム変更仕様（PixelArt 化）

> **本書は `CLAUDE_OWNER.md` 5. に基づく「描画システムとの衝突」対応仕様書であり、
> ユーザー承認を得るまで実装に反映しない。**

## 対象ファイル

### 新規作成
| パス | 役割 |
|---|---|
| `src/game/render/PixelCanvas.ts` | グリッドスナップ描画プリミティブ（矩形・円・三角・線・帯グラデーション・シルエット） |
| `src/game/render/SpriteRenderer.ts` | JSON スプライトのオフスクリーン焼き込み・キャッシュ・`drawImage` |
| `src/game/render/PixelText.ts` | 縮小オフスクリーン + ニアレストネイバー拡大による文字のドット化 |
| `src/game/render/index.ts` | バレル export |
| `src/data/sprites.ts` | `import.meta.glob('./sprites/*.json')` によるスプライト自動収集（`src/data/config.ts` と同型） |
| `src/data/sprites/*.json` | スプライト定義（後述） |
| `src/data/config/pixelart.json` | ピクセルサイズ・グラデーション段数・グロー段数・アルファ量子化段数 |
| `schemas/sprite.schema.json` | スプライト JSON のスキーマ |

### 変更
| パス | 変更内容 |
|---|---|
| `src/framework/config-types.ts` | `pixelart` セクションの型定義を追加 |
| `src/data/tunables.ts` | `export const PIXELART = _c.pixelart` を追加 |
| `scripts/validate-json.mjs` | `src/data/sprites/*.json` の検証を追加 |

---

## 1. 衝突の内容

現状の描画システムは **画像素材ゼロの手続き的ベクター描画** である。調査で確認した事実:

- リポジトリ内に画像ファイルが 1 枚も存在しない（`src/` `public/` 配下に `.png/.jpg/.webp/.gif/.svg` なし）
- `drawImage` / `new Image()` / `createImageBitmap` / `OffscreenCanvas` / `ImageData` の使用箇所ゼロ
- `imageSmoothingEnabled` / `devicePixelRatio` の参照ゼロ
- CSS に `image-rendering: pixelated` なし（`src/App.vue:598-602` の `.game-canvas` は `position/inset/display` のみ）
- canvas バッキングサイズは `window.innerWidth × innerHeight`（`src/App.vue:92-99`）

PixelArt と直接衝突するのは、全域で多用されている以下の**連続階調プリミティブ**である。

対象 26 ファイルの実測値（出現回数。1 行に複数あれば複数として数える）。

| プリミティブ | 箇所 | PixelArt との衝突理由 |
|---|---|---|
| `.arc()` / `.ellipse()` | 63 + 16 = **79** | 曲線がアンチエイリアスされ、輪郭が滑らかになる |
| `createLinearGradient` / `createRadialGradient` | **27**（`addColorStop` は **67**） | 無段階の色変化。ドット絵は段階的な色帯で表現する |
| `shadowBlur`（グロー） | **33** | ガウスぼかし。ドット絵の輪郭を溶かす |
| `_roundRect` / `.roundRect` | **33** | 角丸のアンチエイリアス |
| `.stroke()` / `.strokeRect()` | 71 + 2 = **73** | 線幅が小数、`lineCap:'round'` で端が丸まる |
| `.fillText()` / `.strokeText()` | 21 + 2 = **23** | フォントのアンチエイリアス。`strokeText` は縁取り |
| `.fillRect()` | **88** | 唯一そのまま PixelArt 適合だが、座標が小数のため境界が滲む |

> **集計方法の注記:** 当初版は `grep -c` による行単位の集計で、1 行に複数の呼び出しがある場合と
> `ctx` 以外のレシーバ名を取りこぼしていた（arc 43 / ellipse 13 / stroke 60 / fillRect 77 と過少計上）。
> 上表は正規表現による全出現回数の再集計値。`strokeText` は当初版で完全に見落としていた。

**`addColorStop` が 67 箇所 / グラデーション 27 箇所 = 平均 2.5 ストップ**であることが重要。
2 色補間では既存の描画を再現できない（後述の `bandGradient` API 参照）。
3 ストップ以上のグラデーションは実測で **13 箇所**（`StgPlugin` 9 / `AerialStgPlugin` 3 /
`sideScroller._drawPillar` 1）。

## 2. 採用方式（Q1 でユーザー承認済み）

**ピクセルスナップ + スプライト併用（方式 B+C ハイブリッド）**

座標系は現状（`canvas.width = innerWidth`）を一切変えない。代わりに、
描画時だけ座標と色を仮想ピクセルグリッドへ量子化する薄い層を挟む。

```
                    ┌─────────────────────────────────────┐
ゲームロジック ───►│ 変更なし                             │
(x, y, w, h,        │ 当たり判定 / 物理 / スコア / 入力    │
 collision, score)  │ すべて現行の実座標のまま             │
                    └──────────────┬──────────────────────┘
                                   │ 同じ x,y,w,h を渡す
                    ┌──────────────▼──────────────────────┐
描画層 ───────────► │ PixelCanvas / SpriteRenderer        │◄── src/data/sprites/*.json
(ここだけ変更)      │ 座標を PIXELART.size にスナップ      │◄── src/data/config/pixelart.json
                    └──────────────┬──────────────────────┘
                                   │ fillRect / drawImage のみ
                    ┌──────────────▼──────────────────────┐
                    │ CanvasRenderingContext2D（現行のまま）│
                    └─────────────────────────────────────┘
```

### なぜ低解像度オフスクリーン方式を採らないか

全画面を 480×270 等に落として拡大する方式は最も「本物のドット絵」に近いが、
`gY = H - PHYSICS.groundYOffset`（`physics.json` の 80）や `_spawnHazard` が使う
`H - BACKGROUND.groundHeight` といった**実ピクセル前提の定数がゲームロジック側に存在する**ため、
描画解像度と論理解像度が二重管理になる。`CLAUDE_OWNER.md` の
「ゲームプレイ上の機能を侵害しない」要件を満たす保証が難しく、不採用とした。

---

## 3. 用語と単位の規則（**API より先に確定させる**）

各仕様書で「1 ピクセル」という語を単位の区別なく使っていたため、
以下の 2 語を厳密に使い分ける。**仕様書中の「1 ピクセル」は原則すべて「1 セル」を指す。**

| 用語 | 意味 | 例 |
|---|---|---|
| **実px** | canvas のバッキングピクセル。`canvas.width` の単位 | `PIXELART.size = 4` は「1 セル = 4 実px」 |
| **セル**（仮想ピクセル） | ドット絵の 1 ドット。`PIXELART.size` 実px に相当 | 「枠線 1 セル」= 実際には 4 実px の線 |

### スナップ関数（位置と寸法で規則が異なる）

```ts
const S = PIXELART.size

/** 位置: 最寄りのグリッドへ丸める */
const _snapPos  = (v: number): number => Math.round(v / S) * S

/** 寸法: 切り上げ、かつ最低 1 セル。0 に潰れるのを防ぐ */
const _snapSize = (v: number): number => Math.max(S, Math.ceil(v / S) * S)
```

**位置に `round`、寸法に `ceil` + 下限 1 セル**を使うのが要点。
当初版は両方に `round` を想定していたため、`_snap(1) === 0`（`size=4` のとき）となり、
「幅 1 の罫線」「1px の枠線」が**消える**という欠陥があった
（[16-PuzzlePlugin.md](16-PuzzlePlugin.md) の方眼罫線、
[19-TetrisFeature.md](19-TetrisFeature.md) のグリッド線、
[22-SpecialFeature.md](22-SpecialFeature.md) のボス HP バー枠が該当）。
`_snapSize` によりこれらは最低 1 セル（4 実px）の太さで必ず描かれる。

太さを引数に取る API（`line` / `arcBlocks` / `block` のエッジ）は
**セル数で指定する**（`thickness: 1` = 1 セル = 4 実px）。実px では受け取らない。

### スナップを行う座標空間（**デバイス空間で行う**）

`sideScroller._drawPlayer()` は `translate` / `scale` / `rotate` を適用した**後**に
プラグインの `drawPlayer()` を呼ぶ（`sideScroller.ts:992-1006`）。
そのためローカル座標をスナップしても、変換後の画面座標はグリッドに乗らない。

**決定: `PixelCanvas` は現在の変換行列を読み、デバイス空間でスナップする。**

```ts
rect(x, y, w, h, color) {
  const m = this.ctx.getTransform()          // 現在の合成変換
  // 矩形の対角 2 点をデバイス空間へ写す
  const p0 = { x: m.a * x + m.c * y + m.e,           y: m.b * x + m.d * y + m.f }
  const p1 = { x: m.a * (x+w) + m.c * (y+h) + m.e,   y: m.b * (x+w) + m.d * (y+h) + m.f }
  const dx = _snapPos(Math.min(p0.x, p1.x))
  const dy = _snapPos(Math.min(p0.y, p1.y))
  const dw = _snapSize(Math.abs(p1.x - p0.x))
  const dh = _snapSize(Math.abs(p1.y - p0.y))
  this.ctx.save()
  this.ctx.setTransform(1, 0, 0, 1, 0, 0)    // 単位行列で描く
  this.ctx.fillStyle = color
  this.ctx.fillRect(dx, dy, dw, dh)
  this.ctx.restore()
}
```

- 回転が直角（`-90°`）または無回転であれば、軸並行矩形は軸並行矩形に写るため
  この 2 点変換で正しい。**本プロジェクトの回転は `-90°` のみ**
  （`sideScroller.ts:1001`）なので条件を満たす
- これにより **D1（スカッシュ＆ストレッチ）と D2（縦モードの回転）が同時に解決する。**
  倍率の量子化は不要になり、`scale` の小数倍率のまま最終出力はグリッドに整列する
- **`ctx.scale` に渡す値も含め、`sideScroller` 側の変換の計算式は一切変更しない**

## 4. `PixelCanvas` API 設計

`CanvasRenderingContext2D` をラップし、全出力を `fillRect` へ正規化する。
座標・寸法はすべて**呼び出し側のローカル座標**で受け取り、
内部でデバイス空間へ変換してからスナップする（上記の規則）。

```ts
// src/game/render/PixelCanvas.ts
export class PixelCanvas {
  constructor(private ctx: CanvasRenderingContext2D) {}

  /** グリッドスナップ矩形。全プリミティブの最終出力先 */
  rect(x: number, y: number, w: number, h: number, color: string): void

  /** ミッドポイント円アルゴリズムによるブロック円（arc の代替） */
  circle(cx: number, cy: number, r: number, color: string): void

  /** ブロック楕円（ellipse の代替） */
  ellipse(cx: number, cy: number, rx: number, ry: number, color: string): void

  /** 階段状の三角形（spike の代替） */
  tri(x: number, y: number, w: number, h: number, dir: 'up'|'down'|'left'|'right', color: string): void

  /** Bresenham によるブロック線（stroke の代替）。thickness はセル単位（§3） */
  line(x0: number, y0: number, x1: number, y1: number, color: string, thickness: number): void

  /** N 段の色帯グラデーション（createLinearGradient の代替）
   *
   *  stops は createLinearGradient の addColorStop と同じ [位置, 色] の配列。
   *  位置は 0..1。既存コードのストップをそのまま移植できるようにするため、
   *  2 色固定ではなく可変長の配列で受け取る。
   *
   *  実測で 3 ストップのグラデーションが 13 箇所あり（StgPlugin 9 /
   *  AerialStgPlugin 3 / sideScroller._drawPillar 1）、2 色 API では
   *  「色・ストップ位置を変更しない」という本仕様の前提を満たせない。
   *
   *  例: _drawPillar の 3 ストップ
   *    px.bandGradient(x, y, w, h, [
   *      [0, color],
   *      [HAZARD_VFX.pillarHighlightStop, lighten(color, ...)],
   *      [1, color],
   *    ], 'h', PIXELART.gradientSteps)
   */
  bandGradient(x: number, y: number, w: number, h: number,
               stops: readonly (readonly [number, string])[],
               axis: 'v'|'h', steps: number): void

  /** 放射グラデーションの帯版（createRadialGradient の代替）
   *  用途: ビネット、太陽のグロー、松明の光 */
  bandRadial(cx: number, cy: number, r0: number, r1: number,
             stops: readonly (readonly [number, string])[], steps: number): void

  /** 高さ関数をグリッド列でサンプリングした階段シルエット（山・丘・ビル群の代替） */
  ridge(x0: number, x1: number, baseY: number,
        heightAt: (worldX: number) => number, color: string): void

  /** ブロックハロー（shadowBlur の代替）。shape を段階的に外側へ拡張して重ねる */
  halo(draw: (expand: number, color: string) => void, color: string, steps: number): void

  /** アルファを段数量子化して適用するスコープ */
  withAlpha(alpha: number, body: () => void): void

  // ── 以下はファイル別仕様書の作成過程で必要性が判明したもの ──

  /** 立体ブロック（ベース色 + 上/左の明色 1px + 下/右の暗色 1px）
   *  用途: テトリミノ、パズルの壁と駒、汎用ブロック
   *  参照: 15-TetrisPlugin / 16-PuzzlePlugin / 19-TetrisFeature / 20-PuzzleFeature */
  block(x: number, y: number, w: number, h: number, base: string): void

  /** 2 色の市松ディザ（半透明の代替表現）
   *  用途: 星雲、光条、霧、ステルス外套
   *  参照: 04-StgPlugin / 06-SurvivalPlugin / 07-AquaticPlugin / 14-RpgPlugin / 22-SpecialFeature */
  dither(x: number, y: number, w: number, h: number,
         colorA: string, colorB: string, ratio: number): void

  /** 四隅を cut ピクセル分だけ欠けさせた矩形（角丸の代替）
   *  用途: パネル、セル、カード状の UI
   *  参照: 20-PuzzleFeature（_roundRect 14 箇所の置換先） */
  roundedRect(x: number, y: number, w: number, h: number, color: string, cut: number): void

  /** 円弧上にブロックを並べる（arc + stroke の代替）
   *  用途: 近接攻撃の斬撃
   *  参照: 21-SurvivalFeature */
  arcBlocks(cx: number, cy: number, r: number,
            startAngle: number, endAngle: number, color: string, thickness: number): void

  // ── P3 実装時に必要性が判明し追加したもの ──

  /** ブロック半円（arc の半円の代替）。dir で膨らむ向きを指定
   *  用途: アーチの頂部、丸い丘の稜線
   *  参照: 11-ArenaPlugin / 13-PlatformerPlugin（重複実装から本体へ昇格） */
  halfCircle(cx: number, cy: number, r: number, dir: 'up' | 'down', color: string): void
}
```

`block()` と `dither()` は 4〜6 本の仕様書から参照される共通表現であり、
各ファイルで個別に実装せず `PixelCanvas` に集約する
（`CLAUDE.md` の「同じロジックが 2 箇所以上に現れたらヘルパーに抽出」に沿う）。

### 量子化の規則

すべて `src/data/config/pixelart.json` から読む。**コード内に数値を直書きしない。**

```jsonc
{
  "section": "pixelart",
  "size": 4,                 // 1 セル = 何実px か
  "gradientSteps": 6,        // グラデーションを何段の色帯に分割するか
  "haloSteps": 2,            // グローを何段のブロックハローで表現するか
  "haloAlphaFalloff": 0.45,  // ハロー 1 段ごとのアルファ減衰率
  "alphaSteps": 8,           // globalAlpha の量子化段数
  "ditherRatioSteps": 4,     // ディザの混合比の段数
  "textScale": 3,            // 文字のドット化倍率（1/3 に縮小 → 3 倍拡大）
  "spriteCacheMax": 256,     // スプライト焼き込みキャッシュの上限（FIFO）
  "textCacheMax": 128        // 文字オフスクリーンキャッシュの上限（FIFO）
}
```

`spriteSnap` は当初版にあったが削除した。§3 でデバイス空間スナップを
全描画に一律適用すると決めたため、スプライトだけ例外にする設定は不要になった。

スナップ関数の定義は §3 を参照（位置は `_snapPos`、寸法は `_snapSize`）。

---

## 5. スプライト方式（キャラクター・敵・アイテム）

### JSON 形式（`src/data/sprites/*.json`）

```jsonc
{
  "$schema": "../../../schemas/sprite.schema.json",
  "id": "player_base",
  "w": 9,
  "h": 13,
  "palette": {
    "B": "#e8e8f8",   // body
    "H": "#f0f0ff",   // head
    "E": "#222244",   // eye
    "L": "#aaaacc"    // limb
  },
  "frames": {
    "idle":  ["...HHH...", "..HHEHH..", "...HHH...", "..BBBBB..", "..BBBBB..",
              "..BBBBB..", ".LBBBBBL.", ".L.BBB.L.", "...B.B...", "...L.L...",
              "...L.L...", "..LL.LL..", "..LL.LL.."],
    "run_a": ["..."],
    "run_b": ["..."]
  }
}
```

- `"."` = 透明。それ以外の 1 文字が `palette` のキーに対応する。
- `frames` のキーは各描画呼び出し側が選ぶ。既存の `onGround` / `runCycle` 引数だけで
  フレームを決めるため、**新しい状態変数は一切追加しない。**

#### 補足: スプライトの解像度（`w`/`h`）は `PIXELART.size` と独立（P2で確認・追記）

`SpriteRenderer` はスプライト JSON が宣言する `w`×`h` をそのまま焼き込みキャンバスの
解像度として使い（`SpriteRenderer.ts:60-61`）、`PixelCanvas.sprite()` の転送先サイズ
（呼び出し側が渡す実際の当たり判定サイズ、例: `Player` の `36×52`）へ `drawImage` で
引き伸ばすだけである。**この焼き込み解像度は `PIXELART.size`（背景・障害物側のセルサイズ）
と一切連動していない。**

そのため「重要なオブジェクト（自機など）だけスプライトの解像度を上げる」対応は、
コード変更なしで当該スプライト JSON の `w`/`h` を大きくするだけで実現できる
（P2 で `player_base.json` を当初の 9×13 から最終的に 27×39 まで引き上げた際に確認）。
背景・障害物などプロシージャル描画側の粒度（`PIXELART.size`）を変える必要はない。
これは実在のドット絵ゲームでも一般的な技法（背景は粗く、主人公など重要な要素だけ精細）であり、
仕様上の反則や特例ではない。今後のジャンルプラグイン（P3 以降）でも、
重要な自機・敵スプライトについて同様の判断がありうる。実施するかはユーザーと都度相談する。

### `SpriteRenderer` API（**確定仕様**）

各ファイル別仕様書が `px.sprite()` と `sprites.draw()` の 2 通りで書いていたが、
**`PixelCanvas` に `sprite()` を生やし、内部で `SpriteRenderer` に委譲する**形に統一する。
呼び出し側は `PixelCanvas` だけを見ればよい。

```ts
/** 動的色スロットの解決値。@main / @shade 等のキー → 実際の色 */
export type SpriteSlots = Readonly<Record<string, string>>

export interface SpriteDrawOptions {
  /** frames のキー。省略時は 'idle' */
  frame?: string
  /** 動的色スロットの解決値。パレットに @ キーがある場合は必須 */
  slots?: SpriteSlots
  /** 左右反転（進行方向の反転などに使う）。既定 false */
  flipX?: boolean
}

export class SpriteRenderer {
  /** 焼き込み済みスプライトを ctx へ転送する。
   *  dw / dh には呼び出し側の既存の w / h をそのまま渡すこと
   *  （当たり判定と見た目のサイズを一致させるため）。
   *  戻り値は描画できたか。false の場合は何も描かれていない。 */
  draw(ctx: CanvasRenderingContext2D, id: string,
       dx: number, dy: number, dw: number, dh: number,
       opts?: SpriteDrawOptions): boolean
}

// PixelCanvas 側のファサード（呼び出し側はこちらを使う）
class PixelCanvas {
  sprite(id: string, dx: number, dy: number, dw: number, dh: number,
         opts?: SpriteDrawOptions): boolean
}
```

#### キャッシュ

| 項目 | 仕様 |
|---|---|
| キー | `` `${id}|${frame}|${flipX ? 'f' : ''}|${slotsHash}` `` |
| `slotsHash` | `slots` のキーを昇順ソートし `k=v` を `,` で連結した文字列。`slots` 未指定時は空文字 |
| 値 | 1 セル = 1 実px で焼いたオフスクリーン `HTMLCanvasElement`（`w × h`）|
| 上限 | `PIXELART.spriteCacheMax`（既定 **256**）。超過時は**挿入順の最古から破棄**（単純な FIFO） |
| 破棄の理由 | 動的色スロットにより 1 スプライトが複数色版を持ちうるため、無制限だと際限なく増える。実測では 1 ジャンルあたり数十件に収まる**見込み**だが、上限を設けて安全側に倒す |

転送は `ctx.imageSmoothingEnabled = false` の状態で
`drawImage(baked, dx, dy, dw, dh)`。転送先矩形は §3 の規則でデバイス空間スナップする。

#### 異常系（**すべて「描かない + 開発時のみ警告」で統一する**）

| 事象 | 挙動 |
|---|---|
| `id` が存在しない | `false` を返し何も描かない。`import.meta.env.DEV` のとき `console.warn` を **1 回だけ**（同一 id の再警告は抑制） |
| `frame` が存在しない | `'idle'` へフォールバック。`'idle'` も無ければ `frames` の**最初のキー**を使う。それも無ければ `false` |
| パレットに `@` キーがあるのに `slots` に対応する値が無い | そのセルを**透明として扱う**（描かない）。DEV で `console.warn` |
| `rows` の長さが `h` と不一致 / 行の長さが `w` と不一致 | ビルド前の `npm run validate` で弾く（後述 §9）。実行時は不足分を透明として扱う |

**ゲームを落とさない**ことを最優先する。描画の欠落は視認できるが、
例外でループが止まるとゲームプレイそのものが壊れるため。

**重要な非侵害性:** `targetW / targetH` には呼び出し側が持つ既存の `w / h`
（例: `Player` の `w=36, h=52`、`Item` の `22×22`）をそのまま渡す。
スプライトは既存のバウンディングボックス内に描かれるため、**当たり判定は一切変わらない。**

### 動的色スロット

敵キャラクターの色は `hazard.color`（ジャンルプラグインの `palette` 由来）で
実行時に決まるため、パレットに `@` 始まりのプレースホルダを許可する。

```jsonc
// enemy-stg-interceptor.json
"palette": {
  "M": "@main",    // 実行時に hazard.color を差し込む
  "S": "@shade",   // 実行時に主色を暗くした色を差し込む
  "C": "#88ddff"   // 固定色
}
```

`SpriteRenderer` は解決後の色ごとに焼き込み結果をキャッシュする
（色の種類はジャンルごとに数種しかないため、キャッシュ数は問題にならない）。
これにより既存の `_shade()` / `_lighten()` ヘルパーがそのまま活きる。

参照: [04-StgPlugin.md](04-StgPlugin.md) / [05-AerialStgPlugin.md](05-AerialStgPlugin.md) /
[11-ArenaPlugin.md](11-ArenaPlugin.md)

### `imageSmoothingEnabled` の扱い

**`_render()` の先頭で毎フレーム `false` に設定する。**

`canvas.width` / `height` への代入は **ctx の全状態をリセットする**
（`src/App.vue:97` のコメント「canvas.width 変更で ctx 全状態がリセットされるため
scroller に通知」および `sideScroller.ts:247` のコメントが明記している）。
`onResize()` 自体は `lastTime` を戻すだけで ctx 状態を復元しない。

> 当初版は「`onResize()` はコンテキスト状態をリセットしない」と書いていたが、
> **記述が逆だった。** リセットするのは `canvas.width` への代入であり、
> `onResize()` はその後始末をしていない。

したがって「初期化時に 1 回だけ設定」では**リサイズ後に平滑化が復活してしまう。**
毎フレーム設定する方針であれば実害はないが、
**理由が「リセットされないから安全」ではなく「リセットされるので毎フレーム必要」**である点を
明確にしておく。同じ理由で `fillStyle` / `font` / `textAlign` も毎フレーム設定する
（既存コードが既にそうなっている）。

---

## 6. 文字のドット化（`PixelText`）

canvas 上の文字描画は **`fillText` 21 箇所 + `strokeText` 2 箇所 = 23 箇所**。
当初版は `strokeText`（`PuzzleFeature.ts:451, 469` の `CLEAR!` / `TIME UP` の縁取り）を
見落としていた。縁取りは「塗り + 輪郭」の 2 パスであり、
`PixelText` が縁取りに対応しないと**この 2 箇所だけ描画が崩れる**。

**方式:** ドット絵フォントをバンドルせず、
「小さく描いて拡大する」ことで任意の文字列をドット化する。

```
1. オフスクリーンに font-size / PIXELART.textScale で fillText
2. imageSmoothingEnabled = false のまま textScale 倍で drawImage
→ 日本語を含む任意の文字が、追加アセットなしでドット絵風になる
```

- オフラインで完結する（フォントファイルを追加しない）
- 文字列ごとにオフスクリーンをキャッシュする（毎フレームの再描画を避ける）

### `PixelText` API（**確定仕様**）

```ts
export interface PixelTextOptions {
  font: string                    // 既存の ctx.font 文字列をそのまま渡す
  fill: string
  /** 縁取り。指定時は stroke → fill の順に描く（strokeText/fillText の既存の順序と同じ） */
  stroke?: { color: string; width: number }   // width は実px（既存の lineWidth をそのまま）
  align?: CanvasTextAlign         // 既定 'left'
  baseline?: CanvasTextBaseline   // 既定 'alphabetic'
  alpha?: number                  // 量子化して適用
}

class PixelCanvas {
  text(str: string, x: number, y: number, opts: PixelTextOptions): void
}
```

#### 整列の扱い

オフスクリーンへは常に `align='left'` / `baseline='alphabetic'` で描き、
**転送先の座標を計算する時点で `align` / `baseline` を反映する。**
オフスクリーン内で整列させると、縮小・拡大の過程で
基準位置が `textScale` 分ずれるため。

```
dx = align === 'center' ? x - w / 2 : align === 'right' ? x - w : x
dy = baseline === 'middle' ? y - h / 2 : baseline === 'top' ? y : y - ascent
```

既存の呼び出し側は `ctx.textAlign = 'center'` を設定してから `fillText` している箇所が
複数ある（`sideScroller` の GAME OVER、`PuzzleFeature` のヘッダ・CLEAR!・TIME UP、
`TetrisFeature` の GAME OVER）。**呼び出し側の整列指定を `opts.align` へ移し替えるだけで、
表示位置は変えない。**

#### キャッシュ

| 項目 | 仕様 |
|---|---|
| キー | `` `${str}|${font}|${fill}|${stroke?.color}:${stroke?.width}` `` |
| 値 | 縮小サイズで描いたオフスクリーン + 実測した `width` / `ascent` |
| 上限 | `PIXELART.textCacheMax`（既定 **128**）。超過時は FIFO で破棄 |
| `alpha` | **キーに含めない**（転送時に `globalAlpha` で適用するため、同じ文字列を使い回せる） |

**動的文字列への配慮が必須。** 毎フレーム変化する文字列が実在する。

| 箇所 | 文字列 | 変化頻度 |
|---|---|---|
| `PuzzleFeature.ts:421` | `` `${Math.ceil(timer)}s` `` | 秒ごと（`Math.ceil` により実質 1 秒に 1 回） |
| `PuzzleFeature.ts:432` | ハート（残機） | 被弾時のみ |
| `TetrisFeature` | `SCORE:` / `LINES:` | スコア加算時 |
| `sideScroller.ts:804` | スコアポップアップ | 加点ごと |

いずれも**取りうる値の種類が限られる**（秒数・残機・スコアの刻み）ため、
FIFO 128 件で十分に収まる**見込み**。実装後に
キャッシュのヒット率とフレーム時間を計測して確認する。

**推測:** 日本語の複雑な字形は縮小時に潰れる可能性がある。
`textScale` を JSON で調整できるようにしてあるため、実装後に目視で詰める。
既存の `UI.deathTitleFont` 等のフォント指定はそのまま利用し、置き換えない。

---

## 7. 既知の非対応・妥協点（承認前に明示）

| # | 論点 | 対応 | 分類 |
|---|---|---|---|
| ~~D1~~ | ~~スカッシュ＆ストレッチの小数倍率~~ | **§3 のデバイス空間スナップにより解決。** 変換後の座標でスナップするため、`scale` が小数でも最終出力はグリッドに整列する。倍率の量子化は不要 | 解決済み |
| ~~D2~~ | ~~縦モードの `-90°` 回転~~ | **§3 のデバイス空間スナップにより解決。** 直角回転は軸並行矩形を軸並行矩形へ写すため、2 点変換で正しく扱える | 解決済み |
| D3 | 全画面オーバーレイ（死亡・被弾フラッシュ・環境ティント） | ドット化しない。均一な半透明塗りであり、ドット絵作品でも一般的な演出のため | 判断（確定） |
| D4 | `ParticleSystem` の `globalAlpha` フェード | アルファを `alphaSteps` 段に量子化。完全な不透明化はしない（消失が不自然になるため） | 判断（確定） |
| D5 | HiDPI 環境での滲み | 現状 `devicePixelRatio` 非対応で、これは PixelArt 化以前からの既存挙動。**本タスクのスコープ外**とし変更しない | スコープ外 |
| D6 | バンドルサイズ | スプライト JSON の追加でバンドルが増える。`npm run bundle-size` のバジェット内に収まるか実装中に監視する | 要監視 |
| D7 | ビネット | **`bandRadial` で段階化する（確定）。** 同心リングのバンディングが出た場合の後退条件を §7 に定める | 判断（確定） |
| D8 | 半透明表現（星雲・光条・霧・ステルス外套） | **ディザ（`dither`）を既定とする（確定）。** 後退条件は §8 | 判断（確定） |
| D9 | 日本語文字の潰れ | `PixelText` + `textScale` で対応。読めない場合の後退条件は §8 | **推測**（実装後に検証） |

### 曖昧さの解消（レビュー指摘への対応）

当初版は「両方試す」「帯またはディザ」「読めなければ戻す」といった未決の記述を残しており、
承認対象の仕様として完了条件が不明確だった。**上表の通りすべて既定を確定させ、
後退（フォールバック）する場合の判断基準を §7 に明文化した。**

---

## 8. 後退（フォールバック）の判断基準

D7〜D9 は既定を確定させたが、実装後の目視で問題が出た場合の扱いを事前に定める。
**基準を満たさない場合のみ後退し、その事実と理由を本書と該当のファイル別仕様書に追記する。**

| # | 既定 | 後退する条件（これに該当したときのみ） | 後退先 |
|---|---|---|---|
| D7 | ビネットを `bandRadial` で段階化 | 同心円状の縞が**静止画で明確に視認できる**場合 | 現状の `createRadialGradient` を維持（D3 と同じ扱いにする） |
| D8 | 半透明をディザで表現 | スクロール時にディザ模様が**ちらつく（フリッカーする）**場合 | `withAlpha` による量子化アルファ |
| D9 | 日本語も `PixelText` でドット化 | `textScale` を 2〜4 の範囲で調整しても**文字が判読できない**場合 | 該当の文字列のみ `PixelText` を通さず現状の `fillText` を使う |

D9 の判定対象（日本語を含む文字列）:
`'説明書を投げてください'`（`sideScroller.ts:834`）、
`'第 N 問'`（`PuzzleFeature.ts:373`）、
`'ゴールへ滑り込め   正解数 N'`（同 376）、
`'↑ ↓ ← → : 移動      SPACE : リセット'`（同 437）。

## 9. `pixelart.json` の検証

現状 `scripts/validate-json.mjs` の `SCHEMAS` は既知のファイル名のみを列挙しており、
未知の設定ファイルは**構文チェックのみ**で通る。
`src/framework/ConfigValidator.ts` も `pixelart` を必須セクションとして扱わない。
**このままでは値の欠落・範囲外を実行時まで検出できない。**

### 追加する検証

**1. `scripts/validate-json.mjs` の `SCHEMAS` に登録**

```js
'pixelart.json': ['section', 'size', 'gradientSteps', 'haloSteps',
                  'alphaSteps', 'textScale'],
```

**2. 範囲チェック（`validate-json.mjs` に追加）**

| キー | 制約 | 理由 |
|---|---|---|
| `size` | 整数 1〜16 | 0 以下でゼロ除算。過大だと画面が潰れる |
| `gradientSteps` | 整数 2〜32 | 1 だと単色になりグラデーションが消える |
| `haloSteps` | 整数 0〜8 | 0 はグロー無効として許可 |
| `haloAlphaFalloff` | 0 < v <= 1 | |
| `alphaSteps` | 整数 2〜32 | 1 だと全て不透明になる |
| `textScale` | 整数 1〜8 | 0 以下でゼロ除算 |
| `spriteCacheMax` / `textCacheMax` | 整数 1 以上 | |

**3. `src/data/sprites/*.json` の検証（`validate-json.mjs` に追加）**

- `id` / `w` / `h` / `palette` / `frames` の必須チェック
- `id` の重複チェック（ジャンル・カードと同じ方式）
- **`frames` の各行数が `h` と一致し、各行の長さが `w` と一致すること**
- **`rows` に現れる全文字が `palette` のキーか `'.'`（透明）であること**
- `palette` の値が `#rrggbb` または `@` 始まりのスロット名であること

**4. `schemas/sprite.schema.json` の追加**

`schemas/genre.schema.json` / `cards.schema.json` と同じ位置づけ。
`validate-json.mjs` が単一の情報源として読む。

**5. `src/framework/ConfigValidator.ts` の `devValidateConfig` に `pixelart` を追加**

開発時に欠落を早期検出する。既存の `devValidateConfig` の作法に従う。

## 10. ゲームプレイ非侵害の担保方法

| 保護対象 | 担保方法 |
|---|---|
| 当たり判定 | `Player.rect` / `Hazard.rect`（`entities.ts:36, 78`）に触れない。スプライトは既存 `w/h` の中に描く |
| 物理・スポーン | `PHYSICS.groundYOffset` / `BACKGROUND.groundHeight` を変更しない。描画層は読むだけ |
| スコア | `scoreFormula` / `evalScoreFormula` / 各 Feature の加点処理に触れない |
| 入力 | `InputManager` を変更しない（描画コードを一切持たない） |
| ジャンル遷移 | `genreResolver` / `ruleEngine` / `thresholds` / `spawnTable` に触れない |
| 検証 | 各 Phase 完了ごとに `npm run typecheck` `lint` `validate` `test:unit` `test:features` `reach-sim` を実行し、変更前と同一結果であることを確認する |

`GenrePlugin` / `FeatureSystem` インターフェース（`src/engine/`）の
**メソッドシグネチャは一切変更しない。** 各実装のメソッド本体だけを差し替える。

---

## 実際に行った作業内容（実装後に追記）

2026-08-23、P0 で基盤を実装し、P1〜P5 の全実装で使用した。

### 実装したもの

| パス | 内容 |
|---|---|
| `src/game/render/PixelCanvas.ts` | 本書 §4 の API を実装。P3 で `halfCircle()` を追加（アーチと丘で重複したため本体へ昇格） |
| `src/game/render/SpriteRenderer.ts` | §5 の確定仕様通り。FIFOキャッシュ・動的色スロット・異常系（描かずに false）を実装 |
| `src/game/render/PixelText.ts` | §6 の確定仕様通り。縁取り（`stroke`）・整列・FIFOキャッシュを実装 |
| `src/data/sprites.ts` / `src/data/sprites/*.json` | スプライト自動収集ローダーと定義25件 |
| `src/data/config/pixelart.json` | §4「量子化の規則」の10キー |
| `schemas/sprite.schema.json` | §9-4 のスキーマ |

公開API 17種すべてが実使用されている（使用回数は [report.md](report.md) §4.3）。

### 確定仕様からの差異 → **S8（2026-08-23）ですべて解消済み**

当初、以下2点が確定仕様を満たしていなかった。独立監査 [audit-report.md](audit-report.md) の
F-01 / F-06 / F-07 で指摘され、**S8 の修正フェーズで解消した。**

1. **§3「デバイス空間スナップ」がスプライトと文字に適用されていなかった。** → **修正済み**

   - `sprite()`: 変換行列から外接矩形のみを算出し `setTransform` で変換を破棄していたため、
     **回転がスプライト画素に伝わっていなかった**（縦スクロール時に自機の向きが変わらない実バグ）。

     **修正:** 変換行列が軸平行かどうかを判定し、
     - 軸平行のとき（無回転）: 従来どおり外接矩形へ転送（最も精度が高い）
     - 回転があるとき: 中心をデバイス空間でスナップ・スプライト自軸方向の寸法を量子化した上で
       `ctx.rotate()` を掛け直して転送する

     これにより §7 の **D2（直角回転はデバイス空間スナップで解決）がスプライトについても成立する。**
     検証: `player_stg` を `-90°` 下で描画し、機首（固有色のコックピット）が
     外接矩形の中心より**上**へ移動することをピクセル実測で確認済み

   - `text()`: `_toDevice()` を通さずスナップされていなかった。
     **修正:** 変換が「純粋な平行移動」（画面シェイク）のときは転送位置をデバイス空間でスナップする。
     拡大縮小・回転が掛かっている場合は文字サイズが変わるため従来どおり変換に委ねる

2. **§9「`pixelart.json` の検証」の実装漏れ。** → **修正済み**

   | 内容 | 修正 |
   |---|---|
   | 必須キー列挙が6キーのみ（実データは10キー） | 10キーすべてを列挙 |
   | `validatePixelart()` が欠落値を `continue` で素通り | 欠落を明示的に失敗させる |
   | `sprite.schema.json` を実際には読んでいない | `required` / `id` / palette の値・キーの各 pattern をスキーマから読むよう変更（コメントの記述と実装を一致させた） |
   | palette 正規表現が4・5桁hexを許可 | スキーマ由来の `#rrggbb` / `#rgb` のみに厳格化 |
   | `pixelart.json` が成功件数に二重計上 | 範囲チェック側のラベルを分離 |
   | `ConfigValidator` の `haloAlphaFalloff` が `0 <= v` | `exclusiveMin` を導入し `0 < v <= 1` に修正 |

   いずれも意図的な不正データ（4桁hex・キー欠落）を投入して**実際に検出できることを確認済み**。

3. **描画とゲームプレイの乱数分離（F-02）。** → **方針を確定し回帰テストを追加**

   本ゲームは描画とゲームプレイで同じグローバル `Math.random()` を共有しており、
   描画側の乱数消費数が変わると後続フレームのスポーン抽選がずれる。
   PixelArt化では描画側の乱数（エンジン炎の揺らぎ等）をすべて
   `runCycle` / `hazard.pulse` ベースの決定論的演出へ置き換えた。

   **方針: 描画は乱数を消費しない（描画とゲームプレイの乱数結合を解消する）。**
   `tests/feature-render-purity.test.mjs` を追加し、描画メソッド内での
   `Math.random()` 使用を静的に禁止する回帰ガードとした。

### D7〜D9（後退条件）の状況

| # | 既定 | 状況 |
|---|---|---|
| D7 | ビネットを `bandRadial` で段階化 | 既定のまま実装。同心円の縞が視認できるかは**実機未確認** |
| D8 | 半透明をディザで表現 | 既定のまま実装（星雲・光条・ステルス外套）。ちらつきの有無は**実機未確認** |
| D9 | 日本語も `PixelText` でドット化 | 既定のまま実装。判読性は**実機未確認**（`PuzzleFeature` に集中） |

いずれも後退条件の判定には実機での目視確認が必要だが、実行環境の制約により未実施。

## 懸念点・確認事項（更新）

- Q1〜Q4 はユーザー確認済み（`CLAUDE_TASKS.md` S3 参照）。
- ~~本書の承認が得られるまで P0 以降の実装に着手しない。~~ → 承認済み・実装完了。
- ~~**未解決:** F-01 のスプライト回転欠落~~ → **S8 で修正済み**（上記「確定仕様からの差異」1.）。
- **残る未確認事項:** D7（ビネットの同心縞）・D8（ディザのちらつき）・D9（日本語の判読性）の
  後退条件判定には実機での目視が必要だが、実行環境の制約により未実施。
  ブラウザペインが非表示だと `window.innerWidth` が 0 になり canvas も 0×0 になるため、
  ゲームループ内での描画自体が発生しない。ユーザー側での確認を推奨する。

## 懸念点・確認事項

- Q1〜Q4 はユーザー確認済み（`CLAUDE_TASKS.md` S3 参照）。
- 本書の承認が得られるまで P0 以降の実装に着手しない。
