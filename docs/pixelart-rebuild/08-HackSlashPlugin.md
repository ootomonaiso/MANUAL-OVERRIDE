# HackSlashPlugin.ts PixelArt化仕様

## 対象ファイル

- `src/genres/HackSlashPlugin.ts`（207 行）

### 影響を受けるファイル

| パス | 影響 |
|---|---|
| `src/game/render/PixelCanvas.ts` / `SpriteRenderer.ts` | 新規 |
| `src/data/sprites/player-knight-dark.json` | 新規。暗黒騎士（大剣付き） |
| `src/data/sprites/castle-ruin.json` / `pillar-broken.json` | 新規。廃城の壁・崩れた柱 |
| `src/data/genres/hack_slash.json` | **変更しない** |

## 現状（Before）

計測値: `arc` 5 / `ellipse` 1 / グラデーション 0 / `_roundRect` 1 / `lineTo` 9 /
`stroke` 6 / `fillRect` 2 / **`shadowBlur` 4**。

| 行 | メソッド | 現状の描画 |
|---|---|---|
| 54-84 | `drawFarLayer` | 廃城の壁と崩れた塔のシルエット、巨大な赤い血月（`arc` + `shadowBlur` グロー） |
| 85-124 | `drawMidLayer` | 崩れた柱、静止した血飛沫のパーティクル |
| 125-207 | `drawPlayer` | 暗い鎧の騎士。赤いルーン・光る目・振られる大剣 |

`starColor = '#ff6644'`（赤）。ゲームロジックは持たない。

## 変更方針（PixelArt化の仕様）

### 1. 廃城・血月（`drawFarLayer`）

| 要素 | 変更 |
|---|---|
| 廃城の壁・塔 | `castle-ruin.json` のスプライト、または `px.rect()` の矩形組み合わせ。崩れた輪郭は**階段状の欠け**で表現するとドット絵らしくなる |
| 血月 | `px.circle()` のブロック円。`shadowBlur` のグローは `px.halo()` の**同心円ブロックハロー**へ置換 |

血月は本ジャンルの象徴的な要素であり、
ブロック円 + 2 段ハローで「レトロゲームの巨大な月」らしさが出ると考える。

### 2. 柱・血飛沫（`drawMidLayer`）

| 要素 | 変更 |
|---|---|
| 崩れた柱 | `pillar-broken.json` のスプライト。サイズ違いで使い回す |
| 血飛沫 | `arc` を `px.rect()` の 1〜2 セルブロックへ。**静止した装飾であり配置ハッシュは変更しない** |

### 3. 暗黒騎士（`drawPlayer`）→ スプライト

`player-knight-dark.json` へ。以下を含める。

- 暗い鎧の胴・兜
- 赤いルーン（鎧の装飾）
- 光る目 — `shadowBlur` によるグローを、**目の周囲 1 セルを明るい赤で囲む**表現に置換
- 大剣 — 現状は `runCycle` で振られている。スプライトの `run_a` / `run_b` の
  2 フレームで剣の角度差を表現する

「光る目」はドット絵では**明度の高い数セル + その周囲の中間色**で表すのが定石であり、
`shadowBlur` より意図が伝わりやすいと考える。

### 4. 変更しないもの

- `skyColors` / `groundColors` / `farLayerColor` / `midLayerColor` /
  `starColor` / `palette` の色の値
- `spawnTable`
- 城・柱・血飛沫の配置を決める決定論的ハッシュ
- 剣の振りを駆動する `runCycle` の使い方（引数はそのまま）

## 実際に行った作業内容（実装後に追記）

2026-08-23、P3 として実装完了。

- 城壁シルエット → `px.ridge`。血の月 → `px.circle` + `px.halo`（2段ハロー、`shadowBlur` の代替）
- 崩れた柱: スプライト化せず `px.rect` の直接呼び出しに簡略化（07-AquaticPlugin.md と同じ
  理由。ハッシュ由来のサイズを毎回手続き的に計算するため、サイズ違いの使い回しは
  スプライトなしでも成立する）。配置ハッシュ・崩れ具合の式は無変更
- 血しぶき → `px.rect`（1〜2セルブロック）。配置は無変更
- プレイヤーは `player_knight_dark.json`（`player_base` と同じ2関節脚パターン）に置換。
  光る目は `shadowBlur` の代わりに「明るい中心 + 周囲のワンサイズ大きい中間赤」を
  スプライト内に静的に焼き込んで表現（仕様通り）
- **大剣は仕様（run_a/run_bの2フレーム）から逸脱し、スプライトに含めずライブの
  プリミティブ（`px.line`）として残した。** 理由: 剣の刃先が柄の位置から
  `(24,-28)` ローカル座標に伸び、実際の当たり判定ボックス（36×52）を大きく超える
  （回転後は座標がさらに外へ出る）。`04-StgPlugin.md` の炎・`05-AerialStgPlugin.md` の
  エンジン炎と同じ理由。副次効果として、2フレームへの離散化が不要になり、
  元コードの連続的な回転（`Math.sin(runCycle * 4π) * 0.3`）をそのまま維持できた
  （見た目のなめらかさは元より劣化していない）

検証結果: `typecheck` ✅ / `lint` ✅ / `build` ✅ / `validate`（124 passed、新規スプライト1件
含む）✅。ブラウザで `HackSlashPlugin` を動的importし `drawFarLayer`/`drawMidLayer`/
`drawPlayer` を実行しコンソールエラー無し。プレイヤースプライトは個別にPNGレンダリングして
目視確認済み（懸念点1の「暗すぎて潰れる」問題は、頭部の目の発光と胴体のルーン文様が
コントラストとして機能しており、深刻な潰れは確認できなかった）。

## 懸念点・確認事項

1. **暗い配色**: `skyColors = ['#0a0000', '#150000']` と非常に暗く、
   ドット化により階調が減るとほぼ真っ黒に潰れる可能性がある。これは**推測**であり、
   実装後に目視で確認する。潰れる場合は `PIXELART.gradientSteps` を増やして
   帯を細かくする（色の値自体は変更しない）。
2. `shadowBlur` が 4 箇所と多く、グローが雰囲気作りの主役になっている。
   `px.halo()` で置き換えた結果が現状より貧相にならないか、
   P3 の中でも早めに実装して方向性を確認したい。
