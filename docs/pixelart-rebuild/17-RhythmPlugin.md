# RhythmPlugin.ts PixelArt化仕様

## 対象ファイル

- `src/genres/RhythmPlugin.ts`（44 行 / **ジャンルプラグイン中で最も薄い**）

### 影響を受けるファイル

| パス | 影響 |
|---|---|
| `src/genres/BasePlugin.ts` | **本ファイルは `DarkThemePlugin` を継承しており、変更が直接波及する**（[03](03-BasePlugin.md)） |
| `src/game/render/PixelCanvas.ts` | 新規 |
| `src/game/systems/RhythmFeature.ts` | ビートマーカーの描画（[24](24-RhythmFeature.md)）。本ファイルの縦帯と**視覚的に競合しうる** |
| `src/plugins/JSONGenrePlugin.ts` | `theme: 'rhythm'` の `sports` が本プラグインへ委譲される（[18](18-JSONGenrePlugin.md)） |
| `src/data/genres/rhythm.json` / `sports.json` | **変更しない** |
| `src/data/config/rhythm_tuning.json` | **変更しない** |

## 現状（Before）

計測値: `arc` 0 / `ellipse` 0 / グラデーション 0 / `lineTo` 0 / `stroke` 0 /
**`fillRect` 1** / `fillText` 0。

44 行しかなく、**上書きしているのは `drawMidLayer` のみ**。

```ts
drawMidLayer(ctx, offsetX, W, gY): void {
  // 薄い紫のビート縦列を描く（fillRect 1 箇所）
  // ...
  super.drawMidLayer(ctx, offsetX, W, gY)   // 継承したビル群を重ねて描く
}
```

その他（`drawFarLayer` の山、`drawPlayer` の人型ランナー、`drawForeground` のビネット）は
**すべて `DarkThemePlugin` から継承**している。

```ts
skyColors    = ['#0a0015', '#150028']   // 紫
groundColors = ['#1a0030', '#0d0018']
starColor    = '#cc88ff'                // 紫の星
```

## 変更方針（PixelArt化の仕様）

### 1. 継承による自動的な PixelArt 化

**本ファイルの描画の大半は [03-BasePlugin.md](03-BasePlugin.md) の作業で
自動的に PixelArt 化される。**

| 要素 | 対応 |
|---|---|
| 山のシルエット（`drawFarLayer`） | `DarkThemePlugin` の変更で自動対応 |
| 人型ランナー（`drawPlayer`） | `DarkThemePlugin` のスプライト化で自動対応 |
| ビネット（`drawForeground`） | `DarkThemePlugin` の変更で自動対応 |
| ビル群（`super.drawMidLayer`） | `DarkThemePlugin` の変更で自動対応 |

**本ファイル固有の変更は「ビートの縦帯」1 箇所のみ。**

### 2. ビートの縦帯（`drawMidLayer` の固有部分）

`fillRect` 1 箇所で描かれている薄い紫の縦帯を `px.rect()` へ置換する。

- 帯の幅を `PIXELART.size` の整数倍に丸める
- 帯の間隔・位置の計算式は**変更しない**（BPM に同期しているため、
  変えるとリズムゲームとしての意味が壊れる）
- 半透明の帯は `px.withAlpha()` で量子化する

### 3. `super.drawMidLayer()` の呼び出し

**維持する。** ビート帯 → ビル群の描画順は現状のままにする。

### 4. 変更しないもの

- `skyColors` / `groundColors` / `farLayerColor` / `midLayerColor` /
  `starColor` / `palette` の色の値
- `spawnTable`
- ビート帯の間隔・位置を決める計算（BPM 同期）
- `DarkThemePlugin` の継承関係
- `super.drawMidLayer()` の呼び出し順

## 実際に行った作業内容（実装後に追記）

2026-08-23、P3 として実装完了。想定通り本ファイル固有の変更は1箇所のみ。

- ビートの縦帯: `ctx.fillRect` → `px.rect()`。半透明は `px.withAlpha(0.08, ...)` で量子化。
  **帯の間隔・位置の計算式（`spacing = 120` / `-(offsetX % spacing)`、BPM同期）は無変更**
- `super.drawMidLayer()` の呼び出し（ビート帯 → ビル群の描画順）は維持
- 山のシルエット・人型ランナー・ビネットは `DarkThemePlugin`（P2で実装済み）からの
  継承により自動的に PixelArt 化されており、本ファイルでの対応は不要だった
- `skyColors`/`groundColors`/`starColor`/`palette`/`spawnTable`・継承関係は無変更

検証結果: `typecheck` ✅ / `lint` ✅ / `build` ✅。`sports` ジャンルが
`JSONGenrePlugin` 経由で本プラグインを使うことは P5 で確認済み
（[18-JSONGenrePlugin.md](18-JSONGenrePlugin.md)）。

## 懸念点・確認事項（更新）

1. `RhythmFeature` のビートマーカー（マゼンタの縦点線）との視覚的競合は、
   実行環境の制約により**実機での確認が未実施**。ユーザー側での確認を推奨する。
2. 本ファイルの実作業は予告通りごく小さかった（ビート帯1箇所）。
3. `sports` ジャンルへの波及は P5 で確認済み。

## 懸念点・確認事項

1. **`RhythmFeature` のビートマーカーとの競合**: 本ファイルの「ビート縦帯」と
   `RhythmFeature.render()` の「マゼンタの縦破線」（[24](24-RhythmFeature.md)）は
   どちらも縦線であり、ドット化して輪郭が硬くなると
   **どちらがどちらか分かりにくくなる**可能性がある。これは**推測**であり、
   実装後に実際にプレイして確認する。
   問題があればスプライト側ではなくパレット（色の明度差）で区別を付ける
   （BPM やタイミングの値は変更しない）。
2. **本ファイルの実作業はごく小さい。** P2（`BasePlugin`）完了後に
   ビート帯 1 箇所を直すだけで完了する見込み。
3. `sports` ジャンルが `JSONGenrePlugin` 経由で本プラグインを使うため、
   変更は計 2 ジャンルに波及する。
