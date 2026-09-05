# SurvivalPlugin.ts PixelArt化仕様

## 対象ファイル

- `src/genres/SurvivalPlugin.ts`（238 行）

### 影響を受けるファイル

| パス | 影響 |
|---|---|
| `src/game/render/PixelCanvas.ts` / `SpriteRenderer.ts` / `PixelText.ts` | 新規。HUD の文字で `PixelText` を使う |
| `src/data/sprites/player-survival.json` | 新規。バックパックを背負ったサバイバー |
| `src/data/sprites/tree-dead.json` | 新規。枯れた木 |
| `src/game/systems/SurvivalFeature.ts` | 同ジャンルの近接攻撃描画（[21](21-SurvivalFeature.md)）。本ファイルとは別 |
| `src/data/config/survival.json` | **変更しない**（HUD が表示する値の定義元） |
| `src/data/genres/survival.json` | **変更しない** |

## 現状（Before）

計測値: `arc` 3 / `ellipse` 1 / グラデーション 0 / `_roundRect` 2 / `lineTo` 5 /
`stroke` 3 / `fillRect` 7 / **`fillText` 4**。

**ジャンルプラグインの中で唯一、実ゲームロジックを持つ。**

| 行 | メソッド | 内容 | 分類 |
|---|---|---|---|
| 67-76 | `onGenreLocked` | ジャンル確定時の状態初期化 | **ゲームロジック（変更しない）** |
| 77-94 | `drawFarLayer` | 霧のかかった暗い丘 | 描画 |
| 95-124 | `drawMidLayer` | ねじれた枯木 | 描画 |
| 125-169 | `drawPlayer` | バックパックを背負ったサバイバー | 描画 |
| 170-217 | `drawGenreHUD` | 空腹バー・XP バー・Lv・ATK パネル（`fillText` 4 箇所） | 描画 |
| 218-238 | `onHazardDestroyed` | `world.spawnItem` で食料・武器のドロップ抽選 | **ゲームロジック（変更しない）** |

`starColor` は `undefined`（森なので星なし）。

## 変更方針（PixelArt化の仕様）

### 1. 丘（`drawFarLayer`）

`03-BasePlugin.md` 1. と同じ `px.ridge()` による階段状の稜線へ。
霧の表現は `globalAlpha` の重ね塗りから、**ディザリング（市松パターン）による
2 色混合**に置換する。ドット絵の霧は半透明ではなくディザで表すのが定石であり、
本ジャンルの暗い雰囲気にも合うと考える。

### 2. 枯木（`drawMidLayer`）→ スプライト

`lineTo` / `stroke` によるねじれた枝を `tree-dead.json` のスプライトに置換する。

- 木は複数本が視差スクロールで並ぶため、**サイズ違いで同じスプライトを使い回す**
- `drawImage` の転送先サイズを変えるだけで大小を表現できる
- 配置を決めているハッシュ計算は**変更しない**（変えると木が飛ぶ）

### 3. サバイバー（`drawPlayer`）→ スプライト

`player-survival.json` へ。`onGround` / `runCycle` の 2 引数だけで
`run_a` / `run_b` / `jump` を切り替える（新しい状態は追加しない）。
バックパックはスプライトに含める。

### 4. HUD（`drawGenreHUD`）

**本ジャンル固有の重要点。** `fillText` が 4 箇所あり、`Lv` / `ATK` などの
ラベルと数値を表示している。

| 要素 | 変更 |
|---|---|
| 空腹バー・XP バー | 角丸（`_roundRect`）を除去し `px.rect()` へ。バーの塗り幅は**現状の計算式のまま** |
| パネル背景 | `px.rect()` + 1 セルの枠線（`px.line()`） |
| 文字 | `PixelText` 経由でドット化 |

**HUD が表示する数値（`world` から読む空腹値・XP・Lv・ATK）の
取得ロジックには一切触れない。** 見た目だけを変える。

### 5. 変更しないもの

- `onGenreLocked()` — ジャンル確定時の状態初期化（ゲームロジック）
- `onHazardDestroyed()` — アイテムドロップの抽選（ゲームロジック）
- `skyColors` / `groundColors` / `palette` の色の値、`starColor = undefined`
- `spawnTable`
- HUD が読む `world` のプロパティとその計算

## 実際に行った作業内容（実装後に追記）

2026-08-23、P3 として実装完了。

- `drawFarLayer`: 式は無変更。パス補間 → `px.ridge`（`px.withAlpha` で霧のアルファ量子化）
- `drawMidLayer`: 配置ハッシュは無変更。枯木を `tree_dead.json` スプライトに置換し、
  `treeH`（ハッシュ由来のサイズ）に応じて転送先サイズを変えるだけで大小を表現
  （スプライト自体は使い回し、仕様通り）
- `drawPlayer`: `player_survival.json`（`idle`/`run_a`/`run_b`/`jump`、`player_base` と同じ
  股関節→膝→足先の2関節脚・近遠固定シェードのパターンを踏襲）に置換。
  影は `px.ellipse` としてスプライト外に残した
- `drawGenreHUD`: `_roundRect` を除去し `px.rect`。4箇所の `fillText` を `px.text` に置換。
  HUD が読む数値（hunger/level/xp/weaponDamage）の計算式は一切変更していない
- `onGenreLocked` / `onHazardDestroyed`（ゲームロジック）は無変更。差分で確認済み

検証結果: `typecheck` ✅ / `lint` ✅ / `build` ✅ / `validate`（122 passed、新規スプライト2件
含む）✅。ブラウザで `SurvivalPlugin` を動的importし `drawFarLayer`/`drawMidLayer`/
`drawPlayer`/`drawGenreHUD`（fake `MutableWorld.player` 込み）を実行しコンソールエラー無し。
プレイヤースプライトは個別にPNGレンダリングして目視確認（暗い配色のため脚のコントラストが
低いが、これは元コードの色自体がダークカラーのため。色の値は変更していない）。

## 懸念点・確認事項

1. **HUD の文字サイズ**: `PixelText` は「小さく描いて拡大する」方式のため、
   元々小さい HUD の文字（Lv / ATK など）は縮小段階で潰れる可能性がある。
   これは**推測**であり、`PIXELART.textScale` の調整で対応できるか実装後に確認する。
   潰れる場合、HUD の数値だけは `PixelText` を通さず現状維持とする案もある。
2. 本ファイルは `onGenreLocked` / `onHazardDestroyed` というゲームロジックを含むため、
   実装時は**描画メソッド 4 つ（`drawFarLayer` / `drawMidLayer` / `drawPlayer` /
   `drawGenreHUD`）以外に触れない**ことを差分で厳密に確認する。
