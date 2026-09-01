# PuzzleFeature.ts PixelArt化仕様

## 対象ファイル

- `src/game/systems/PuzzleFeature.ts`（778 行 / **描画プリミティブ数は FeatureSystem 中最多**）

### 影響を受けるファイル

| パス | 影響 |
|---|---|
| `src/game/render/PixelCanvas.ts` / `PixelText.ts` | 新規 |
| `src/genres/PuzzlePlugin.ts` | **方眼紙の描画が重複**（[16](16-PuzzlePlugin.md) 4.）。グリッドを揃える必要がある |
| `src/data/config/puzzle.json` | **変更しない**（グリッドサイズ・フェーズ時間・スコアの定義元） |
| `src/data/genres/puzzle.json` | **変更しない** |

## 現状（Before）

計測値: `arc` 5 / `ellipse` 0 / グラデーション 1 / **`_roundRect` 14**（全ファイル中最多）/
`lineTo` 2 / `stroke` 8 / `fillRect` 3 / **`fillText` 7**。

**ゲームロジックが極めて厚い**（BFS による解答可能性の保証とリトライ、
偏差スコアリング、氷上スライド移動、タイマー、ダメージ、正解数カウント、
`puzzleTestInternals` のテスト用エクスポート）。

| 行 | メソッド | 現状の描画 |
|---|---|---|
| 345-480 | `render()` | 描画の統括 |
| 481-502 | `_drawPaperBackground()` | 全画面の方眼紙オーバーレイ |
| 503-540 | `_drawBoardPanel()` | 装飾付きの盤面パネル、日本語ヘッダ（`第 N 問` / `正解数`） |
| 541-556 | `_drawWall()` | 壁のセル |
| 557-580 | `_drawGoal()` | 脈動するゴール |
| 581-623 | `_drawPiece()` | 補間移動するプレイヤーの駒 |

`_roundRect` が 14 箇所と突出しているのは、
**セル・パネル・駒がすべて角丸で描かれているため**。PixelArt 化の主対象。

## 変更方針（PixelArt化の仕様）

### 1. 角丸の全廃（**本ファイル最大の変更**）

14 箇所の `_roundRect` を `px.rect()` へ置換する。

ドット絵では角丸は「角の 1 セルを落とす」で表現する。
`PixelCanvas` に `roundedRect(x,y,w,h,color,cut)` を用意し、
`cut` セル分だけ四隅を欠けさせる。

```
現状（角丸）:      変更後（角落とし）:
  ╭──────╮           ▗▄▄▄▄▄▄▖
  │      │           ▐      ▌
  ╰──────╯           ▝▀▀▀▀▀▀▘
```

### 2. セル（壁・空きマス・ゴール・駒）

| 要素 | 変更 |
|---|---|
| 壁（`_drawWall`） | 立体ブロック表現（`PixelCanvas.block()`）。[19-TetrisFeature.md](19-TetrisFeature.md) 1. と共通 |
| 空きマス | 角落としの矩形 + 1 セルの枠線 |
| ゴール（`_drawGoal`） | 脈動する `arc` を `px.circle()` のブロック円へ。**脈動の計算式（`animTime`）は変更しない** |
| 駒（`_drawPiece`） | 立体ブロック表現。**補間移動の計算式は変更しない**（座標のスナップのみ） |

### 3. 駒の補間移動とスナップ

`_drawPiece()` は `animTime` によるセル間の補間移動を行っている。
座標を `_snap` すると、**なめらかな移動が段階的な移動になる**。

これはドット絵として自然な挙動だが、氷上スライドの手触りが変わって
感じられる可能性がある。**移動の計算式・速度・ロジックは一切変更せず、
描画時の座標だけを丸める。** ゲームプレイ上の位置は変わらない。

### 4. 方眼紙背景（`_drawPaperBackground`）

`PuzzlePlugin.drawMidLayer` と**同じ方眼紙が二重に描かれている**。
[16-PuzzlePlugin.md](16-PuzzlePlugin.md) 4. の通り、
両者のグリッド間隔を `PIXELART.size` の整数倍に揃える。

