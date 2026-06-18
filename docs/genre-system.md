# ジャンルシステム

## 概要

プレイヤーが説明書の2択を選ぶたびに **GenreParams** が蓄積し、ベイズ事後確率でジャンルへ収束する。ジャンルはゲームの外見・スポーンテーブル・有効フィーチャー・スコア式をすべて切り替える。

---

## GenreParam（12 軸）

| パラメータ | 略称 | 意味 | 主に収束するジャンル |
|---|---|---|---|
| `tempo` | テンポ | スピード感・スクロール加速 | runner, rhythm, racing, bullet_runner |
| `range` | 射程 | 遠距離攻撃・射程重視 | stg, aerial_stg |
| `enemy` | 敵密度 | 戦闘激化・ザコ敵の多さ | stg, bullet_hell, arena, hack_slash |
| `combo` | コンボ | 連続成功評価 | puzzle, platformer, arena, hack_slash |
| `growth` | 育成 | 経験値・レベルアップ要素 | rpg, dungeon, survival |
| `rhythm` | リズム | タイミング精度要求 | rhythm, sports |
| `stealth` | 隠密 | 接触回避・見つからない | stealth_action, horror |
| `vertical` | 縦移動 | 縦スクロール指向 | aerial_stg, bullet_hell, aquatic |
| `aerial` | 空中 | 空中滞在・プラットフォーム | platformer, aquatic |
| `survive` | 耐久 | 生存優先・タフネス | survival, aquatic, horror |
| `craft` | 作成 | 設置・積み上げ・放置 | tower_def, idle |
| `speed` | 速度 | ダッシュ・純粋スピード | racing, sports |

---

## ベイズ収束アルゴリズム

従来の「閾値超過」方式に代わり、ベイズ事後確率による確率的収束を採用しています。

### 尤度の計算

各ジャンル G に対して、累積パラメータ `accumulated` とジャンルの期待中心 `thresholds` の偏差から尤度を計算します:

```typescript
// genreResolver.ts
function computeBayesianPosteriors(
  accumulated: GenreParams,
  genres: GenreDef[],
  config: BayesConfig,
): Record<GenreId, number> {
  // 各ジャンルの尤度を計算
  for (const genre of genres) {
    const entries = Object.entries(genre.thresholds)
    if (entries.length === 0) {
      // base: 累積総和に応じて減衰
      const total = Object.values(accumulated).reduce((s, v) => s + v, 0)
      unnormalized[genre.id] = Math.exp(-config.baseDecay * total)
    } else {
      // 各軸の偏差の合計
      let deviation = 0
      for (const [axis, thresholdVal] of entries) {
        deviation += Math.abs((accumulated[axis] ?? 0) - thresholdVal)
      }
      unnormalized[genre.id] = Math.exp(-config.decayRate * deviation)
    }
  }

  // 正規化（合計 1.0）
  const sum = genreIds.reduce((acc, id) => acc + unnormalized[id], 0)
  for (const id of genreIds) {
    posteriors[id] = unnormalized[id] / sum
  }
  return posteriors
}
```

### 収束判定

事後確率が `convergenceThreshold`（デフォルト 50%）を超えたジャンルが収束します:

```typescript
for (const [id, prob] of Object.entries(posteriors)) {
  if (id === 'base') continue
  if (prob >= config.convergenceThreshold) {
    // 最高確率のジャンルが収束先
    converged = true
    convergedGenre = id
  }
}
```

### ハイパーパラメータ（BayesConfig）

| パラメータ | デフォルト | 説明 |
|---|---|---|
| `convergenceThreshold` | 0.50 | 事後確率がこの値を超えるとジャンル確定 |
| `decayRate` | 0.4 | 偏差に対する尤度減衰率（大きいほど分布が尖る） |
| `baseDecay` | 0.3 | 累積パラメータ増大に伴う base 減衰率 |
| `candidateThreshold` | 0.1 | 「◯◯にもできた」表示の候補閾値 |

### paramMultiplier

`Choice.paramMultiplier` で特定の選択の重みを変えられる。

```json
{ "genreParams": { "tempo": 2 }, "paramMultiplier": 1.5 }
// → 実際の加算値: tempo += 2 * 1.5 = 3
```

---

## 全ジャンル一覧（21 種）

### コアジャンル（プラグイン実装済み）

| ID | ラベル | 期待中心 | 有効フィーチャー | スコア式 |
|---|---|---|---|---|
| `base` | チュートリアル | ─ | ─ | ─ |
| `runner` | エンドレスランナー | tempo=7 | auto_run, double_jump, long_air | `distance*1.2 + survivedSec*8 + combo*50` |
| `stg` | シューティング | range=5, enemy=5 | shoot, three_way, enemy_hp | `kills*120 + distance*0.5 + combo*80` |
| `rpg` | RPG | growth=6 | hp, exp, item_pickup, slow_precise | `exp*2 + kills*60 + distance*0.3` |
| `puzzle` | パズル | combo=5 | grid_stop, puzzle_solve | `combo*200 + survivedSec*3` |
| `rhythm` | リズム | tempo=4, rhythm=4 | beat_hazard, just_input, beat_dash | `beatHits*150 + combo*100 + distance*0.4` |

