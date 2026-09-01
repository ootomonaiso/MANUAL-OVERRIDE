# DungeonPlugin.ts PixelArt化仕様

## 対象ファイル

- `src/genres/DungeonPlugin.ts`（194 行）

### 影響を受けるファイル

| パス | 影響 |
|---|---|
| `src/game/render/PixelCanvas.ts` / `SpriteRenderer.ts` | 新規 |
| `src/data/sprites/player-explorer.json` | 新規。フード姿のランタン持ち探索者 |
| `src/data/sprites/torch.json` | 新規。壁の松明 |
| `src/plugins/JSONGenrePlugin.ts` | `theme: 'dungeon'` は `rpg` へ委譲される設定のため、本ファイルは委譲先ではない |
| `src/data/genres/dungeon.json` | **変更しない** |

## 現状（Before）

計測値: `arc` 6 / `ellipse` 1 / グラデーション 1 / `_roundRect` 1 / `lineTo` 6 /
`stroke` 5 / `fillRect` 4 / `shadowBlur` 2。

| 行 | メソッド | 現状の描画 |
|---|---|---|
| 51-72 | `drawFarLayer` | 石の天井と壁のブロック（目地のライン付き） |
| 73-136 | `drawMidLayer` | 石柱と柱頭、壁の松明（炎 + 投射される半円状の光） |
| 137-194 | `drawPlayer` | フードを被ったランタン持ちの探索者 |

`starColor = undefined`（地下なので星なし）。ゲームロジックは持たない。

## 変更方針（PixelArt化の仕様）

### 1. 石壁（`drawFarLayer`）— **最も PixelArt と相性が良い部分**

石ブロックと目地のラインは、既に「格子状に並んだ矩形」であり、
**ドット絵のタイルセットそのもの**と言える構造になっている。

| 要素 | 変更 |
|---|---|
| 石ブロック | 座標を `_snap` するだけ。ブロックのサイズが `PIXELART.size` の整数倍になるよう調整 |
| 目地のライン | `stroke` を `px.line()`（太さ 1 セル）へ置換 |
| 石ごとの明度差 | 現状より積極的に付ける。決定論的ハッシュから 3 段階の明度を割り当て、**タイルの質感**を出す |

明度差の追加は「見た目の変更」の範囲内であり、
ドット絵らしさに直結するため実施する。

### 2. 石柱・松明（`drawMidLayer`）

| 要素 | 変更 |
|---|---|
| 石柱・柱頭 | `px.rect()` の矩形組み合わせ。角丸を除去し、柱頭は段差で表現 |
| 松明の炎 | `torch.json` のスプライト。炎は `flame_a` / `flame_b` の 2 フレームで揺らす |
| 投射される光 | `arc` の半円 + `shadowBlur` を、**ディザリングによる 2〜3 段の同心半円**へ置換 |

松明の光はドット絵では「段階的に暗くなる同心円をディザで繋ぐ」表現が定番であり、
現状のグラデーション + グローより雰囲気が出ると考える。

炎の揺らぎは現状 `Math.sin` 等で駆動されている。
**駆動する式は変更せず**、その値でスプライトのフレームを選ぶ形にする。

### 3. 探索者（`drawPlayer`）→ スプライト

`player-explorer.json` へ。フード・ランタンを含む。
`runCycle` で歩行 2 フレーム。**`_onGround` は現状も未使用のため引き続き使わない。**

ランタンの明かりは、キャラクタースプライトに含めるのではなく
`px.halo()` でスプライトの周囲に描く（明かりの範囲がキャラのバウンディングボックスを
超えるため、スプライト内に収めると切れてしまう）。

### 4. 変更しないもの

- `skyColors` / `groundColors` / `farLayerColor` / `midLayerColor` / `palette` の色の値
- `starColor = undefined`
- `spawnTable`
- 石・柱・松明の配置を決める決定論的ハッシュ
- 炎の揺らぎを駆動する計算式

## 実際に行った作業内容（実装後に追記）

2026-08-23、P3 として実装完了。

- 天井・壁目地: `px.rect`/`px.line` に置換し、決定論的ハッシュから3段階の明度差
  （タイルの質感）を追加（仕様通り、見た目の変更として許容範囲）
- 石柱: 角丸を除去し `px.rect` の段差表現に置換（`torch.json` はスプライト化せず
  `px.circle`/`px.dither` の直接呼び出しに簡略化。07/08 と同じ理由）。
  投射される光は `createRadialGradient`+`shadowBlur` → `px.dither` の同心半円へ。
  炎本体は駆動式そのまま2段階の見た目に単純化。配置ハッシュ・揺らぎの式は無変更
- プレイヤーは `player_explorer.json`（`player_base` と同じ2関節脚パターン。
  フード・光る目を含む）に置換。ランタンの明かりは当たり判定ボックスを超えて
  広がるため `px.halo` でスプライト外に別描画（仕様通り）

検証結果: `typecheck` ✅ / `lint` ✅ / `validate`（125 passed、新規スプライト1件含む）✅。
ブラウザで `DungeonPlugin` を動的importし `drawFarLayer`/`drawMidLayer`/`drawPlayer` を
実行し例外なし。

## 懸念点・確認事項

1. **石ブロックのサイズ調整**: 現状のブロックサイズが `PIXELART.size`（既定 4）の
   整数倍でない場合、目地のラインが不揃いになる。
   描画時に丸めることで対応できると**推測**するが、
   ブロックサイズ自体を変えると見た目の密度が変わるため、実装後に目視で判断する。
2. **環境オーバーレイ**: `dungeon` は `environment: 'dungeon'` により
   `rgba(30,0,60,0.25)` の紫ティントが全画面に重なる。
   石壁の明度差がティントで潰れないか実装後に確認する（**推測**）。
