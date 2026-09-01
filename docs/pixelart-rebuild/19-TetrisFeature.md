# TetrisFeature.ts PixelArt化仕様

## 対象ファイル

- `src/game/systems/TetrisFeature.ts`（728 行 / **リポジトリ最大の FeatureSystem**）
- 描画は `render()` とその補助 `_drawBlock()` に限定される

### 影響を受けるファイル

| パス | 影響 |
|---|---|
| `src/game/render/PixelCanvas.ts` / `PixelText.ts` | 新規 |
| `src/game/systems/tetris-colors.ts` | **変更しない。** `TETRIS_COLORS` を参照 |
| `src/genres/TetrisPlugin.ts` | マスコットの配色を揃える（[15](15-TetrisPlugin.md)） |
| `src/data/genres/tetris.json` | **変更しない** |

## 現状（Before）

計測値: `arc` 0 / `ellipse` 0 / グラデーション 0 / `_roundRect` 0 / `lineTo` 2 /
`stroke` 2 / `fillRect` 7 / **`fillText` 5**。

**ゲームロジックが極めて厚い**（7-bag ランダマイザ、SRS 風の回転とウォールキック、
ソフト／ハードドロップ、ロックディレイ、ライン消去、スコアリング、ゲームオーバー判定）。
描画はそのごく一部。

`render()` の構成:

| 要素 | 現状の描画 |
|---|---|
| フィーチャーフラグのガード | `if (!this.state.initialized \|\| !world.rules.features.has('tetris_mode')) return` |
| ボード背景 | `fillRect` に `'rgba(0, 0, 0, 0.85)'` を**直書き** |
| グリッド線 | `stroke` + `'rgba(255, 255, 255, 0.06)'` を**直書き**。`COLS+1` 本 + `ROWS+1` 本 |
| 固定ブロック | `_drawBlock()` をセルごとに呼ぶ |
| 操作中のピース | 同上 |
| ゴーストピース | `globalAlpha = 0.2` で同上 |
| ボード枠・`SCORE:` / `LINES:` テキスト | `fillText` |
| GAME OVER オーバーレイ | `fillRect` + `fillText` |

**`CELL_SIZE` / `COLS` / `ROWS` はモジュール定数**として定義されており、
盤面の座標計算（`_calcBoardPosition`）に使われている。

## 変更方針（PixelArt化の仕様）

### 1. ブロック（`_drawBlock`）— **本ファイル最大の変更点**

[15-TetrisPlugin.md](15-TetrisPlugin.md) 1. と共通の**立体ブロック表現**
（`PixelCanvas.block()`）へ統一する。

```
現状: ベース色の矩形 + ハイライト
変更: ベース色 + 上辺／左辺の明色 1 セル + 下辺／右辺の暗色 1 セル
```

テトリスのブロックは**ドット絵表現が最も効く要素**であり、
7 色すべてに同じ立体化ルールを適用することで統一感が出る。
明色・暗色は `TETRIS_COLORS` のベース色から算出する（色定数は変更しない）。

### 2. グリッド線

`stroke` を `px.rect()`（幅 1 セルの矩形）へ置換する。
[16-PuzzlePlugin.md](16-PuzzlePlugin.md) 1. と同じく、
**アンチエイリアスが消えて罫線がくっきりする**という改善になる。

`COLS` / `ROWS` のループ回数と `CELL_SIZE` の乗算は**一切変更しない**。

### 3. ゴーストピース

`globalAlpha = 0.2` の半透明表現は、ドット絵では
**「輪郭だけを描く」または「市松ディザ」**で表すのが定番。

本ジャンルでは**輪郭のみ**（ブロックの外周 1 セルだけを描き、内部は塗らない）を採用する。
半透明よりも落下予測位置が読み取りやすくなると考える。

`0.2` という値は使わなくなるが、**ゴースト位置の計算ロジック
（`while (isValidPlacement(...)) ghost.row++`）には一切触れない。**

### 4. 文字（`SCORE:` / `LINES:` / `GAME OVER`）

`PixelText` 経由でドット化する。
ASCII のみのため日本語より潰れにくく、`textScale` の調整もしやすい。

### 5. ボード背景・オーバーレイ

