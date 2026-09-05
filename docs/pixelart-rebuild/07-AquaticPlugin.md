# AquaticPlugin.ts PixelArt化仕様

## 対象ファイル

- `src/genres/AquaticPlugin.ts`（215 行）

### 影響を受けるファイル

| パス | 影響 |
|---|---|
| `src/game/render/PixelCanvas.ts` / `SpriteRenderer.ts` | 新規 |
| `src/data/sprites/player-diver.json` | 新規。潜水服のダイバー |
| `src/data/sprites/coral-branch.json` / `coral-fan.json` / `seaweed.json` | 新規。珊瑚 2 種・海藻 |
| `src/plugins/JSONGenrePlugin.ts` | `theme: 'aquatic'` の委譲先。間接的に変化 |
| `src/game/sideScroller.ts` | `_drawEnvironmentOverlay()` の `'ocean'` ティントが重なる。**変更しない** |
| `src/data/genres/aquatic.json` | **変更しない** |

## 現状（Before）

計測値: `arc` 6 / `ellipse` 1 / グラデーション 0 / `_roundRect` 1 / `lineTo` 13 / `stroke` 5 / `fillRect` 2。

`starColor = '#44ffdd'`（水色）が設定されており、`sideScroller._drawStarField()` が
**星ではなく「水中の光の粒」として**流用されている点が特徴。

| 行 | メソッド | 現状の描画 |
|---|---|---|
| 52-86 | `drawFarLayer` | 深海の岩のシルエット、神々しい光条（god ray） |
| 87-152 | `drawMidLayer` | 枝珊瑚・扇珊瑚、揺れる海藻、立ち上る気泡 |
| 153-215 | `drawPlayer` | 潜水服のダイバー（タンク・マスク・フィン） |

ゲームロジックは持たない（`GenrePlugin` の描画フックと色定義のみ）。

## 変更方針（PixelArt化の仕様）

### 1. 岩のシルエット・光条（`drawFarLayer`）

| 要素 | 変更 |
|---|---|
| 深海の岩 | `px.ridge()` による階段状のシルエット |
| 光条（god ray） | `lineTo` の斜め帯を、`px.rect()` の**縦長ブロックを斜めに階段状にずらして並べる**表現へ置換。半透明の重なりはディザで表現する |

光条はドット絵で「斜めに切った明るい帯」として描かれることが多く、
階段状のずらしが逆に雰囲気を出すと考える。

### 2. 珊瑚・海藻・気泡（`drawMidLayer`）

| 要素 | 変更 |
|---|---|
| 枝珊瑚 / 扇珊瑚 | `coral-branch.json` / `coral-fan.json` のスプライトへ。サイズ違いで使い回す |
| 海藻 | `seaweed.json` のスプライト。**揺れは既存の `Math.sin` による x オフセットをそのまま使い**、描画位置を `_snap` する |
| 気泡 | `arc` を `px.circle()` のブロック円へ。小さいものは 1〜2 セルの正方形で十分 |

海藻の揺れは連続的な x オフセットのため、スナップにより**カクカクした揺れ**になる。
これはドット絵として自然な挙動と考える。

### 3. ダイバー（`drawPlayer`）→ スプライト

`player-diver.json` へ。タンク・マスク・フィンを含む。
`runCycle` でフィンのバタ足 2 フレームを切り替える。
**`_onGround` は現状も未使用（`_` プレフィックス付き）のため、引き続き使わない。**

### 4. 星（光の粒）

`starColor` が設定されているため `sideScroller._drawStarField()` が動く。
そちらのブロック化は [01-sideScroller.md](01-sideScroller.md) 3. で対応済み。
**本ファイルでは `starColor` の値を変更しない。**

### 5. 変更しないもの

- `skyColors` / `groundColors` / `farLayerColor` / `midLayerColor` / `starColor` / `palette` の色の値
- `spawnTable`
- 珊瑚・海藻・気泡の配置を決める決定論的ハッシュ／`Math.sin` の式
- `parallax` 設定

## 実際に行った作業内容（実装後に追記）

2026-08-23、P3 として実装完了。

- **仕様からの簡略化（報告）**: 珊瑚2種・海藻はスプライト化せず、`px.line`/`px.rect`/
  `px.arcBlocks` の直接呼び出しに置換した。理由: 元コードは珊瑚のサイズ・波形を
  インスタンスごとに `coralH`/`Math.sin` で毎回手続き的に計算しており、サイズ違いの
  使い回しは元々プロシージャルに実現されているため、スプライト化による追加の利点が
  小さいと判断した。配置ハッシュ・波形の式は無変更
- 岩シルエット → `px.ridge`。光の柱 → `px.dither`（斜め帯を市松ディザで表現）
- 気泡 → `px.circle`
- ダイバーは `player_diver.json`（`player_base` と同じ2関節脚パターン。タンク・マスク・
  マスクガラスを含む）に置換。`_onGround` は元コード通り未使用のまま
  （`runCycle` のみでフィンの2フレームを切り替える。バタ足は接地状態を問わず常時動く
  元の挙動を踏襲）。頭上の気泡2つは当たり判定ボックスの外にはみ出すためスプライト外に残した

検証結果: `typecheck` ✅ / `lint` ✅ / `build` ✅ / `validate`（123 passed、新規スプライト1件
含む）✅。ブラウザで `AquaticPlugin` を動的importし `drawFarLayer`/`drawMidLayer`/
`drawPlayer` を実行しコンソールエラー無し。ダイバースプライトは個別にPNGレンダリングして
目視確認済み。

## 懸念点・確認事項

1. **環境オーバーレイとの二重掛け**: `aquatic` は `environment: 'ocean'` により
   `sideScroller._drawEnvironmentOverlay()` の青ティント（`rgba(0,60,160,0.20)`）が
   全画面に重なる。ドット化した珊瑚の色がティントで沈み、
   コントラストが不足する可能性がある。これは**推測**であり、実装後に目視で確認する。
   問題があればスプライトのパレット側で明度を上げて対処する（ティントの値は変更しない）。
2. 光条のディザ表現は、`PixelCanvas` に `dither()` が必要になる
   （[04-StgPlugin.md](04-StgPlugin.md) 1. と共通の要件）。