### 追加ジャンル（定義済み・プラグイン順次実装）

| ID | ラベル | 期待中心 | スコア式の重点 |
|---|---|---|---|
| `aerial_stg` | 縦スクロールSTG | vertical=4, range=4, enemy=4 | kills + combo + survivedSec |
| `bullet_hell` | 弾幕シューティング | vertical=3, enemy=5 | kills + combo + accuracy |
| `survival` | サバイバル | survive=4, growth=3 | survivedSec + itemsCollected |
| `stealth_action` | ステルスアクション | stealth=4 | stealthBonus + survivedSec |
| `racing` | レーシング | speed=4, tempo=3 | distance + survivedSec |
| `platformer` | プラットフォームアクション | aerial=3, combo=3 | combo + distance |
| `dungeon` | ダンジョン探索 | growth=5, craft=2 | exp + kills + itemsCollected |
| `tower_def` | タワーディフェンス | craft=5, enemy=3 | kills + combo + survivedSec |
| `sports` | スポーツ | speed=3, rhythm=3 | combo + distance + beatHits |
| `idle` | 放置ゲーム | craft=4 | itemsCollected + exp + survivedSec |
| `bullet_runner` | 弾幕ランナー | tempo=6, enemy=5 | kills + distance + combo |
| `arena` | アリーナバトル | enemy=5, combo=4 | kills + bossKills + combo |
| `aquatic` | 水中アドベンチャー | vertical=2, aerial=2, survive=3 | distance + itemsCollected + survivedSec |
| `horror` | サバイバルホラー | survive=5, stealth=3 | survivedSec + stealthBonus − deaths |
| `hack_slash` | ハックアンドスラッシュ | enemy=4, combo=5 | kills + maxCombo + exp + bossKills |

---

## スコア式で使える変数（ScoreVars）

| 変数 | 意味 |
|---|---|
| `distance` | 走行距離 px |
| `kills` | 撃破数 |
| `combo` | 現在コンボ数 |
| `maxCombo` | セッション最大コンボ |
| `exp` | 累積 EXP |
| `beatHits` | ジャスト入力成功数 |
| `survivedSec` | 生存時間（秒） |
| `accuracy` | 命中率 0〜1 |
| `deaths` | 死亡回数 |
| `itemsCollected` | アイテム収集総数 |
| `bossKills` | ボス撃破数 |
| `stealthBonus` | 隠密継続フレーム数 |
| `colorTouches` | 安全色に触れた回数 |

---

## ジャンル定義の書き方（genres.ts）

```typescript
// src/data/genres.ts の GENRES[] に追加
{
  id: 'my_genre',                     // GenreId に登録が必要
  label: '私のジャンル',
  thresholds: { tempo: 3, speed: 3 }, // 期待パラメータの中心（複数軸で AND 条件）
  enableFeatures: ['auto_run', 'dash'],
  disableFeatures: ['grid_stop'],
  scoreFormula: 'distance * 2 + combo * 100',
  manualReveal: 'ゲームが変わりました。',
  endingFlavor: 'あなたは最後まで走った。',
  theme: 'plain',
  bgColor: '#001020',
  environment: 'sky',           // 省略可（デフォルト: 'ground'）
  scrollDirection: 'horizontal', // 省略可（デフォルト: 'horizontal'）
}
```

### thresholds の意味の変化

従来の方式では `thresholds` は「超えるべき最低値」でしたが、ベイズ方式では**「期待パラメータの中心」**として解釈されます。累積値がこの中心に近ければ近いほど事後確率が高くなり、50%を超えると収束します。

複数の軸を持つジャンルは、各軸の偏差の合計で評価されます。各軸の偏差を小さくするほど尤度が高くなります。

### theme 一覧

| 値 | 説明書UIの外見 |
|---|---|
| `plain` | 白背景・黒文字（デフォルト） |
| `stg` | ドット文字・SFフォント・暗黒背景 |
| `rpg` | 明朝体・羊皮紙風・枠線 |
| `puzzle` | モノスペース・グリッド罫線 |
| `rhythm` | ネオン風・カラフル |
| `horror` | 崩れた文字・暗黒 |
| `aquatic` | 波紋・青緑 |

### environment 一覧

| 値 | 背景・スポーンへの影響 |
|---|---|
| `ground` | 地上（デフォルト） |
| `sky` | 空・雲 |
| `space` | 宇宙・星フィールド |
| `ocean` | 水中 |
| `dungeon` | ダンジョン・暗闇 |
| `forest` | 森 |
| `city` | 都市・ビル群 |
