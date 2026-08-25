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

  /** セル整数演算によるブロック円（arc の代替）。仕様は §11.2 */
  circle(cx: number, cy: number, r: number, color: string): void

  /** セル整数演算によるブロック楕円（ellipse の代替）。仕様は §11.2 */
  ellipse(cx: number, cy: number, rx: number, ry: number, color: string): void

  /** 階段状の三角形（spike の代替） */
  tri(x: number, y: number, w: number, h: number, dir: 'up'|'down'|'left'|'right', color: string): void

  /** 経路を 1 セル間隔でサンプリングするブロック線（stroke の代替）。
   *  thickness はセル単位（§3）。重複セルは描画しない（§11.3） */
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
  "textScale": 3,            // 文字のドット化倍率の上限（§11.4 で下限併用に改訂）
  "textMinBakePx": 11,       // 焼き込み後フォントサイズの下限px（漢字の字形下限）
  "blockShadeAmount": 40,    // block() の明暗差（§11.6）
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

> ⚠ **この方式は「倍率固定」では成立しない。** 焼き込み後のフォントサイズが
> 字形の成立限界を下回ると、文字はドット化されるのではなく**情報が消える**。
> 改訂仕様は §11 R-02 を参照。

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

## 11. 改訂仕様（2026-08-24 / 実機確認と第3・第4回監査を受けて全面改訂）

S8 完了後、ユーザーの実機確認および監査2本（[claude-audit-report-03.md](claude-audit-report-03.md) /
[audit-report-04.md](audit-report-04.md)）で新たな問題が判明した。
**本節が当該箇所の最新の確定仕様であり、§3〜§6 の記述に優先する。**

### 11.0 本節が扱う範囲

第4回監査は本ブランチ外の既存不具合も多数指摘している。
`CLAUDE_OWNER.md` は本ブランチのスコープを「見た目（描画）」に限定し、
**当たり判定・スコアリング・入力処理・ジャンル遷移ロジックの変更を明確に禁止**している。

そこで指摘を次のとおり切り分けた。判定根拠は §11.7 に記す。

| 区分 | 指摘 | 本節での扱い |
|---|---|---|
| **描画（本ブランチのスコープ内）** | R-01, R-02, C-01〜C-09 | **本節で仕様化し実装する** |
| ゲームプレイ・基盤（スコープ外・**既存不具合**） | G-01〜G-07, J-01〜J-04, V-01, V-02, T-01, UX-01〜03, REG-01 | **実装しない。** §11.7 に記録し別ブランチへ引き継ぐ |

### 11.1 根本原因: 量子化の不整合

R-01・C-01・C-02 は**単一の根本原因から派生した3つの症状**である。

`_snapPos()` は位置を四捨五入し、`_snapSize()` は寸法を切り上げたうえ
**最低 1 セルを保証する**。円系プリミティブは行の高さ `rowH` と半幅 `halfW` を
**セルサイズの倍数でない端数**で算出し、それを行ごとに独立してスナップしていた。

```ts
// 改訂前の circle()
const steps = Math.max(3, Math.round(r / (this._size * 0.5)))
const rowH = (r * 2) / steps                              // ← 端数
const halfW = Math.sqrt(Math.max(0, r * r - yMid * yMid)) // ← 端数
```

ここから 3 つの症状が出る。

| 症状 | 内容 | 実測 |
|---|---|---|
| **R-01** | `r` の変化で `steps` が整数単位に跳び、行構成が丸ごと組み替わる | `r=30.0→31.2` で行数が 15→16 に跳ぶ |
| **C-02** | 左端は四捨五入・幅は切り上げのため、中心に対し左右非対称になる | 中心から左 40px / 右 **39px** |
| **C-01** | `rowH` が 1 セルを下回ると `_snapSize` の下限で引き伸ばされ、図形が膨張する | `ellipse(rx,4)` の高さが 8px → **12px（1.5倍）** |

**したがって対処も 1 つで足りる。セル整数演算に切り替える。**

### 11.2 R-01 / C-01 / C-02: 円系プリミティブをセル整数演算へ

#### アンチエイリアスを採用しない理由