**どちらの描画も削除しない**（削除は仕様変更にあたる）。

### 5. 文字（**当初版はヘッダしか扱っておらず不完全だった**）

本ファイルの文字描画は **`fillText` 7 箇所 + `strokeText` 2 箇所 = 9 箇所**。
全件を以下の通り扱う。

| 行 | 文字列 | 種別 | 扱い |
|---|---|---|---|
| 373 | `` `第 ${n} 問` `` | 日本語・動的 | `PixelText`。`align='center'` |
| 376 | `` `ゴールへ滑り込め   正解数 ${n}` `` | 日本語・動的 | `PixelText`。`align='center'` |
| 421 | `` `${Math.ceil(timer)}s` `` | ASCII・**毎秒変化** | `PixelText`。キャッシュのヒット率に注意（`00-rendering-system.md` §6 のキャッシュ表参照） |
| 432 | ハート（残機） | 記号・動的 | `PixelText`。`align='center'`。**記号が潰れやすい**ため §8 の D9 判定対象に準じる |
| 437 | `'↑ ↓ ← → : 移動      SPACE : リセット'` | 日本語 + 矢印記号 | `PixelText`。**矢印記号の潰れに注意**。D9 判定対象 |
| 451 + 453 | `'CLEAR!'` | ASCII・**縁取り付き** | `PixelText` の `stroke` オプション（`#0f5132` / 既存の `lineWidth`）+ `fill` |
| 469 + 471 | `'TIME UP'` | ASCII・**縁取り付き** | 同上（`#7a1015`）|

**`strokeText` の 2 箇所（451 / 469）は当初版で完全に見落としていた。**
`PixelText` が縁取りに対応しないとこの 2 箇所だけ描画が崩れるため、
`00-rendering-system.md` §6 に `stroke` オプションを追加した。

縁取りは既存と同じ **stroke → fill の順**で描く
（オフスクリーン内で 2 パス描いてから 1 回で転送する）。

`textAlign = 'center'` は既存コードが `ctx.textAlign` に設定しているため、
`opts.align` へ移し替えるだけで**表示位置は変えない**。

### 6. パーティクル演出

正解時・ダメージ時のパーティクルは `world` 経由で
`ParticleSystem` に追加される。ブロック化は [02-ParticleSystem.md](02-ParticleSystem.md) で
対応済みのため、**本ファイルでは粒子の生成パラメータに触れない。**

### 7. 変更しないもの（**本ファイルは特に厳格に**）

- BFS による解答可能性の保証、リトライ、偏差スコアリング
- 氷上スライドの移動判定、タイマー、ダメージ処理、正解数カウント
- `puzzleTestInternals` のエクスポート（**テストが依存している**）
- `PUZZLE` 設定（`puzzle.json`）の値
- `_handleTimeUp()` の処理順（過去に `resetCombo` と `modifyPlayerHp` の
  順序バグが修正された経緯があるため、絶対に触らない）
- `onInit` / `onDisable` / `preUpdate` / `update` / `onManualUpdated`

## 実際に行った作業内容（実装後に追記）

2026-08-23、P4 として実装完了。

- **角丸の全廃**: 14箇所の `_roundRect` を全廃し、`px.roundedRect()`（角落とし）+
  `_strokeRoundedRect()`（新設の私的ヘルパー。`roundedRect` が塗りつぶし専用のため、
  枠線は直線4本で近似）に置換。ファイル固有の `_roundRect()` パスヘルパーは
  全呼び出し元を置き換えた結果不要になったため削除した
- 壁（`_drawWall`）: 仕様通り `px.block()` に統一（`shadowBlur`+2枚のroundRectだった
  実装を1呼び出しに集約）
- 空きマス: `px.roundedRect()` の塗り + `_strokeRoundedRect()` の枠線
- ゴール（`_drawGoal`）: `arc`+`stroke` → `px.circle()`（塗り円）+ `px.arcBlocks()`
  （リング2本）。脈動の計算式（`animTime`）は無変更
