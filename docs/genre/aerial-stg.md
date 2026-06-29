# Aerial STGジャンル実装ドキュメント

## 概要

MANUAL-OVERRIDEゲームにおける `aerial_stg`（縦スクロールシューティング）ジャンルの実装をまとめる。
横スクロールアクションの原点（`base`）から、説明書の選択を積み重ねることで「縦スクロールの空中戦シューティング」へと変貌する。

上空から見下ろした視点で雲海が下から流れ、上から迫る敵機・爆撃機・ミサイルを撃ち落とす。
STGが重力ゼロの横スクロールを維持するのに対して、aerial_stgはステージを縦方向に流し、プレイヤーが4方向自由に飛び回る点が特徴。

## アーキテクチャ

### ファイル構成

```
src/
├── data/
│   ├── genres/aerial_stg.json        # ジャンル定義（閾値・フィーチャー・操作・スコア式）
│   ├── config/shoot.json             # 射撃システムのチューニング値（弾速・連射間隔・スコア）
│   └── manuals/action-branch.json   # aerial_stgへ至る分岐（8.0-a-aerial-stg エントリ）
├── genres/
│   └── AerialStgPlugin.ts           # 視覚テーマ（空・雲・戦闘機・敵描画・前景HUD）
├── game/
│   ├── systems/ShootFeature.ts      # 射撃ロジック（弾の発射・移動・衝突・コンボ）
│   ├── systems/MovementFeature.ts   # 縦モード4方向移動（vertical_scroll フィーチャー）
│   └── sideScroller.ts              # _updateVertical で縦スクロール物理・衝突を処理
└── domain/types.ts                  # ManualTheme / FeatureId 型定義
```

## ジャンル定義（aerial_stg.json）

| 項目              | 値                                               |
| ----------------- | ------------------------------------------------ |
| `id`              | `aerial_stg`                                     |
| `label`           | 縦スクロールシューティング                       |
| `thresholds`      | `vertical: 4`, `range: 4`, `enemy: 4`            |
| `enableFeatures`  | `shoot`, `vertical_scroll`, `enemy_hp`, `spread_shot` |
| `disableFeatures` | `grid_stop`, `puzzle_solve`, `auto_run`          |
| `scoreFormula`    | `kills * 130 + combo * 90 + survivedSec * 3`    |
| `theme`           | `stg`                                            |
| `bgColor`         | `#000015`                                        |
| `environment`     | `sky`                                            |
| `scrollDirection` | `vertical`（`scrollAxis === 'y'` に変換される） |
| `gravity`         | `1600`（縦スクロールモードでは適用されない）     |

### 操作方法

| キー   | 動作                                         |
| ------ | -------------------------------------------- |
| ← →    | 左右移動                                     |
| ↑ ↓    | 上下移動（4方向自由飛行）                    |
| Z      | 上方向へ射撃（縦スクロール軸に沿って）       |
| Space  | ジャンプキーとして定義されるが実質無効       |

縦スクロールモードでは `MovementFeature.preUpdate` が `p.vx` / `p.vy` を4方向キー入力から決定する。`_updateVertical` で重力は適用されず、プレイヤーは純粋にキー入力に従って移動する。

## ジャンル収束条件

`vertical`（縦方向性）・`range`（射程・遠距離性）・`enemy`（敵対要素）の累積パラメータが揃って閾値を超えると aerial_stg へ収束する。

| パラメータ  | 閾値  |
| ----------- | ----- |
| `vertical`  | 4以上 |
| `range`     | 4以上 |
| `enemy`     | 4以上 |

ベイズ収束方式（主方式）では、3軸すべての乖離量から事後確率を計算して確定する。

### 収束パス

`action-branch.json` の分岐木では以下の経路でaerial_stgが確定する。