ユーザーから「アンチエイリアスがあるといいかも」との提案があったが、採用しない。

- 本仕様書 §1・§2 が定めた PixelArt 化の目的（滑らかな描画の排除）と正面から矛盾する
- **不安定さが直らない。** 形状が組み替わる現象はそのまま残り、輪郭がぼやけるだけである
- 原因は量子化の不整合でありジャギーではない

輪郭を柔らかく見せたい場合は、ドット絵の作法に従い
**境界セルに 1 段暗い縁を置く**か `dither()` で散らす。いずれもグリッド上に留まる。
本改訂では必須としない（整数化のみで安定性は解決するため）。

#### 確定仕様

**すべての円系プリミティブは、セル単位の整数演算で行を生成する。**

```
1. 直径をセル数へ量子化する:   D = max(1, round(2r / size))
2. 行は必ず「ちょうど 1 セル高」とし、i = 0 … D-1 の D 行を生成する
3. 行の正規化位置を norm = (i + 0.5 - D/2) / (D/2) とする
4. 半幅（セル単位の実数）を   halfW = (D/2) * sqrt(1 - norm²) で求める
5. 幅を D と偶奇を揃えたセル数へ丸める:
      D が奇数 → wCells = 2*round(halfW - 0.5) + 1
      D が偶数 → wCells = 2*round(halfW)
6. wCells <= 0 の行は描かない
7. 外接矩形の左上を (cx - D/2*size, cy - D/2*size) とし、
   rect(x0 + (D - wCells)/2*size, y0 + i*size, wCells*size, size, color) を発行する
```

**半径ではなく直径を量子化する**（実装時に判明・仕様を訂正）。
半径を量子化すると直径が必ず**偶数セル**になり、1 セル径の小さな図形が
2 セルに膨らむ。本コードベースでは `r = 2, 3, 5, 7`（泡・松明の炎・灯り）が
実際に使われており、`r=2` の円が 4px → 8px へ倍増してしまう。

偶奇を揃えるのは、揃えないと `(D - wCells)` が奇数になって
行が半セルずれた位置に中央寄せされ、`_snapPos` の四捨五入で左右非対称に戻るため。

この構成が 3 症状すべてを同時に解決する理由:

| 性質 | 根拠 |
|---|---|
| **寸法が正確** | 行は常に 1 セル高。`_snapSize` の下限（1 セル）に掛からないため膨張しない → **C-01 解消** |
| **左右対称** | 幅 `halfCells*2*size` はセルの整数倍。`_snapSize` は整数倍を変えず、`_snapPos(cx - k*size) = _snapPos(cx) - k*size` となるため左右が鏡像になる → **C-02 解消** |
| **上下対称** | 行集合 `dy = -R … R-1` の鏡像は自分自身。`yc = dy+0.5` も `|yc|` が対称 |
| **安定** | `R` は `r` が半セルを跨ぐときだけ 1 変化する。組み替えではなく **1 セルずつ太る/痩せる** → **R-01 解消** |
| **決定的** | 同じ `R` なら常に同じ形。`r` の端数に依存しない |

#### 適用対象

**同じ構造を持つ 4 メソッドすべてに適用する。**

| メソッド | 適用内容 |
|---|---|
| `circle(cx, cy, r, …)` | 上記のとおり（`DX = DY = D`） |
| `ellipse(cx, cy, rx, ry, …)` | `DX = max(1, round(2rx/size))`, `DY = max(1, round(2ry/size))` を別々に量子化 |
| `halfCircle(cx, cy, r, dir, …)` | 円の上半分（`i = 0 … ceil(D/2)-1`）または下半分（`i = floor(D/2) … D-1`）のみを生成 |
| `_annulus(cx, cy, rInner, rOuter, …)` | 内外の直径をともにセル量子化。**内側の幅も外側と偶奇を揃える**ことで帯幅が整数セルになり、左右の帯が対称になる |

`_annulus` は `bandRadial()`（ビネット・太陽のグロー）の下請けであり、
同じ膨張欠陥を持つため対象に含める。
隣接するリング同士は境界の半径値が一致し、同じ量子化結果になるため**隙間は生じない。**

#### 既知の副作用（**実装時にユーザー確認を要する**）

