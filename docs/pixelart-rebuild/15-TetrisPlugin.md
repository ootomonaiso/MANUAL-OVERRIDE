# TetrisPlugin.ts PixelArt化仕様

> **判断に迷ったファイル（Q2）。ユーザー確認の結果、対象に含めることが決定した。**

## 対象ファイル

- `src/genres/TetrisPlugin.ts`（77 行）

### 影響を受けるファイル

| パス | 影響 |
|---|---|
| `src/game/render/PixelCanvas.ts` | 新規 |
| `src/game/systems/tetris-colors.ts` | **変更しない。** `TETRIS_COLORS`（7 色）をパレットとして参照する |
| `src/game/systems/TetrisFeature.ts` | 盤面の描画本体（[19](19-TetrisFeature.md)）。**本ファイルと配色を揃える必要がある** |
| `src/data/genres/tetris.json` | **変更しない** |

## 現状（Before）

計測値: `arc` 0 / `ellipse` 0 / グラデーション 0 / `_roundRect` 0 / `lineTo` 0 /
`stroke` 0 / **`fillRect` 8** / `fillText` 0。

**描画が `fillRect` のみで構成されている唯一のジャンルプラグイン。**

| 要素 | 現状 |
|---|---|
| `drawFarLayer` | **意図的な空実装（no-op）** |
| `drawMidLayer` | **意図的な空実装（no-op）** |
| `drawPlayer` | T 字テトリミノ型のマスコット。紫のブロック + ハイライト + 目 |
| `spawnTable` | 全て 0 のプレースホルダ |

```ts
skyColors    = ['#0a0a0a', '#111111']   // ほぼ黒
groundColors = ['#0d0d0d', '#080808']
starColor    = undefined
```

**スコープ判断の根拠:** 背景は空実装だが `drawPlayer` は実際に描画しており、
`fillRect` 8 箇所は「見た目を持つ」に該当する。ゲームプレイ本体は
`TetrisFeature.ts`（728 行、実装済み）にあり、本プラグインはその視覚的な入口。
Q2 でユーザーが対象に含めると判断した。

## 変更方針（PixelArt化の仕様）

**本ファイルは既に最も PixelArt に近い。** 変更は最小限になる。

### 1. プレイヤー（T 字テトリミノ）

| 要素 | 変更 |
|---|---|
| ブロック本体 | `fillRect` の座標を `_snap` するのみ |
| ハイライト | 現状は各ブロックの上／左に明色を置いていると**推測**。1 セル幅に統一し、ドット絵のブロック表現（明色の上辺・左辺、暗色の下辺・右辺）に整える |
| 目 | 2〜3 セルの黒 + 1 セルの白ハイライト |

テトリミノのブロックは**ドット絵で最も定番の「立体ブロック」表現**が使える。

```
 ■■■■■■   ← 明色（1px）
 ■□□□□▪
 ■□□□□▪   □ = ベース色
 ■□□□□▪   ■ = 明色 / ▪ = 暗色
 ▪▪▪▪▪▪   ← 暗色（1px）
```

### 2. 背景（`drawFarLayer` / `drawMidLayer`）

**空実装のまま維持する。**

テトリスは盤面に集中させるジャンルであり、背景を足すのは
「見た目の変更」を超えた仕様追加にあたる。`CLAUDE_OWNER.md` の
「見た目（描画）以外の変更は行わない」の趣旨からも、
現状の意図（背景なし）を尊重する。

### 3. `TetrisFeature.ts` との配色統一

本プラグインのマスコットと、`TetrisFeature.ts` が描く盤面のブロックは
**同じ立体ブロック表現に揃える**。両者は `tetris-colors.ts` の
`TETRIS_COLORS` を共有しているため、明色・暗色の算出方法を
共通のヘルパー（`PixelCanvas` の `block()` として実装）に寄せる。

### 4. 変更しないもの

- `skyColors` / `groundColors` / `palette` の色の値、`starColor = undefined`
- `drawFarLayer` / `drawMidLayer` の空実装
- `spawnTable`（全て 0 のプレースホルダ。テトリスはハザードを使わないため）
- `tetris-colors.ts` の `TETRIS_COLORS`

## 実際に行った作業内容（実装後に追記）

2026-08-23、P3 として実装完了。想定通り最小限の変更。

- `drawPlayer` の2ブロックを `px.block()`（既存の立体ブロックプリミティブ、P0 で追加済み）に
  置換。従来の半透明ハイライト矩形は `px.block()` 自体が上/左明色・下/右暗色のベベルを
  提供するため削除した（重複表現の整理）
- 目は `px.rect` に置換
- `drawFarLayer`/`drawMidLayer` の空実装、`spawnTable`、`tetrisColors` は無変更

検証結果: `typecheck` ✅ / `lint` ✅ / `build` ✅。ブラウザで `drawPlayer` を実行し例外なし。
新規スプライトは作成していない（矩形の組み合わせで十分なため、仕様通り）。

## 懸念点・確認事項

1. **本ファイルは変更量が最小**（実質 `drawPlayer` のブロック表現の整えのみ）。
   スプライト JSON も作らない（テトリミノは矩形の組み合わせで表現でき、
   スプライト化する利点がないため）。
2. `PixelCanvas.block()`（立体ブロック描画）は本ファイルと
   [19-TetrisFeature.md](19-TetrisFeature.md) の両方が使う共通ヘルパーになる。
   `00-rendering-system.md` の API 一覧に追加する必要がある。
   本書の承認と合わせて追記する。
3. 空実装の `drawFarLayer` / `drawMidLayer` を残すことで、
   本ファイルの「実際に行った作業内容」は最終的にごく短くなる見込み。
