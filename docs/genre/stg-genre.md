# STGジャンル実装ドキュメント

## 概要

MANUAL-OVERRIDEゲームにおける `stg`（シューティングゲーム）ジャンルの実装をまとめる。
横スクロールアクションの原点（`base`）から、説明書の選択を積み重ねることで「横スクロールの流れを保ったまま敵を撃ち落とす横スクロールシューティング」へと変貌する。

横スクロールの面影（右から迫る障害物・自動スクロール）を残しつつ、重力をなくして自機を上下左右に自由移動させ、射撃で敵を破壊する点が特徴。

## アーキテクチャ

### ファイル構成

```
src/
├── data/
│   ├── genres/stg.json              # ジャンル定義（閾値・フィーチャー・操作・スコア式）
│   ├── config/shoot.json            # 射撃システムのチューニング値（弾速・連射間隔・スコア）
│   └── manuals/action-branch.json   # STGへ至る分岐（8.0-a-stg エントリ）
├── genres/
│   └── StgPlugin.ts                 # 視覚テーマ（宇宙背景・宇宙船・敵描画・前景装飾・敵配置テーブル）
├── game/
│   ├── systems/ShootFeature.ts      # 射撃ロジック（弾の発射・移動・衝突・コンボ）
│   └── sideScroller.ts              # _updateHorizontal で gravity===0 時の上下移動を処理
└── domain/types.ts                  # ManualTheme / FeatureId 型定義
```

## ジャンル定義（stg.json）

| 項目              | 値                                          |
| ----------------- | ------------------------------------------- |
| `id`              | `stg`                                       |
| `label`           | シューティングゲーム                        |
| `thresholds`      | `range: 5`, `enemy: 5`                      |
| `enableFeatures`  | `shoot`, `three_way`, `enemy_hp`            |
| `disableFeatures` | `grid_stop`, `puzzle_solve`                 |
| `scoreFormula`    | `kills * 120 + distance * 0.5 + combo * 80` |
| `theme`           | `stg`                                       |
| `bgColor`         | `#0d0d1a`                                   |
| `environment`     | `space`                                     |
| `gravity`         | `0`（重力なし）                             |

### 操作方法

| キー  | 動作                                       |
| ----- | ------------------------------------------ |
| ← →   | 左右移動                                   |
| ↑ ↓   | 上下移動（重力なしのため自由移動）         |
| Z     | 前方（右）へ射撃                           |
| Space | ジャンプ（`gravity === 0` のため実質無効） |

## ジャンル収束条件

`range`（射程・遠距離性）と `enemy`（敵対要素）の累積パラメータが両方とも閾値を超えるとSTGへ収束する。

| パラメータ | 閾値  |
| ---------- | ----- |
| `range`    | 5以上 |
| `enemy`    | 5以上 |

ベイズ収束方式（主方式）では、各軸の閾値との乖離量から尤度を計算し事後確率で確定する。
`range` と `enemy` の両軸を高めに押し上げる選択（「障害物を撃って倒せるようにする」など遠距離・敵対方向のカード）を重ねることでSTGに到達する。

### 収束パス

`action-branch.json` の分岐木から `8.0-a-stg` エントリでSTGが確定する。
派生として、縦スクロール版の `aerial_stg`・弾幕の `bullet_hell` など近縁ジャンルも同じ分岐近傍から分岐する。

## ゲーム仕様

### 自機の移動（重力なし横スクロール）

- `gravity === 0` のとき、`sideScroller.ts` の `_updateHorizontal` がジャンプ・重力処理を完全にスキップする
- `moveUp` / `moveDown` キー入力で `y` 座標を直接動かす（速度は `PLAYER_PHYSICS.runSpeed` を流用）
- プレイヤーは画面外に出ないようクランプされる（`0 ≤ p.y ≤ gY - p.h`）
- 横方向は通常の横スクロール挙動（自動スクロール・左右移動）を維持

### 敵の出現（spawnTable）

`StgPlugin` の `spawnTable` は地面（ground）を持たず、空中（air）・浮遊（float）中心で構成される。

| 形状    | 配置  | weightStart → weightEnd | 備考                   |
| ------- | ----- | ----------------------- | ---------------------- |
| diamond | float | 3 → 6                   | 上下振幅 60〜130       |
| rect    | air   | 2 → 5                   |                        |
| diamond | float | 1 → 5                   | 振幅 90〜170・脈動速め |
| rect    | float | 0 → 4                   | 振幅 40〜110           |

`weightStart` 低め・`weightEnd` 高めにすることで、距離が進むほど敵の密度が増す難易度曲線を形成する。
float エントリは `floatAmpRange` を広めに取り、敵が上下に揺れながら迫る。

### 射撃システム（ShootFeature）

`ShootFeature` は `shoot` / `three_way` / `enemy_hp` などのフィーチャーを担当する。STGでは3つすべてが有効。

- **射撃**: Zキー（`rules.controls.shoot`、既定 `z`）で前方へ弾を発射。連射間隔は `shoot.json` の `shotCooldown`（0.18秒）
- **3-way（three_way）**: 弾が前方＋斜め上下の3方向に拡散（`threeWaySpeedRatio` / `threeWayYRatio` で角度調整）
- **敵HP（enemy_hp）**: 敵が `hp` を持ち、弾が当たるたびに減少。0でキル成立
- **1弾1ヒット**: 貫通なし。1発の弾は最初に当たった敵1体のみに作用
- **画面外カリング**: ビューポート外（横スクロール時は左右 ±100px）に出た弾は除去