```
2.0-a  →「ステージのキャラクターをもっと活発に動かす」
3.0-a-fight  →「ステージを上下に移動できるようにする」（vertical/range/enemy各+1）
4.0-a-vertical  →「敵を撃つメカニズムを追加する」
5.0-a-vertical-shot  →「敵を次々と撃つ快感を優先する」（vertical/range/enemy各+1）
6.0-a-aerial  →「敵の波をすべて撃ち落とす」（range/enemy各+1, vertical+1）
7.0-a-aerial-waves  →  8.0-a-aerial-stg（確定）
```

他に `7.0-a-bullet-hell-dodge` / `7.0-a-bullet-hell-combat` / `7.0-a-bullet-hell-focus` からも `8.0-a-aerial-stg` へ到達できる。

## ゲーム仕様

### プレイヤーの移動（縦スクロール・4方向自由飛行）

- `scrollAxis === 'y'` のとき、`MovementFeature.preUpdate` が上下左右のキー入力を `p.vx` / `p.vy` にマッピングする
- `_updateVertical` で `p.x += p.vx * dt`、`p.y += p.vy * dt` としてそのまま適用（重力なし）
- プレイヤーは画面外に出ないようクランプされる（`0 ≤ p.x ≤ W - p.w`、`0 ≤ p.y ≤ H - p.h`）
- `vertical_scroll` フィーチャーが有効なとき `MovementFeature.update` でハザードに緩やかなX方向ドリフトが加わり、敵の動きに変化が出る

### 敵の出現（spawnTable）

縦スクロールモードでは全ハザードが画面上端からランダムなX位置に出現し、フレームごとに `h.y += speed * dt` で下降する。

| 形状    | placement | weightStart → weightEnd | サイズ        |
| ------- | --------- | ----------------------- | ------------- |
| diamond | air       | 2 → 6                   | 24-34 × 26-38 |
| rect    | air       | 1 → 4                   | 40-60 × 24-36 |
| pillar  | air       | 1 → 5                   | 12-18 × 40-64 |

`placement` は縦モードでは無視される。距離が伸びるほど `weightEnd` の比重が上がり、後半は敵密度が増す。

### 射撃システム（ShootFeature）

aerial_stgでは `shoot` / `spread_shot` / `enemy_hp` の3フィーチャーが有効。

- **射撃方向**: `scrollAxis === 'y'` のとき上方向（`vy = -bulletSpeed`）へ発射
- **発射位置**: プレイヤー中心 `(p.x + p.w / 2, p.y - bulletHeight)` から発射
- **拡散（spread_shot）**: `spread_shot` または `three_way` が有効なとき、正面＋左斜め＋右斜めの3方向へ拡散
  - 斜め弾速: `bulletSpeed × threeWaySpeedRatio (0.8)`
  - 斜めY成分: `bulletSpeed × threeWayYRatio (0.6)`
- **敵HP（enemy_hp）**: 敵が `hp` を持ち、弾が当たるたびに減少。0でキル成立
- **カリング**: Y方向 `< -100`、またはX方向が画面外 `(-100 〜 W+100)` に出た弾を除去

### スコア

| 項目          | 式                                             |
| ------------- | ---------------------------------------------- |
| スコア式      | `kills * 130 + combo * 90 + survivedSec * 3`  |
| キルごと基礎点 | `baseScorePerKill(200) × combo`               |
| コンボリセット | `comboResetTime(3.0)` 秒以内に次のキルがなければ0 |

横スクロール系（distance依存）と異なり、生存時間・コンボも大きくスコアに寄与する。

### shoot.json の主なチューニング値

| キー                           | 値    | 内容                 |
| ------------------------------ | ----- | -------------------- |
| `bulletSpeed`                  | 900   | 弾速                 |
| `bulletWidth` / `bulletHeight` | 14/5  | 弾の衝突矩形サイズ   |
| `shotCooldown`                 | 0.18  | 連射間隔（秒）       |
| `comboResetTime`               | 3.0   | コンボ維持時間（秒） |
| `baseScorePerKill`             | 200   | キルあたり基礎点     |
| `threeWaySpeedRatio`           | 0.8   | 拡散弾の速度比       |
| `threeWayYRatio`               | 0.6   | 拡散弾のX方向比      |

