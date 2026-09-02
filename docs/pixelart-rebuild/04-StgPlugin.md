# StgPlugin.ts PixelArt化仕様

## 対象ファイル

- `src/genres/StgPlugin.ts`（473 行 / 全ジャンルプラグイン中**最大の描画量**）

### 影響を受けるファイル

| パス | 影響 |
|---|---|
| `src/game/render/PixelCanvas.ts` / `SpriteRenderer.ts` | 新規。全描画が依存 |
| `src/data/sprites/player-stg.json` | 新規。自機 |
| `src/data/sprites/enemy-stg-interceptor.json` / `enemy-stg-gunship.json` | 新規。敵 2 種 |
| `src/plugins/JSONGenrePlugin.ts` | `theme: 'space'` のジャンルが `stg` へ委譲するため間接的に変化 |
| `src/data/genres/stg.json` / `arena.json` / `bullet_hell.json` 等 | **変更しない** |
| `src/game/systems/ShootFeature.ts` | 弾の描画は別ファイル（[23](23-ShootFeature.md)）。本ファイルとは独立 |

## 現状（Before）

計測値: `arc` 8 / `ellipse` 1 / **グラデーション 13**（全ファイル中最多）/ `_roundRect` 2 /
`lineTo` 25 / `stroke` 9 / `fillRect` 7 / `shadowBlur` 6 / `bezierCurveTo` 1。

| 行 | メソッド | 現状の描画 |
|---|---|---|
| 45-95 | `drawFarLayer` | 巨大な太陽のグロー（放射グラデーション）、漂う星雲（グラデーション）、輪付き惑星 |
| 96-132 | `drawMidLayer` | 中景の宇宙オブジェクト |
| 133-199 | `drawPlayer` | 矢じり型の自機。エンジン炎（グラデーション）+ コックピット |
| 200-222 | `drawHazard` | `world.rules.features.has('enemy_hp')` と `hazard.hp/maxHp` を見て敵の種類を切り替え、`true` を返して既定描画をスキップ |
| 223-299 | `_drawInterceptor` | エイリアン迎撃機 |
| 300-381 | `_drawGunship` | 装甲砲艦 |
| 382-398 | `_drawHpBar` | セグメント化された HP バー |
| 399-461 | `drawForeground` | CRT 風スキャンライン（420 行にコメントあり）、ビネット、HUD ブラケット |
| 462-473 | `_shade` | HEX の明度調整ヘルパー |

**注:** `drawHazard` はゲームプレイ状態（`enemy_hp` フィーチャーの有無、HP 残量）を
**読んで**見た目を変えている。読むだけで書き換えていないため、
PixelArt 化でこの分岐ロジックには一切触れない。

## 変更方針（PixelArt化の仕様）

### 1. 背景（`drawFarLayer` / `drawMidLayer`）

| 現状 | 変更後 |
|---|---|
| 太陽の放射グラデーション | `px.circle()` を半径違いで `PIXELART.gradientSteps` 重ねた**同心円ブロック**。中心ほど明るい |
| 星雲のグラデーション | **`px.dither()` による 2 色混合（既定・D8）。** 後退条件は `00-rendering-system.md` §8 |
| 惑星の円 + 輪 | `px.circle()` のブロック円 + `px.ellipse()` のブロック楕円の輪 |

星雲はドット絵表現として**ディザリング**（2 色を市松状に混ぜて中間色に見せる手法）が
最も雰囲気に合うと考える。`PixelCanvas` に `dither(x,y,w,h,colorA,colorB,ratio)` を追加する。

### 2. 自機（`drawPlayer`）→ スプライト

矢じり型の機体・コックピット・エンジン炎を `player-stg.json` の 1 スプライトにまとめる。

- エンジン炎は静止フレームではなく、`runCycle` を使った 2 フレーム（`flame_a` / `flame_b`）で
  明滅させる。**新しい状態変数は追加しない**
- 縦スクロール時（`aerial_stg` ではなく `stg` で `scrollAxis='y'` になる場合）、
  `sideScroller._drawPlayer()` 側で `-90°` 回転がかかる。
  デバイス空間スナップにより回転後もグリッドに整列する（`00-rendering-system.md` §3）。
  なお `StgPlugin` の自機は**右向き**に描かれており、回転の前提と一致している
  （`aerial_stg` のような向きの矛盾はない。[05](05-AerialStgPlugin.md) 4. 参照）

### 3. 敵（`_drawInterceptor` / `_drawGunship`）→ スプライト

2 種類とも `enemy-stg-*.json` のスプライトへ。
色は `hazard.color`（プラグインの `palette` 由来）で動的に変わるため、
**スプライトのパレットに「動的色スロット」を設ける**。

```jsonc
// enemy-stg-interceptor.json
"palette": {
  "M": "@main",      // 実行時に hazard.color を差し込む
  "S": "@shade",     // 実行時に _shade(hazard.color, -N) を差し込む
  "C": "#88ddff"     // 固定色（コックピット）
}
```

