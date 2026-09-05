# PuzzlePlugin.ts PixelArt化仕様

> **判断に迷ったファイル（Q2）。ユーザー確認の結果、対象に含めることが決定した。**

## 対象ファイル

- `src/genres/PuzzlePlugin.ts`（73 行）

### 影響を受けるファイル

| パス | 影響 |
|---|---|
| `src/game/render/PixelCanvas.ts` | 新規 |
| `src/game/systems/PuzzleFeature.ts` | パズル盤面の描画本体（[20](20-PuzzleFeature.md)）。**方眼紙の描画が重複しているため要調整** |
| `src/plugins/JSONGenrePlugin.ts` | `theme: 'puzzle'` の `idle` / `tower_def` が本プラグインへ委譲される（[18](18-JSONGenrePlugin.md)） |
| `src/data/genres/puzzle.json` / `idle.json` / `tower_def.json` | **変更しない** |

## 現状（Before）

計測値: `arc` 0 / `ellipse` 0 / グラデーション 0 / `_roundRect` 0 / `lineTo` 2 /
`stroke` 2 / **`fillRect` 4** / `fillText` 0。

**明るい配色を持つ 2 つのプラグインのうちの 1 つ**（もう 1 つは `platformer`）。

```ts
skyColors    = ['#f4f4f8', '#e9e9f2']   // ほぼ白
groundColors = ['#e4e4ee', '#d2d2de']
starColor    = undefined
```

| 要素 | 現状 |
|---|---|
| `drawFarLayer` | **意図的な空実装（no-op）** |
| `drawMidLayer` | 方眼紙の罫線（細い線 + 5 マスごとの主線） |
| `drawPlayer` | シンプルな青いブロック |

**スコープ判断の根拠:** 背景の一部は空実装だが、
方眼紙の罫線とプレイヤーは実際に描画している。ゲームプレイ本体は
`PuzzleFeature.ts`（778 行、BFS による解答可能性保証まで実装済み）にある。
Q2 でユーザーが対象に含めると判断した。

## 変更方針（PixelArt化の仕様）

### 1. 方眼紙の罫線（`drawMidLayer`）

`stroke` による細線を `px.rect()`（幅 1 セルの矩形）へ置換する。

**PixelArt 化により、むしろ罫線は改善する。**
現状の `stroke` は座標が小数のときアンチエイリアスで滲むが、
グリッドに整列した 1 セルの矩形にすれば**くっきりした罫線**になる。

- 細い罫線: 1 セル幅、薄い色
- 5 マスごとの主線: 1 セル幅、濃い色
- **罫線の間隔・主線の周期（5 マス）の計算は変更しない**

### 2. プレイヤー（青いブロック）

[15-TetrisPlugin.md](15-TetrisPlugin.md) 1. と同じ**立体ブロック表現**
（`PixelCanvas.block()`）を適用する。

```
現状: 単色の青い矩形
変更: ベース色 + 上辺／左辺の明色 1 セル + 下辺／右辺の暗色 1 セル
```

明るい背景に対してブロックの輪郭がはっきりし、視認性も上がる。

### 3. `drawFarLayer` の空実装

**維持する。** [15-TetrisPlugin.md](15-TetrisPlugin.md) 2. と同じ理由で、
背景を足すのは仕様追加にあたるため行わない。

### 4. `PuzzleFeature.ts` との重複調整

**要注意点:** `PuzzleFeature.ts` にも `_drawPaperBackground()`（481-502 行）があり、
**方眼紙の背景を全画面に描いている。** つまり方眼紙が 2 箇所で描かれている。

| 描画元 | 役割 |
|---|---|
| `PuzzlePlugin.drawMidLayer` | 背景レイヤーとしての方眼紙 |
| `PuzzleFeature._drawPaperBackground` | パズル盤面の下地としての方眼紙 |

両者のグリッド間隔・色が揃っていないと、PixelArt 化で
**格子のずれが目立つ**可能性がある。実装時に両者の
グリッド間隔を確認し、`PIXELART.size` の整数倍に揃える。
**描画の呼び出し構造自体は変更しない**（どちらかを削除するのは仕様変更にあたる）。

### 5. 変更しないもの

- `skyColors` / `groundColors` / `farLayerColor` / `midLayerColor` / `palette` の色の値
- `starColor = undefined`
- `drawFarLayer` の空実装
- `spawnTable`
- 罫線の間隔・主線の周期の計算

## 実際に行った作業内容（実装後に追記）

2026-08-23、P3 として実装完了。

- グリッド罫線: `ctx.stroke` → `px.line`（1セル幅）。間隔・主線周期の計算は無変更
- プレイヤー: `px.block()`（TetrisPlugin と同じ立体ブロック表現）に統一。
  従来の内側ハイライト矩形（`fillRect(8,4,w-16,h*0.4,'#6666aa')`）は `px.block()` 自身の
  上/左ベベルと役割が重複するため削除した（15-TetrisPlugin.md と同じ整理）
- **方眼紙の二重描画（懸念点1）**: `_gridSize = 40` は `PIXELART.size`（既定4）の
  整数倍であるため、少なくとも本ファイル側の格子はセルグリッドとズレない。
  `PuzzleFeature.ts`（20-PuzzleFeature.md、P4で対応予定）側のグリッド間隔との
  整合は、そちらの実装時に確認する
- `drawFarLayer` の空実装、`spawnTable`、色の値は無変更

検証結果: `typecheck` ✅ / `lint` ✅ / `build` ✅。ブラウザで `drawMidLayer`/`drawPlayer` を
実行し例外なし。新規スプライトは作成していない（矩形の組み合わせで十分なため）。

## 懸念点・確認事項

1. **方眼紙の二重描画**（上記 4.）: `PuzzlePlugin` と `PuzzleFeature` の
   グリッドが揃っていない場合、ドット化で**モアレや二重線**が発生する可能性がある。
   これは**推測**であり、実装前に両者のグリッド間隔を実測して確認する。
2. **明るい背景**: `puzzle` は白背景のため、他ジャンル向けに調整した
   `PIXELART` の値（特に `alphaSteps`）が合わない可能性がある。
   実装後に目視で確認する。
3. `idle` / `tower_def` ジャンルが `JSONGenrePlugin` 経由で
   本プラグインの描画を使うため、本ファイルの変更は
   **計 3 ジャンルに波及する**（[18-JSONGenrePlugin.md](18-JSONGenrePlugin.md) 参照）。