## ビジュアル方針（AerialStgPlugin）

- **背景（遠景 drawFarLayer）**: 深い夜空（`#0a1628`）→ 明るい青（`#1a4a7a`）のグラデーション + 薄い遠景雲。距離に比例してYスクロール（`parallax.far = 1.0`）
- **背景（中景 drawMidLayer）**: より大きな雲塊を `arc` の組み合わせで描画。遠景より1.5倍速くスクロール（`parallax.mid = 1.5`）。これにより奥行きの視差効果が生まれる
- **自機（drawPlayer）**: 俯瞰視点の近代戦闘機。機首を上に向けた形状。後退翼・尾翼・後方エンジン炎（ランダム揺らぎ）・発光キャノピーを持つ金属光沢のシルエット
- **敵（drawHazard で独自描画）**:
  - `diamond` → 敵戦闘機（interceptor）: 機首が下向きの赤みがかったシルエット、湾曲ウィング、単眼コア
  - `rect` → 爆撃機（bomber）: 横長の重装甲ボディ、4基のエンジン炎、前方機首
  - `pillar` → ミサイル（missile）: 細長い円筒、頭部に赤い弾頭、後方に炎
  - `enemy_hp` 有効時はセグメント式HPバーを敵の上方に表示
- **前景（drawForeground）**: ビネット（画面四隅を暗くする） + 緑色の四隅HUDブラケット
- **弾の描画（ShootFeature.render）**: 縦モードでは `4×8` の縦長矩形（黄色・グロー付き）
- **エフェクト色（particleColors）**: ヒット `#ffb08a`、死亡は赤〜橙〜黄〜白の炎パレット

### 描画フックの委譲（エンジン連携）

- `AerialStgPlugin.verticalBackgroundLayers = true` により、縦モードでも `drawFarLayer` / `drawMidLayer` が呼ばれる（`sideScroller._drawBackground` が判定）
- `drawHazard` が `true` を返すとデフォルトのハザード描画をスキップし、AerialStgPluginの独自描画を使う
- `drawForeground` は `ctx.restore()` の外（シェイクの影響を受けない）で呼ばれる

## 実装上の注意点

1. `gravity` フィールドは aerial_stg.json に設定されているが、`_updateVertical` ではプレイヤーへの重力適用を行わないため実質無効（`_updateHorizontal` 専用）
2. `spread_shot` は `ShootFeature.handles` に含まれるが、縦スクロール時の発射ロジック（`_spawnVerticalBullets`）で `three_way` と同等の3方向展開を行う
3. 斜め弾（spread_shot の左右成分）は画面外に出たときX方向カリングで除去される（Y方向だけでなくX方向境界も判定）
4. 弾の発射位置はプレイヤーの水平中心 `p.x + p.w / 2` から発射される
5. `vertical_scroll` フィーチャーのdrift処理（`MovementFeature.update`）はハザードの X 座標を毎フレーム微変動させるが、画面幅でクランプするため画面外へは出ない

## 関連ジャンル

射撃インフラ（ShootFeature）は以下の近縁ジャンルでも共有される。

- `stg`: 横スクロール版シューティング（弾は右方向）
- `bullet_hell`: 弾幕回避（aerial_stgの分岐近傍から派生）
- `bullet_runner`: 弾を避けながら走る
- `arena`: 複数敵同時撃破

## 今後の改善候補

- 敵の射撃（下方向へ弾を放つ反撃）
- フォーメーション出現（複数の敵が整列して降下）
- ボス戦の導入（`boss.json` 連携）
- 移動速度のジャンル別チューニング（現在は `PLAYER_PHYSICS.runSpeed` を流用）
- スコア式の `distance` 項追加（縦スクロール距離の評価）