`ry = 4`（= 1 セル）の影は、整数化すると縦 **1 セル（4px）× 2 行 = 8px** の平たい影になる。
これは仕様どおりの正しい値だが、**現在の見え方（12px）より薄くなる。**

該当は 9 プラグインのキャラクター足元の影である。

```
ArenaPlugin:110 / BasePlugin:80 / BulletRunnerPlugin:128 / DungeonPlugin:128 /
HackSlashPlugin:120 / PlatformerPlugin:105 / RacingPlugin:103 / SurvivalPlugin:111  … ry=4
AquaticPlugin:130 … ry=3
```

`ry` の値そのものを調整すれば従来の厚みに戻せるが、
これらは**変換前から存在する既存値**であり、要領書の
「色・数値を変更しない」という前提に触れる。**値の変更は行わず、実機確認後に判断する。**

### 11.3 C-03 / C-05: 経路追従プリミティブの重複描画

#### 現象

`arcBlocks()` は弧上に、`line()` は線分上に `t × t` の矩形を並べる。
サンプル間隔は経路に沿って 1 セルだが、**スナップ後に同一セルへ落ちることがある。**

不透明なら同色の重ね塗りで無害だが、**半透明では二重合成されて明点になる。**

実測（`arcBlocks` で全周、`globalAlpha = 0.5`）:

| 項目 | 実測 |
|---|---|
| 発行 `fillRect` 数 | 64 |
| ユニークセル数 | 58 |
| **重複** | **6** |
| 出現アルファ値 | **128 と 192**（= 1 回合成と 2 回合成） |

半透明の文脈で実際に使われている。

```
SurvivalFeature.ts:270-277   px.withAlpha(fadeAlpha, () => { px.halo(… px.arcBlocks …) })
HackSlashPlugin.ts:136       px.withAlpha(0.7, () => px.line(…))
```

#### 確定仕様

**`arcBlocks()` と `line()` は、同一セルを 2 回以上描画してはならない。**

判定は**デバイス空間のスナップ後の座標**で行う。ローカル座標で判定すると
拡大縮小が掛かった場合に取りこぼすため。

```
1. 内部で保持する Set に、発行済みセルの (dx, dy) をキーとして記録する
2. 既出のセルはスキップする
3. Set は 1 回の呼び出し内で完結させる（呼び出しをまたいで保持しない）
```

実装上は、デバイス矩形の算出（`_toDevice`）と発行（`fillRect`）を分離し、
両メソッドが算出結果を見てから発行できるようにする。

#### C-05: `line()` のアルゴリズム表記を実装に合わせる

§4 は `line()` を「Bresenham による」と記述しているが、
実装は**弧長を等分する線形補間サンプリング**である。

**この点は実装ではなく仕様書の記述を訂正する。** 理由:

- 実測で表示上の欠陥が確認できなかった（4 通りの角度で途切れ **0**、
  端点を 0.1 刻みで動かしてもセル数 **25 で一定**）
- 47 箇所の呼び出しに影響する書き換えのリスクに対し、得られる利益が確認できない

**R-01 とは逆方向の判断になるが、判断基準は一貫している。**
「仕様書と実装のどちらが古いか」ではなく、**「出力が正しいかどうか」**で決めている。
R-01 は出力に実害があったため実装を直し、C-05 は出力が正しいため記述を直す。

→ §4 の `line()` の記述を
「**経路を 1 セル間隔でサンプリングするブロック線**（重複セルは描画しない）」に改める。

### 11.4 R-02: 文字の焼き込み解像度に下限を設ける

#### 現象

`textScale: 3` は**フォントを 1/3 に縮めて焼き、3 倍に引き伸ばす**。
つまり 16px のフォントは実質 **5px で描かれている。**

日本語の字形にはサイズ下限があり（英数字 約 5px / 仮名 約 8px / 漢字 約 11〜12px）、
**5px の漢字はドット化ではなく情報が失われている。**

実測した焼き込みサイズ:

