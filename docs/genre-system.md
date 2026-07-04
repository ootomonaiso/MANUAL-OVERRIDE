# ジャンルシステム

## 概要

プレイヤーが説明書の2択を選ぶたびに **GenreParams** が蓄積し、閾値を超えたジャンルへ収束する。ジャンルはゲームの外見・スポーンテーブル・有効フィーチャー・スコア式をすべて切り替える。

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

## 収束アルゴリズム（ベイズ方式）

選択のたびに `genreParams` の累積値から各ジャンルの**事後確率**を計算し、
確率が十分に偏ったところでジャンルが確定する（`src/domain/genreResolver.ts`）。

1. **尤度計算**: 各ジャンルについて、閾値に対する不足量の合計を deviation とし、
   `L = exp(-decayRate × deviation)` を計算する。閾値を超過した軸はペナルティなし。
   `base` ジャンルだけは総累積量に応じて尤度が減衰する（選択が進むほど base に留まりにくくなる）
2. **正規化**: 全ジャンルの尤度を合計 1 になるよう正規化 → 事後確率
3. **収束判定**: 最尤ジャンルが `minProb` 以上、かつ2位の `dominanceRatio` 倍以上なら確定。
   `MAX_ROUNDS` に達したら最尤ジャンルで強制確定

ハイパーパラメータは `src/data/config/bayes.json` で調整できる:

| キー | 意味 |
|---|---|
| `minProb` | 収束に必要な最小事後確率 |
| `dominanceRatio` | 2位をどれだけ引き離す必要があるか |
| `decayRate` | 閾値からの乖離ペナルティの強さ（大きいほど選択の影響が強い） |
| `baseDecay` | base の尤度が累積量とともに減衰する速さ |

**閾値設計の目安**（1枚のカードは1軸あたり 1〜3 加算。`genre_params.json` の `thresholdGuide`）:
1軸のみなら `5` 前後、2軸なら各 `3` 前後、3軸なら各 `2` 前後。

### paramMultiplier

`Choice.paramMultiplier` で特定の選択の重みを変えられる。

```json
{ "genreParams": { "tempo": 2 }, "paramMultiplier": 1.5 }
// → 実際の加算値: tempo += 2 * 1.5 = 3
```

---

## 全ジャンル一覧（22 種）

### コアジャンル（プラグイン実装済み）

| ID | ラベル | 閾値 | 有効フィーチャー | スコア式 |
|---|---|---|---|---|
| `base` | チュートリアル | ─ | ─ | ─ |
| `runner` | エンドレスランナー | tempo≥7 | auto_run, double_jump, long_air | `distance*1.2 + survivedSec*8 + combo*50` |
| `stg` | シューティング | range≥4, enemy≥4 | shoot, three_way, enemy_hp | `kills*120 + distance*0.5 + combo*80` |
| `rpg` | RPG | growth≥6 | hp, exp, item_pickup, slow_precise | `exp*2 + kills*60 + distance*0.3` |
| `puzzle` | パズル | combo≥5 | grid_stop, puzzle_solve | `combo*200 + survivedSec*3` |
| `rhythm` | リズム | tempo≥5, rhythm≥5 | beat_hazard, just_input, beat_dash | `beatHits*150 + combo*100 + distance*0.4` |

### 追加ジャンル（定義済み・プラグイン順次実装）

| ID | ラベル | 閾値 | スコア式の重点 |
|---|---|---|---|
| `aerial_stg` | 縦スクロールSTG | vertical≥3, range≥3, enemy≥3 | kills + combo + survivedSec |
| `bullet_hell` | 弾幕シューティング | vertical≥3, enemy≥5 | kills + combo + accuracy |
| `survival` | サバイバル | survive≥5, growth≥4 | survivedSec + itemsCollected |
| `stealth_action` | ステルスアクション | stealth≥5 | stealthBonus + survivedSec |
| `racing` | レーシング | speed≥5, tempo≥4 | distance + survivedSec |
| `platformer` | プラットフォームアクション | aerial≥4, combo≥4 | combo + distance |
| `dungeon` | ダンジョン探索 | growth≥4, craft≥3 | exp + kills + itemsCollected |
| `tower_def` | タワーディフェンス | craft≥4, enemy≥4 | kills + combo + survivedSec |
| `sports` | スポーツ | speed≥4, rhythm≥4 | combo + distance + beatHits |
| `idle` | 放置ゲーム | craft≥6 | itemsCollected + exp + survivedSec |
| `bullet_runner` | 弾幕ランナー | tempo≥5, enemy≥4 | kills + distance + combo |
| `arena` | アリーナバトル | enemy≥5, combo≥3 | kills + bossKills + combo |
| `aquatic` | 水中アドベンチャー | vertical≥3, aerial≥3, survive≥4 | distance + itemsCollected + survivedSec |
| `horror` | サバイバルホラー | survive≥5, stealth≥3 | survivedSec + stealthBonus − deaths |
| `hack_slash` | ハックアンドスラッシュ | enemy≥4, combo≥4 | kills + maxCombo + exp + bossKills |
| `tetris` | テトリス | combo≥4, craft≥4 | combo + survivedSec（`scrollSpeed=0` のため distance は加算されない） |

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

## ジャンル定義の書き方（src/data/genres/&lt;id&gt;.json）

ジャンル定義は1ジャンル1ファイルで `src/data/genres/<id>.json` に置く。`import.meta.glob` で自動収集されるため、ファイルを追加するだけで登録される（`src/data/config/genres.json` はテーマカラー等の補助設定で、定義本体ではない）。

**必須は `id` / `label` / `thresholds` の3つだけ**。残りはロード時にデフォルト補完される
（`normalizeGenreDef`）。`$schema` を付けるとエディタで自動補完・検証が効く。

```json
// 最小の例: src/data/genres/my_genre.json
{
  "$schema": "../../../schemas/genre.schema.json",
  "id": "my_genre",
  "label": "私のジャンル",
  "thresholds": { "tempo": 3, "speed": 3 }
}
```

省略時のデフォルト:

| フィールド | デフォルト |
|---|---|
| `enableFeatures` / `disableFeatures` | `[]` |
| `scoreFormula` | `"distance * 1.0 + survivedSec * 5"` |
| `manualReveal` | `これは<label>になりました。` |
| `theme` | `"plain"` |
| `bgColor` | `"#1a1a2e"` |
| `environment` / `scrollDirection` / `gravity` | `ground` / `horizontal` / `1600`（ruleEngine 側の既定値） |

フル指定の例は既存の `src/data/genres/stg.json` などを参照。

> **注:** `GenreId` は `string` 型のため、型定義の修正は不要です。
> 収束判定は `thresholds`（軸パラメータの閾値）をベイズ尤度計算の基準点として行われます。

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
| `runner` | スピード・白黒赤・Impact体 |
| `stealth` | 極暗・低コントラスト |
| `racing` | チェッカー・オレンジ |
| `platformer` | 空色・黄色アクセント・丸み |
| `dungeon` | 松明橙・ダークファンタジー |
| `hack_slash` | 深紅・高コントラスト |
| `survival` | 苔緑・アース・荒廃感 |
| `tetris` | ブロック風・グリッド背景 |

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
