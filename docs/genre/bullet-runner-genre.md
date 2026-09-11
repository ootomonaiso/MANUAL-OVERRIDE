# 弾幕ランナージャンル実装ドキュメント

## 概要

`bullet_runner`（弾幕ランナー）は、ネオンのサイバーシティを自動走行しながら敵を撃ち抜くジャンル。
コアフィーチャー（`auto_run` / `shoot` / `enemy_hp`）と視覚テーマ（`BulletRunnerPlugin`：ネオン都市の夜）は
既存の実装として提供されており、本ドキュメントで記録する追加は **ジャンル固有の敵HPバー**
（`drawGenreHUD` による緑/黄/赤3色バー）とそれに対するユニットテストである。

## アーキテクチャ

### ファイル構成

```
src/
├── data/
│   └── genres/bullet_runner.json   # ジャンル定義（収束閾値・features・スコア式・controls）
├── engine/
│   └── GenrePlugin.ts              # drawsOwnHpBar フラグ追加（二重描画抑制用）
├── genres/
│   └── BulletRunnerPlugin.ts       # 視覚テーマ。drawGenreHUD（敵HPバー）を追加
├── game/
│   └── sideScroller.ts             # _drawHazard に !pluginH.drawsOwnHpBar 条件追加
tests/
└── unit/genres/
    └── BulletRunnerPlugin.test.ts  # プラグインの id/palette/spawnTable と drawGenreHUD の検証
docs/genre/
├── bullet-runner-genre.md          # 本ドキュメント
└── README.md                       # 索引に bullet_runner 行を追加
```

変更しない関連モジュール:

| モジュール | 役割 |
|-----------|------|
| `src/engine/GenrePluginBase.ts` | `drawGenreHUD` の no-op デフォルトを提供（サブクラスが上書き） |
| `src/game/render/PixelCanvas.ts` | ピクセルアート描画プリミティブ。矩形は 4px グリッドへスナップ |

## ジャンル収束条件

| パラメータ | 閾値 |
|-----------|------|
| `tempo`   | 7以上 |
| `enemy`   | 6以上 |

主方式はベイズ収束（`src/domain/genreResolver.ts`）。各軸の不足分
`deviation = max(0, threshold − accumulated)` を合計し `L = exp(−decayRate × deviation)`
（超過軸はペナルティなし）として尤度を算出。最尤ジャンルが `minProb` 以上かつ
2位を `dominanceRatio` 倍以上引き離した場合に収束する（ハイパーパラメータは
`src/data/config/bayes.json`）。`genreParams` 軸方式・`genrePoints` 直接方式も後方互換で併用。

### 説明書分岐

`src/data/manuals/flow-branch.json`（ver 1.0 で「キャラクターの動きをなめらかにする」を選択した
速度・空中・音楽分岐）が `runner / bullet_runner / rhythm / platformer` の4ジャンルへ収束する経路を
保持する。`starter-cards.json` / `expansion-cards.json` にも `genreAffinity: ["bullet_runner", ...]`
を持つカードが存在する。

## ゲーム仕様

### コアフィーチャー

| フィーチャー | 実装 | 効果 |
|-------------|------|------|
| `auto_run`  | `MovementFeature` | 右方向へ自動走行（左キーで左移動に上書き。ジャンプは通常通り） |
| `shoot`     | `ShootFeature`    | 射撃キーで弾を発射。敵に当たると1ダメージ |
| `enemy_hp`  | `ShootFeature`    | 障害物が敵化。HP = `SPAWN.enemyHpAmount`（既定3）で3撃で撃破 |

### 操作方法（`bullet_runner.json` の `controls`）

| キー    | 動作   |
|---------|--------|
| Space   | ジャンプ |
| ← / →   | 左右移動（auto_run により常に右走行が基準） |
| z       | 射撃   |

### スコア計算

`scoreFormula`（`bullet_runner.json`）:

```
kills * 100 + distance * 1.5 + maxCombo * 60
```

auto_run により距離が常に伸びるため `distance` 項が効く（テトリス等のような
`scrollSpeed = 0` による無効化はなし）。

### 敵HPバー（`drawGenreHUD`、今回追加）

`enemy_hp` 有効時に HP を持つ敵（`maxHp > 1`）の頭上に描画されるバー。

| 項目 | 値 |
|------|-----|
| 描画対象 | `world.hazards` のうち `maxHp > 1` の全ハザード（safe 色も対象。エンジンの汎用バーと同一基準） |
| 位置 | ハザード上端（`h.rect.y`。浮遊振幅分を反映）より 8px 上。左端はハザードの左端と同一（`sx`）。幅はハザードと同一 |
| サイズ | 幅 = `h.w`、高さ 4px |
| 背景 | 全幅に `rgba(0,0,0,0.6)` |
| フィル | 幅 = `h.w × (h.hp / h.maxHp)`。端数処理は `PixelCanvas.rect` の内部スナップ（4px グリッド）に委ねる |
| フィル色 | 比率 > 0.6: `#44ff44`（緑） / 0.3〜0.6: `#ffff44`（黄） / < 0.3: `#ff4444`（赤） |
| 画面チェック | 画面Xが `[−50, W+50]` 外ならスキップ。縦スクロール時はY方向 `[−200, H+100]` もチェック |
| 座標変換 | `world.getHazardScreenX(h)`（横: `x − cameraX` / 縦: `x`） |