| 文字 | フォント指定 | 焼き込み | 判定 |
|---|---|---|---|
| `GAME OVER` | `bold 36px` | 12px | OK |
| **「説明書を投げてください」** | `16px` | **5px** | **潰れる** |
| スコアポップアップ | `bold 15px` | **5px** | **潰れる** |
| 「第 N 問」 | `bold 30px` | 10px | 概ね可 |
| **「ゴールへ滑り込め 正解数 N」** | `bold 16px` | **5px** | **潰れる** |
| **「↑ ↓ ← → : 移動  SPACE : リセット」** | `bold 14px` | **5px** | **潰れる** |

#### なぜ `textScale` を下げるだけでは不十分か

`textScale` は単一の定数であり、フォントサイズによって結果が乖離する。

| 呼び出し側 | `textScale: 3` での焼き込み | 判定 |
|---|---|---|
| 36px（GAME OVER 等） | 12px | 読める |
| 14px（操作説明） | 4〜5px | **完全に潰れる** |

一律に下げると**大きい文字のドット感まで失われ**、§2 で承認された方針が損なわれる。

#### 確定仕様

倍率固定をやめ、**焼き込み後のフォントサイズに下限を設ける。
ただし倍率は整数に限る。**

```
minBake = PIXELART.textMinBakePx
scale   = clamp(1, floor(fontSize / minBake), PIXELART.textScale)
```

- 大きい文字 → `textScale` がそのまま効き、**ドット感を維持する**
- 小さい文字 → 倍率が自動的に下がり、**可読性が確保される**
- どちらも呼び出し側の変更を要さない（`opts.font` から導出する）

#### 倍率を整数に限る理由（実装時に判明・仕様を訂正）

当初は `fontSize / minBake` をそのまま倍率にする仕様としていたが、**これは誤りだった。**

本方式は縮小オフスクリーンを `imageSmoothingEnabled = false` で拡大する。
**拡大率が整数でないと、最近傍サンプリングによって
1 ソース画素が 1px になったり 2px になったりして混在する。**
ドットの大きさが不揃いになり、ドット絵らしさそのものが損なわれる。

| フォント | 非整数倍率（誤） | 整数倍率（正） |
|---|---|---|
| 36px | 3.000 → 12px（たまたま整数） | 3 → 12px |
| 30px | **2.727 → ドット不揃い** | 2 → 15px |
| 16px | **1.455 → ドット不揃い** | 1 → 16px |
| 14px | **1.273 → ドット不揃い** | 1 → 14px |
| 48px | 3.000 → 16px | 3 → 16px |

`floor` を使うため、**倍率が下がる側にしか動かない**（焼き込みサイズは下限以上を保つ）。

倍率 1 は「ドット化しない」を意味する。14〜16px の日本語は、
`textMinBakePx = 11` の下では**ドット化と可読性を両立できない**ため、
可読性を優先する。これは §11.4 冒頭の実測（5px では情報が失われる）からの帰結であり、
中途半端に潰れた文字を出すより素の描画のほうが目的に適う。

`textMinBakePx` は `pixelart.json` に追加し、**コードに直書きしない**。
初期値は漢字の下限に合わせ **`11`** とする。

フォントサイズを取り出せない `font` 指定（`px` 表記が無い場合）は
`textScale` をそのまま使う（現行の `_scaleFontSize` が変換しないのと整合する）。

`_cacheKey` は既に `font` を含むためキャッシュキーの変更は不要である。

### 11.5 C-04: 未解決の動的色スロットを警告する

§5「異常系」は次を規定している。

> パレットに `@` キーがあるのに `slots` に対応する値が無い →
> そのセルを**透明として扱う**（描かない）。**DEV で `console.warn`**

透明として扱う挙動は実装済みだが、**`console.warn` が実装されていない。**
実測では警告 0 件のまま 966px が欠落したまま描画され、戻り値も `true` だった。

→ **`id` 未定義時と同様に、DEV で 1 回だけ警告する。**
警告の抑制キーは `${id}|${スロット名}` とし、同じ欠落を毎フレーム出力しない。

### 11.6 C-06 / C-07: 規約違反とコメント誤り