- 駒（`_drawPiece`）: 縦グラデーション → `px.bandGradient()`。角丸の輪郭は
  `_strokeRoundedRect()`。光沢・中央スタッドも同様にプリミティブ置換。
  **補間移動の計算式（`_renderCell`）は無変更**、描画座標のみ `px.*` 内部でスナップされる
- 方眼紙背景（`_drawPaperBackground`）: `PuzzlePlugin.drawMidLayer` と同じ
  `_paperGridSize`（=40）を使用しており、両者の格子は既に揃っていることを確認した
  （16-PuzzlePlugin.md 側の `_gridSize` も40で同一）
- 文字（9箇所、`fillText`7 + `strokeText`2）: 全件 `px.text()` に置換。
  `CLEAR!`/`TIME UP` の縁取りは `PixelTextOptions.stroke` オプションを使用。
  `textAlign`/`textBaseline` の設定はそれぞれの `align`/`baseline` オプションへ
  1:1で移し替え、表示位置は変えていない
- **省略した装飾（懸念点として報告）**: 盤面パネルの `shadowBlur` によるドロップシャドウ
  （影付きカード効果）と、駒の `shadowBlur` による浮遊影は実装していない。
  これらは形状に沿う方向性のある影であり、`00-rendering-system.md` の D3
  （均一な全画面半透明塗り）には該当しないため単純な `withAlpha` 量子化では代替できず、
  適切なブロック影のプリミティブが `PixelCanvas` に無いため今回は省略という判断をした。
  必要であれば `px.halo` を非対称に拡張する等の追加実装を別途検討する
- BFSによる解答可能性の保証、偏差スコアリング、氷上スライドの移動判定、タイマー、
  ダメージ処理、正解数カウント、`puzzleTestInternals`、`_handleTimeUp()` の処理順は
  一切変更していない

検証結果: `typecheck` ✅ / `lint` ✅ / `build` ✅ / `validate`（133 passed）✅ /
`test:features`（9/9）✅ / `test:unit`（177/180、失敗3件はP0から継続する既存バグで
本タスクと無関係。`puzzleTestInternals` 関連のテストはすべて成功）。
ブラウザで `onInit()` → `render()`（通常時・クリア演出・ダメージ演出の3パターン）を
実行し例外なし。`getImageData` で盤面背景・壁・パネルの色が期待通りの値
（例: 壁色 `#3b3b5c` = `rgb(59,59,92)`）で出力されていることを確認した。

## 懸念点・確認事項（更新）

1. 日本語・矢印記号・ハート記号の潰れについては、実行環境の制約により
   実機での目視確認は未実施（01-sideScroller.md と同じ制約）。ユーザー側での
   確認を推奨する。潰れる場合は D9 の後退条件（該当文字列のみ `PixelText` を通さない）
   で対応する。
2. 方眼紙の二重描画は上記の通り格子が揃っていることを確認済み。
3. `puzzleTestInternals` への影響なし（テスト結果で確認済み）。
4. 778行のファイル分割は本タスクのスコープ外のため行っていない。

## 懸念点・確認事項

1. **日本語・記号のドット化**（上記 5.）: 本ファイルは
   日本語・矢印記号・ハート記号がすべて含まれ、
   **本タスク全体で最も潰れやすい箇所が集中している**と**推測**される。
   後退の判断基準は `00-rendering-system.md` §8 の D9 に従う
   （`textScale` を 2〜4 で調整しても判読できない場合のみ、
   該当文字列を現状の `fillText` に戻す）。
2. **方眼紙の二重描画**（上記 4.）: グリッドがずれているとモアレが出る可能性がある。
   実装前に両者の間隔を実測して確認する。
3. **`puzzleTestInternals` への影響**: 描画メソッドのみ変更するため
   テスト用エクスポートには影響しないはずだが、
   `npm run test:unit` / `test:features` で必ず確認する。
4. **778 行**あり `CLAUDE.md` の 300 行目安を大きく超える。
   ただし分割はゲームロジックの移動を伴うため**本タスクでは行わない**。