`SpriteRenderer` は `@` 始まりのキーを実行時に解決し、
**解決後の色ごとに焼き込み結果をキャッシュする**（色の種類は数種しかないため妥当）。
これにより `_shade()` ヘルパーはそのまま活きる。

### 4. HP バー（`_drawHpBar`）

既にセグメント化されているため、座標のスナップと角丸の除去のみ。
**HP の計算式・表示条件（`hp/maxHp`）には触れない。**

### 5. 前景（`drawForeground`）

| 要素 | 変更 |
|---|---|
| スキャンライン | **現状維持。** 1px の横縞であり既にドット絵と親和的。座標のスナップのみ |
| ビネット | `03-BasePlugin.md` 4. と同じ。`px.bandRadial()` で段階化（既定・D7） |
| HUD ブラケット | 線を `px.line()` に置換。角の丸みを除去 |

### 6. 変更しないもの

- `skyColors` / `groundColors` / `starColor` / `palette` の**色の値**
- `spawnTable` / `spawnDensity`（ゲームプレイに直結）
- `drawHazard` が `world.rules.features` と `hazard.hp` を読む**分岐条件**
- `drawHazard` の戻り値 `true`（既定描画スキップの契約）

## 実際に行った作業内容（実装後に追記）

2026-08-23、P3 として実装完了。

- 太陽・惑星の放射グラデーション → `px.bandRadial`。星雲 → `px.dither`（既定の D8 を採用）。
  瞬く星 → `px.rect` + `px.withAlpha`。惑星リングは本体より先に描き、本体の `bandRadial` で
  中央を隠すことで左右にはみ出すリングに見せる簡略化を行った
- 自機・敵2種（インターセプター/ガンシップ）をスプライト化
  （`player_stg.json` / `enemy_stg_interceptor.json` / `enemy_stg_gunship.json`、
  いずれも新規カプセル/多角形ベースの生成ツールキットで作成）。
  敵2種は仕様通り動的色スロット（`@main`/`@shade`/`@light`、ガンシップのみ `@glow` も追加）
  を使用し `hazard.color` 由来の色をランタイムで差し込む
- **エンジン炎・スラスター・発光コアはスプライトに含めず、別プリミティブとして残した。**
  理由: これらはエンティティの当たり判定ボックス（`w×h`）の外側まではみ出して描画される
  （例: 自機の炎は `x < 0` まで伸びる）ため、ボックス内に焼き込むスプライトでは表現できない。
  `03-BasePlugin.md` でプレイヤーの影を同じ理由でスプライト外に残した方針を踏襲した。
  炎の明滅は `runCycle`（自機）/ `hazard.pulse`（敵）を使った2値の点滅に単純化し
  （`FLAME_FLICKER_RATE` で頻度を調整、新しい状態は追加していない）、
  発光コアのグローは `px.halo` に置換した
- HP バー: `ctx.fillRect` → `px.rect`（角丸は元々使用していなかったため変更なし）
- 前景: 光条 → `px.line`、走査線 → `px.rect`（座標スナップのみ）、
  ビネット → `px.bandRadial`、HUDブラケット・目盛り → `px.line`
- `drawHazard` の分岐条件（`enemy_hp` / `hazard.hp`）・戻り値 `true`・`spawnTable` は無変更

検証結果: `typecheck` ✅ / `lint` ✅ / `build` ✅ / `validate`（116 passed、新規スプライト3件含む）✅。
ブラウザで `StgPlugin` を動的importし、`drawFarLayer`/`drawMidLayer`/`drawPlayer`/
`drawHazard`（diamond・rect 両形状、fake `MutableWorld` で `enemy_hp` 有効時のHPバー込み）/
`drawForeground` を実行しコンソールエラー無し。スプライト3種は個別に PNG レンダリングして
目視確認済み（動的色スロットの解決も含む）。

## 懸念点・確認事項

1. **動的色スロット（上記 3.）**: `00-rendering-system.md` §5 の
   「動的色スロット」および同節の `SpriteDrawOptions.slots` として**追記済み**。
   キャッシュキー・上限・未解決スロットの扱いもそちらで確定させた。
2. **ファイルサイズ**: 473 行あり、`CLAUDE.md` の「300 行超で分割検討」に該当する。
   スプライト化により手続き的な描画コードが JSON へ移るため**行数は減る見込み**。
   減らなければ `_drawInterceptor` / `_drawGunship` の分離を検討する。
3. `stg` テーマは `arena` / `bullet_hell` / `hack_slash` / `bullet_runner` /
   `aerial_stg` の `theme` 値でもあるが、これは **DOM 側の UI テーマ**であり
   canvas 描画には影響しない（`genres.json` の `themeColors` は CSS 専用）。
   したがって本ファイルの変更が他ジャンルの canvas に波及することはない。