| # | 内容 | 対処 |
|---|---|---|
| **C-06** | `block()` の陰影量 `40 / -40` がハードコード | `pixelart.json` に `blockShadeAmount` を追加して参照する |
| **C-06** | 変換行列の判定に使う `1e-6` が 3 箇所に直書き | ファイル先頭の `const _EPSILON` として定義する |
| **C-07** | ディザ行列のコメントが「4x4 Bayer」だが実体は 2x2 | **コメントを修正する**（変数名 `_BAYER_2X2` と実体は正しい） |

`CLAUDE.md`「マジックナンバー」の規定に従う。
`PixelCanvas.ts` は本ブランチで新規作成したファイルであり、
これらの値は変換作業で新たに持ち込まれたものである。

なお 2x2 Bayer は 4 段階の閾値を持ち、`ditherRatioSteps = 4` と整合するため
**行列そのものは変更しない。**

### 11.7 C-08: 描画中核に単体テストを追加する

#### 現状

| 対象 | 行数 | 単体テスト |
|---|---|---|
| `PixelCanvas.ts` / `PixelText.ts` / `SpriteRenderer.ts` | 713 | **0 件** |

`typecheck` / `lint` / `validate` / `build` はすべて通過しており、
**既存の検証系は描画の正しさを一切保証していない。**
本ブランチで見つかった表示バグ（F-01, R-01, R-02, C-01〜C-03）は
すべてこの空白から出ている。とくに **S8 で修正した F-01 には回帰テストが無く、
現状では再発しても検知できない。**

#### 確定仕様

**`tests/unit/game/render/` に単体テストを追加する。**

テスト環境は `happy-dom` であり実 canvas を持たないため、
`getImageData` によるラスタ検証はできない。
代わりに **`CanvasRenderingContext2D` のモックを注入し、
発行された `fillRect` の座標・寸法を直接検証する。**
幾何の正しさを問う本件では、ラスタ検証より厳密で決定的である。

| # | テスト内容 | 防止する回帰 |
|---|---|---|
| T1 | `circle` / `ellipse` の左右・上下対称性 | C-02 |
| T2 | `circle(r)` の直径が `2R セル`、`ellipse` の高さが `2RY セル`に一致 | C-01 |
| T3 | 半径を細かく動かしても行数が単調に変化する（跳ばない） | R-01 |
| T4 | `arcBlocks` / `line` が同一セルを 2 度描かない | C-03 |
| T5 | 焼き込み倍率が `fontSize / textMinBakePx` を超えない | R-02 |
| T6 | `withAlpha` が現在の `globalAlpha` に乗算する | S8 の F-03 |

T5 のために、フォントサイズから焼き込み倍率を求める処理を
**純粋関数として切り出し、`PixelText` から export する。**
canvas に依存せずテストできるようにするため。

`sprite()` の回転保持（F-01）はスプライト焼き込み（実 canvas）を伴うため
`happy-dom` では検証できない。**回帰テストは追加できない旨を明記して残す。**

### 11.8 スコープ外と判定した指摘（第4回監査）

第4回監査の指摘のうち、以下は**本ブランチのスコープ外**と判定した。

#### 判定根拠

`CLAUDE_OWNER.md`「ルール」は次を明記している。

> 見た目（描画）以外の変更は行わない。ゲームプレイ上の機能
> （当たり判定、スコアリング、入力処理、ジャンル遷移ロジックなど）を侵害しないこと。

そのうえで、**全項目が PixelArt 変換前（`c40c1a7`）から存在することを確認した。**
本ブランチが持ち込んだ不具合ではない。

| 指摘 | 内容 | 変換前(`c40c1a7`)との比較 |
|---|---|---|
| G-01 | Survival 近接キルで敵が消えない | `removeHazardById`/`setKills` の呼出は**変換前も 0 件** |
| G-04 | 同一フレーム多重被弾 | `p.invincible <= 0` の出現箇所は**変換前も 2 箇所で同一** |
| G-06 | `notifyGenreLocked` が呼ばれない | `App.vue` の呼出は**変換前も 0 件** |
| T-01 | unit test 3 件失敗 | `keys: {}` モックは**変換前と同一** |
| V-01 | スキーマ違反を検証が見逃す | `schemas/genre.schema.json` は**変換前と完全同一** |
| J-01 | テーマ色が CSS 直書き | `src/styles/global.css` は**変換前と完全同一** |
| J-04 | JSONGenrePlugin の視覚設定転送 | `src/plugins/JSONGenrePlugin.ts` は**変換前と完全同一** |
| UX-01 | blur でキー固着 | `src/game/InputManager.ts` は**変換前と完全同一** |
| G-03 | hack_slash / tetris の到達率 0% | `src/data/genres/` は**変換前と完全同一** |
| G-02, G-05, G-07, J-02, J-03, V-02, REG-01, UX-02, UX-03 | 同上 | いずれもゲームプレイ／基盤／DOM UI 層 |

