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

## 収束アルゴリズム

```typescript
// genreResolver.ts
function resolveGenre(params: GenreParams, genres: GenreDef[]): GenreId {
  // 1. 全閾値を満たすジャンルを候補に絞る
  const candidates = genres.filter(g =>
    Object.entries(g.thresholds).every(([k, v]) => (params[k] ?? 0) >= v)
  )
  if (candidates.length === 0) return 'base'

  // 2. 超過量の合計が最大のジャンルが確定
  return candidates.reduce((best, g) => {
    const overflow = Object.entries(g.thresholds)
      .reduce((s, [k, v]) => s + (params[k] ?? 0) - v, 0)
    return overflow > best.overflow ? { id: g.id, overflow } : best
  }, { id: 'base', overflow: -Infinity }).id
}
```

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
| `stg` | シューティング | range≥5, enemy≥5 | shoot, three_way, enemy_hp | `kills*120 + distance*0.5 + combo*80` |
| `rpg` | RPG | growth≥6 | hp, exp, item_pickup, slow_precise | `exp*2 + kills*60 + distance*0.3` |
| `puzzle` | パズル | combo≥5 | grid_stop, puzzle_solve | `combo*200 + survivedSec*3` |
| `rhythm` | リズム | tempo≥5, rhythm≥5 | beat_hazard, just_input, beat_dash | `beatHits*150 + combo*100 + distance*0.4` |

### 追加ジャンル（定義済み・プラグイン順次実装）

| ID | ラベル | 閾値 | スコア式の重点 |
|---|---|---|---|
| `aerial_stg` | 縦スクロールSTG | vertical≥4, range≥4, enemy≥4 | kills + combo + survivedSec |
| `bullet_hell` | 弾幕シューティング | vertical≥4, enemy≥6 | kills + combo + accuracy |
| `survival` | サバイバル | survive≥5, growth≥4 | survivedSec + itemsCollected |
| `stealth_action` | ステルスアクション | stealth≥5 | stealthBonus + survivedSec |
| `racing` | レーシング | speed≥5, tempo≥4 | distance + survivedSec |
| `platformer` | プラットフォームアクション | aerial≥4, combo≥4 | combo + distance |
| `dungeon` | ダンジョン探索 | growth≥6, craft≥3 | exp + kills + itemsCollected |
| `tower_def` | タワーディフェンス | craft≥6, enemy≥4 | kills + combo + survivedSec |
| `sports` | スポーツ | speed≥4, rhythm≥4 | combo + distance + beatHits |
| `idle` | 放置ゲーム | craft≥6 | itemsCollected + exp + survivedSec |
| `bullet_runner` | 弾幕ランナー | tempo≥6, enemy≥5 | kills + distance + combo |
| `arena` | アリーナバトル | enemy≥6, combo≥5 | kills + bossKills + combo |
| `aquatic` | 水中アドベンチャー | vertical≥3, aerial≥3, survive≥4 | distance + itemsCollected + survivedSec |
| `horror` | サバイバルホラー | survive≥6, stealth≥4 | survivedSec + stealthBonus − deaths |
| `hack_slash` | ハックアンドスラッシュ | enemy≥5, combo≥6 | kills + maxCombo + exp + bossKills |
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

```json
// 例: src/data/genres/my_genre.json
{
  "id": "my_genre",
  "label": "私のジャンル",
  "thresholds": { "tempo": 3, "speed": 3 },
  "threshold": 10,
  "enableFeatures": ["auto_run", "dash"],
  "disableFeatures": ["grid_stop"],
  "scoreFormula": "distance * 2 + combo * 100",
  "manualReveal": "ゲームが変わりました。",
  "endingFlavor": "あなたは最後まで走った。",
  "theme": "plain",
  "bgColor": "#001020",
  "environment": "sky",
  "scrollDirection": "horizontal",
  "gravity": 1600
}
```

> **注:** `GenreId` は `string` 型のため、型定義の修正は不要です。
> `threshold`（genrePoints 型）と `thresholds`（軸パラメータ型）の両方が利用可能です。

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