描画は `sideScroller.ts` のシェイク層内（`ctx.translate(shakeX, shakeY)` 済みコンテキストで）
に呼び出されるため、バーは敵と一緒に震える。

## テスト

### ユニットテスト（`tests/unit/genres/BulletRunnerPlugin.test.ts`）

`SurvivalPlugin.test.ts` の MockWorld パターンと `PixelCanvas.test.ts` の
fillRect 発行記録パターンを組み合わせる。

| # | テスト | 検証内容 |
|---|--------|----------|
| 1 | id | `'bullet_runner'` |
| 2 | palette | `danger` = `#ff2266` / `safe` = `#00ffcc`（glow 付き） |
| 3 | spawnTable | 4エントリ。shape/placement の構成（rect×2・diamond・spike） |
| 4 | drawsOwnHpBar | `true`（エンジン汎用バー抑制） |
| 5 | drawGenreHUD 空世界 | エラーなく描画（矩形発行0件） |
| 6 | drawGenreHUD 通常 | `maxHp > 1` の敵に背景・フィルの2矩形を発行。フィル幅 = `w × ratio`（グリッドスナップ込み） |
| 7 | drawGenreHUD 色閾値 | 比率 >0.6 緑 / 0.3〜0.6 黄 / <0.3 赤 |
| 8 | drawGenreHUD 一撃敵 | `maxHp <= 1` は描画しない |
| 9 | drawGenreHUD 画面外（左） | 横モードで `x − cameraX` が範囲外ならスキップ |
| 10 | drawGenreHUD 縦モード | `scrollAxis = 'y'` 時は `cameraX` を無視し `h.x` をそのまま使用 |
| 11 | drawGenreHUD 縦モード Y cull | Y 方向画面外（`< -200` / `> H+100`）ならスキップ |
| 12 | drawGenreHUD 浮遊ハザード | `rect.y`（振幅反映後）を基準にバーを置く |
| 13 | 閾値境界: 0.6 ちょうど | 黄（`> 0.6` なので緑にはならない） |
| 14 | 閾値境界: 0.3 ちょうど | 黄（`< 0.3` は厳密に小さい場合のみ赤） |
| 15 | hp=0 背景のみ | `hp: 0, maxHp: 3` で背景矩形発行・フィル矩形不发行 |
| 16 | 右端画面外 cull | `x: 3000`（screen x > W+50）で矩形発行0件 |
| 17 | 左端画面外 cull | `x − cameraX < -50` で矩形発行0件 |
| 18 | 0.6 ちょうどフィル幅 | `w=40, hp=6, maxHp=10` でフィル幅 24・色黄 |

## 実装上の注意点

1. **座標変換は `world.getHazardScreenX(h)` を使う。**
    仕様書上の `rules.scrollAxis === 'y' ? h.x : h.x − cameraX` と挙動は同一だが、
    `MutableWorld` がモード非依存ヘルパーを提供している（`MeleeKillFeature` /
    `NearMissComboFeature` / `SpecialFeature` / `SurvivalFeature` が同じく使用）。
    軸判定ロジックの重複を避け、横/縦モードの非対称な実装を1箇所（sideScroller）に集約するため。
2. **チューニング値はプラグインの private フィールドへ。**
    バーの高さ・オフセット・色閾値・画面外判定マージンは「実装固有の閾値」に該当するため、
    CLAUDE.md の規約に従い `src/data/config/*.json` ではなく `enemyHpBar` private フィールドとする
    （ゲームバランス値ではなく `starConfig` / `parallax` / `hazardConfig` と同パターン）。
3. **`maxHp > 1` のみで対象を絞る。**
   `enemy_hp` 未有効時は全ハザードの HP が 1 になる（sideScroller のスポーン処理）ため、
   フィーチャーフラグの明示チェックは不要。safe 色ハザードも対象に含まれる点は
   エンジンの汎用HPバー（`_drawHazard` 内）と揃えた基準。
4. **描画タイミングはシェイク層内。**
   `drawGenreHUD` は `_drawHazard` と同じ translate 済みコンテキストで呼ばれる
   （sideScroller.ts:952）。バーが敵とズレないための前提であり、
   画面固定レイヤー（`drawForeground`）側に移さないこと。

## 既知の問題・今後の改善候補

1. ~~**エンジンの汎用HPバーとの二重描画**~~ → **解決済み。**
   `GenrePlugin.drawsOwnHpBar` フラグを `true` に設定し、
   `sideScroller._drawHazard` の条件に `!pluginH.drawsOwnHpBar` を追加することで
   エンジンの汎用バーを抑制した。衝突の背景:
   `_drawHazard` は `enemy_hp` 有効かつ `maxHp > 1` のハザードに
   `HAZARD_VFX`（`hazard_vfx.json`: y−10 / 高さ5 / 緑`#00ff88`・赤`#ff4444` / 閾値0.5）で
   汎用バーを描画する。4px グリッドスナップ後、汎用バーは実効 8px 高（敵上端直上まで）になり、
   本バー（y−8 / 4px）と上半分が重なっていた。
    選択した解決策は (b)（`GenrePlugin` へのフラグ追加 + `_drawHazard` 条件変更、2ファイル）。
    `StgPlugin` / `AerialStgPlugin` は `drawHazard` を true で返すため汎用バー経路に到達せず、本フラグの影響を受けない。
2. safe 色ハザードへのバー表示の見直し（撃破不能ならバーは誤解を招く可能性）。
3. HPバーのネオングロー演出（`px.halo` 利用）の追加候補。