`'rgba(0, 0, 0, 0.85)'` の均一な半透明塗りは
`00-rendering-system.md` D3 に該当するため**ドット化しない**。座標のスナップのみ。

### 6. 変更しないもの（**本ファイルは特に厳格に**）

- `CELL_SIZE` / `COLS` / `ROWS` の定数値
- `_calcBoardPosition()` の座標計算
- 7-bag ランダマイザ、回転・ウォールキック、ロックディレイ、ライン消去
- スコアリング、ゲームオーバー判定
- `onInit` / `onDisable` / `onManualUpdated` / `onPlayerHit` / `preUpdate` / `update`
- `render()` 冒頭のフィーチャーフラグのガード

## 実際に行った作業内容（実装後に追記）

2026-08-23、P4 として実装完了。

- `_drawBlock()`: ベース色+ハイライト/シャドウの手書き実装を `px.block()`
  （TetrisPlugin のマスコットと同じプリミティブ）に統一。`CELL_SIZE`（24）は
  `PIXELART.size`（既定4）の整数倍のため、エッジ幅の調整は不要だった（懸念点1は解消）
- グリッド線: `stroke` → `px.rect()`（幅1セル）。`COLS`/`ROWS`のループ・`CELL_SIZE`の
  乗算は無変更
- ゴーストピース: 半透明塗り（`globalAlpha=0.2`）を廃止し、仕様通り**外周1セルの輪郭のみ**
  （`_drawGhostBlock()` を新設、`px.line()` 4本）に変更。ゴースト位置の計算ロジック
  （`while (isValidPlacement(...))`）は無変更
- ボード枠（`strokeRect`）→ `px.line()` 4本。文字（`SCORE:`/`LINES:`/`GAME OVER`/
  `Score:`/`Lines:`）→ `px.text()`
- ボード背景・ゲームオーバーオーバーレイの均一な半透明塗りは D3 に該当するためドット化せず、
  `px.rect()` による座標スナップのみ
- 全体を包んでいた `ctx.save()`/`restore()` は、`fillStyle`/`font`/`globalAlpha` 等の
  直接的な状態変更が無くなった（すべて `px.*` 経由で自己完結する）ため不要になり削除した
- 7-bagランダマイザ・回転/ウォールキック・ロックディレイ・ライン消去・スコアリング・
  ゲームオーバー判定・`CELL_SIZE`/`COLS`/`ROWS` の定数値は無変更

検証結果: `typecheck` ✅ / `lint` ✅ / `test:features`（9/9）✅ / `test:unit`
（177/180、失敗3件はP0から継続する既存バグで本タスクと無関係）。ブラウザで
`onInit()` → `render()` を通常時・ゲームオーバー時の両方で実行し例外なし。

## 懸念点・確認事項（更新）

1. ~~`CELL_SIZE` と `PIXELART.size` の関係~~ → 解消（24は4の整数倍）。
2. **ゴーストの輪郭表現**: 半透明から輪郭のみへ変更。落下予測の読みやすさは
   実機でのプレイ確認が必要（推測の域を出ない）。読みにくい場合はディザ表現への
   後退を検討する。
3. 728行のファイル分割は本タスクのスコープ外のため行っていない（懸念点3の通り）。

## 懸念点・確認事項

1. **`CELL_SIZE` と `PIXELART.size` の関係**: `CELL_SIZE` が
   `PIXELART.size`（既定 4）の整数倍でない場合、
   ブロックの立体エッジ（1 セル）の幅が不揃いになる可能性がある。
   これは**推測**であり、実装前に `CELL_SIZE` の実値を確認する。
   **`CELL_SIZE` はゲームプレイ（盤面サイズ）に関わるため変更せず**、
   エッジ幅の方を調整して対応する。
2. **ゴーストの輪郭表現**（上記 3.）は現状の半透明から見た目が変わる。
   落下予測が読みにくくなればゲームプレイに影響しうるため、
   実装後に実際にプレイして確認する。読みにくければディザ表現に切り替える。
3. **728 行**あり `CLAUDE.md` に「新規の同種実装のテンプレートにするな」と
   名指しされているファイル。本タスクでは**描画部分にしか触れないため
   分割は行わない**（分割はゲームロジックの移動を伴い、スコープ外）。