#### 扱い

**本ブランチでは修正しない。** 理由:

1. `CLAUDE_OWNER.md` が明確に禁止している
2. いずれも既存不具合であり、PixelArt 化の成否とは独立している
3. ゲームプレイロジックへの変更は、本ブランチの唯一の検証軸である
   「ゲームプレイ非侵害」を自ら破ることになる

**第4回監査の指摘は妥当であり、別ブランチで対応すべきである。**
とくに REG-01（過去の修正が後続コミットで再混入している）と
V-01（検証が成功を返しながら不正データを見逃す）は、
個別バグより再発性が高く優先度が高い。

### 11.9 検証方法

`happy-dom` に実 canvas が無いため、単体テストは `fillRect` の発行内容で検証する（§11.7）。
実機での目視は実行環境の制約により行えない（§「懸念点・確認事項」参照）。

| 対象 | 検証項目 |
|---|---|
| R-01 | `r` を細かく動かし、行数が単調に変化すること |
| C-01 | `circle(r)` の直径・`ellipse(rx,ry)` の寸法がセル量子化後の期待値に一致すること |
| C-02 | 中心軸で左右・上下が鏡像になること |
| C-03 | `arcBlocks` / `line` の発行セルが重複しないこと |
| R-02 | 各フォントサイズで焼き込みサイズが `textMinBakePx` を下回らないこと |
| C-04 | 未解決スロットで DEV 警告が出ること |
| 全体 | `typecheck` / `lint` / `validate` / `test:unit` / `test:features` / `build` の通過 |

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
| D9 | 日本語も `PixelText` でドット化 | ❌ **実機確認で後退条件に該当。判読性が不足していた** → §11 R-02 で改訂 |

**D9 は 2026-08-24 のユーザー実機確認により「判読できない」と判定された。**
ただし後退（ドット化の取りやめ）ではなく、§11 R-02 の
「焼き込み解像度に下限を設ける」方式で**ドット化を維持したまま解決する。**

D7・D8 は依然として実機未確認。

## 懸念点・確認事項（更新）

- Q1〜Q4 はユーザー確認済み（`CLAUDE_TASKS.md` S3 参照）。
- ~~本書の承認が得られるまで P0 以降の実装に着手しない。~~ → 承認済み・実装完了。
- ~~**未解決:** F-01 のスプライト回転欠落~~ → **S8 で修正済み**（上記「確定仕様からの差異」1.）。
- ~~**未着手:** §11 の R-01・R-02~~ → **S9（2026-08-24）で実装完了。** 下記「§11 の実装記録」参照。
- **残る未確認事項:** D7（ビネットの同心縞）・D8（ディザのちらつき）の
  後退条件判定には実機での目視が必要だが、実行環境の制約により未実施。
  ブラウザペインが非表示だと `window.innerWidth` が 0 になり canvas も 0×0 になるため、
  ゲームループ内での描画自体が発生しない。ユーザー側での確認を推奨する。

## 懸念点・確認事項

- Q1〜Q4 はユーザー確認済み（`CLAUDE_TASKS.md` S3 参照）。
- 本書の承認が得られるまで P0 以降の実装に着手しない。

---

## §11 の実装記録（S9 / 2026-08-24）

### 変更したファイル