### スコア・コンボ

- 1キルあたり `baseScorePerKill(200) × combo` を加算。連続キルでコンボ倍率が伸びる
- `comboTimer`（`comboResetTime` = 3.0秒）以内に次のキルがないとコンボは0にリセット
- スコアポップアップを自機右上に表示
- 最終スコア式（`scoreFormula`）: `kills * 120 + distance * 0.5 + combo * 80`

### shoot.json の主なチューニング値

| キー                           | 値     | 内容                 |
| ------------------------------ | ------ | -------------------- |
| `bulletSpeed`                  | 900    | 弾速                 |
| `bulletWidth` / `bulletHeight` | 14 / 5 | 弾サイズ             |
| `shotCooldown`                 | 0.18   | 連射間隔（秒）       |
| `comboResetTime`               | 3.0    | コンボ維持時間（秒） |
| `baseScorePerKill`             | 200    | キルあたり基礎点     |
| `threeWaySpeedRatio`           | 0.8    | 3-way拡散弾の速度比  |
| `threeWayYRatio`               | 0.6    | 3-way拡散弾のY方向比 |

## ビジュアル方針（StgPlugin）

- **背景**: 宇宙空間。遠景レイヤーに恒星（巨大グロー＋本体）・星雲（複数色をゆっくり流す）・明滅する明るい星、中景レイヤーに惑星（セクターごとに決定的配置・一部はリング付き）を描画
- **自機**: 横向きの宇宙戦闘艇。前方に尖った楔形の機体、後部ウィング、発光コックピット、上下2基のエンジン炎（ランダム揺らぎ）
- **敵（`drawHazard` で独自描画）**: デフォルトの単純図形を上書きし、メカニカルなユニットとして描き分ける
  - `diamond` 形状 → **エイリアン戦闘機（interceptor）**: 左に尖った六角ハル、湾曲した上下ウィング、パネルライン、脈動する発光コア（単眼）、後方エンジン炎
  - `rect` 形状 → **装甲砲艦（gunship）**: 角丸の装甲ボディ、左前方に突き出す主砲バレル（砲口発光）、横パネルライン、明滅するセンサーライト3基、中央センサーアイ、後方スラスター炎2基
  - `enemy_hp` 有効時は HP をセグメント式の小型バーで表示（残量で緑→橙に変化）
  - 色は `hazard.color` / `hazard.glowColor` を流用するため、safe（青）/ danger（橙）の識別性は保持
- **前景装飾（`drawForeground`）**: ワールド描画の手前（プレイヤーの後・shake 変換内）に SF 装飾を重ねる
  - コックピット風 HUD: 四隅のブラケット＋上端のスキャナー目盛り（シアン）
  - CRT 風の薄い走査線
  - 画面四隅を落とすビネット
  - 手前を高速で流れる光条（スペースダスト、`offsetX` パララックス）
- **エフェクト色（particleColors）**: ヒット `#88ffff`、死亡は青〜白〜紫系のSFパレット
- **テーマ**: 暗色背景（`bgColor: #0d0d1a`）＋シアン系の発光で統一

### 描画フックの委譲（エンジン連携）

`sideScroller.ts` のレンダラがジャンルプラグインの描画フックに委譲する:

- `_drawHazard` は描画開始時に `plugin.drawHazard(ctx, hazard, sx, world)` を呼び、`true` が返るとデフォルトのハザード描画をスキップする（StgPlugin はここで独自の敵を描く）
- `_render` はプレイヤー描画の直後に `plugin.drawForeground(ctx, cameraX, W, H, gY)` を呼び、画面装飾を重ねる

## 実装上の注意点

1. 重力ゼロ挙動は `sideScroller.ts` の `_updateHorizontal` 内に閉じており、通常の横スクロール・縦スクロール挙動には影響しない
2. `ShootFeature` は弾の状態を内部に保持し、`onInit` / `onManualUpdated` でリセットする
3. 射撃方向はスクロール軸（`scrollAxis`）で分岐し、横スクロール時は右方向、縦スクロール時は上方向へ発射する（`aerial_stg` 等と共有）
4. 敵に触れると即死（既存の `_onPlayerHit` → `_die` フローをそのまま使用）
5. `world.bullets` は FeatureSystem 間共有のため `_syncWorldStats` で毎フレーム同期される

## 関連ジャンル

`ShootFeature` と射撃インフラは以下の近縁ジャンルでも共有される。

- `aerial_stg`: 縦スクロール版シューティング（弾は上方向）
- `bullet_hell`: 弾幕回避
- `bullet_runner`: 弾を避けながら走る
- `arena`: 複数敵同時撃破

## 今後の改善候補

- 移動速度の変更
  - 現在、コード上にフックが無いらしいんで断念しました。近いうちにやるかも？
- アイテムの追加
- チャージショット（`charge_shot`）・拡散ショット（`spread_shot`）・ボム（`bomb`）の本格運用
- ボス戦の導入（`boss.json` 連携）
- 弾の貫通・連鎖などの上位フィーチャー
- スコア式の `distance` 項の重み調整（横スクロール継続による稼ぎ要素）