| パス | 内容 |
|---|---|
| `src/game/render/PixelCanvas.ts` | 円系4メソッドをセル整数演算へ。`line`/`arcBlocks` に重複抑止。`block` の JSON 化、`_EPSILON` 定数化、Bayer コメント修正 |
| `src/game/render/PixelText.ts` | 焼き込み倍率に下限を導入。`computeBakeScale` / `parseFontSizePx` を純粋関数として export |
| `src/game/render/SpriteRenderer.ts` | 未解決スロットの DEV 警告を追加（`id` を `_bake` / `_resolveColor` へ伝搬） |
| `src/data/config/pixelart.json` | `textMinBakePx: 11` / `blockShadeAmount: 40` を追加 |
| `src/framework/config-types.ts` | `PixelartConfig` に2キーを追加 |
| `src/framework/ConfigValidator.ts` | 必須キー・範囲チェックに2キーを追加 |
| `scripts/validate-json.mjs` | 同上 |
| `tests/unit/game/render/PixelCanvas.test.ts` | **新規**。幾何・対称性・重複・アルファの回帰テスト |
| `tests/unit/game/render/PixelText.test.ts` | **新規**。焼き込み倍率の回帰テスト |

**ゲームプレイに関わるファイルは一切変更していない。**

### 仕様からの差異

**なし。** ただし実装過程で**仕様側の誤りを2件発見し、仕様を訂正した。**

| # | 当初の仕様 | 問題 | 訂正後 |
|---|---|---|---|
| 1 | 円系は**半径**をセル量子化する | 直径が必ず偶数セルになり、`r=2` の円（泡・松明の炎）が 4px → 8px へ**倍増**する | **直径**を量子化し、幅は直径と偶奇を揃える |
| 2 | 焼き込み倍率は `fontSize / minBake` | 倍率が非整数だと最近傍拡大で 1px と 2px のドットが混在し、**ドット絵らしさが損なわれる** | 倍率を**整数に限る**（`floor`） |

いずれも「仕様どおり実装したら出力がおかしい」と実測で気づいたもので、
実装ではなく**仕様の側を直した**。経緯は §11.2・§11.4 に記載。

### 実測による検証結果

| 項目 | 修正前 | 修正後 |
|---|---|---|
| `ellipse(rx, 4)` の高さ（影 9 箇所） | 12px（1.5倍に膨張） | **8px** ✅ |
| `ellipse(8, 2)` の高さ | 4px | **4px** ✅（直径量子化で維持） |
| `circle(40)` の左右 | 左40px / 右39px | **左40px / 右40px** ✅ |
| `circle` の非対称画素数 | 128px | **0px** ✅ |
| `circle(r)` の直径（r=2,3,4,5,6,7,8,12,20,40） | r=2 で 4px・r=5 で 8px 等 | **全て量子化後の期待値と一致** ✅ |
| `arcBlocks` 全周のアルファ値 | 128 と 192（輝度ムラ） | **128 のみ** ✅ |
| `bandRadial` のリング間の隙間 | — | **0**（新方式でも隙間なし）✅ |
| 焼き込みサイズ | 14〜16px が 5px | **全フォントで 11px 以上・倍率は整数** ✅ |

直径が奇数セルの図形は、セル中心に乗るため**指定中心から最大半セル（2px）ずれる。**
グリッド上では避けられない性質であり、図形自体の対称性は保たれている（全行の中心が一致する）。

### テスト

`tests/unit/game/render/` に **25 件**を追加した（unit 全体: 177 → 202 passed）。

**各テストが実際に欠陥を検出することを、旧実装へ意図的に戻して確認済み。**

| 戻した実装 | 落ちたテスト |
|---|---|
| 旧スキャンライン `circle` | 対称性 / 行位置の安定性 |
| 旧スキャンライン `ellipse` | 高さの膨張 / 対称性 |
| 重複抑止を無効化 | `arcBlocks` / `line` の重複 |
| 偶奇そろえを外す | `circle` / `ellipse` の対称性 |
| 直径量子化 → 半径量子化 | 小さい円の膨張 / 直径の一致 |

`sprite()` の回転保持（F-01）は実 canvas での焼き込みを伴うため
`happy-dom` では検証できず、**回帰テストを追加できていない。**

### 未実施

- **実機（実際のゲームループ）での目視確認**。実行環境の制約により行えない
- 第4回監査のスコープ外項目（§11.8）。`CLAUDE_OWNER.md` の禁止事項に該当するため別ブランチで対応する
