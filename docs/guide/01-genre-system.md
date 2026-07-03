# ジャンル・パラメータ・フィーチャーの関係

[← 00-overview.md](00-overview.md) で全体像を把握した後にこれを読んでください。

---

## GenreParam（12軸）とは何か

選択肢を選ぶたびに加算される数値です。「ジャンルを直接選ぶ」のではなく、プレイヤーの選択が12種類のパラメータを少しずつ動かします。その蓄積がゲームの方向を決めていきます。

| パラメータ | 意味 |
|---|---|
| `tempo` | スピード感・スクロール加速 |
| `range` | 遠距離攻撃・射程重視 |
| `enemy` | 敵密度・戦闘の激しさ |
| `combo` | 連続成功評価 |
| `growth` | 経験値・育成要素 |
| `rhythm` | タイミング精度要求 |
| `stealth` | 接触回避・隠密行動 |
| `vertical` | 縦スクロール指向 |
| `aerial` | 空中滞在・プラットフォーム指向 |
| `survive` | 生存優先・タフネス |
| `craft` | 設置・積み上げ・放置 |
| `speed` | ダッシュ・純粋スピード |

なぜ12軸なのか——それは22種のジャンルを自然に分岐させるためです。「STG方向」と「ランナー方向」と「RPG方向」がそれぞれ異なるパラメータで引き寄せられるように設計されています。

---

## パラメータが蓄積するとジャンルが確定する

各ジャンルには**閾値（thresholds）**が定義されています。蓄積したパラメータがそのジャンルの閾値をすべて満たすと確定候補になります。

確定するのは常に1つです。複数のジャンルが候補になった場合、**閾値の超過量の合計が最大のジャンル**が選ばれます。

```
例: { tempo: 8, enemy: 6 } が蓄積されたとき

  runner        → thresholds: { tempo: 7 }
                  tempo が 8 → 超過量 1
                  ✅ 候補

  bullet_runner → thresholds: { tempo: 6, enemy: 5 }
                  tempo が 8（超過 2）+ enemy が 6（超過 1）= 超過量 3
                  ✅ 候補

  stg           → thresholds: { range: 5, enemy: 5 }
                  range が 0 → 閾値未達
                  ❌ 候補外

  → 超過量が大きい bullet_runner が確定
```

---

## 閾値が1軸のジャンルと複数軸のジャンル

「複合ジャンル」という概念は存在しません。閾値が複数軸にまたがっているジャンルが定義されているだけです。

| ジャンル | 閾値 | 性格 |
|---|---|---|
| `runner` | tempo ≥ 7 | 1軸のみ。速度を上げ続けると確定 |
| `stg` | range ≥ 5, enemy ≥ 5 | 2軸。射程と敵密度の両方が必要 |
| `bullet_runner` | tempo ≥ 6, enemy ≥ 5 | 2軸。runner と stg の中間的な性格 |
| `aerial_stg` | vertical ≥ 4, range ≥ 4, enemy ≥ 4 | 3軸。縦・射程・敵密度すべてが必要 |

runner と stg のどちらにも寄せた選択を続けると、どちらでもなく `bullet_runner` に収束するよう設計されています。これは意図的なジャンル配置です。

---

## `bullet_runner` を例に具体的に見る

`bullet_runner`（弾幕ランナー）は `tempo: 6, enemy: 5` に達すると確定します。

確定した瞬間に何が起きるか：

```
genres.json の定義（bullet_runnerの場合）:

  enableFeatures:  ["auto_run", "shoot", "enemy_hp"]
  disableFeatures: ["grid_stop", "puzzle_solve", "slow_precise", "stealth_mode"]
  scoreFormula:    "kills * 100 + distance * 1.5 + combo * 60"
  theme:           "stg"
  bgColor:         "#100010"
```

1. `auto_run`・`shoot`・`enemy_hp` が有効になり、弾が撃てるようになる
2. `grid_stop` などのパズル系機能は無効になる
3. スコア計算が「撃破数 × 100 + 距離 × 1.5 + コンボ × 60」に切り替わる
4. 説明書のUIテーマが STG 風（ドット文字・暗黒背景）になる

これがフィーチャーの役割です。

---

## Feature（フィーチャー）とは何か

`auto_run` や `shoot` のような**個別の機能の単位**です。ジャンルは「どのフィーチャーを有効にするか」の組み合わせで定義されます。

フィーチャーは `src/game/systems/` 以下のクラスとして実装されています。たとえば：

- `ShootFeature` → `shoot` / `three_way` / `enemy_hp` などを処理
- `MovementFeature` → `auto_run` / `double_jump` / `slow_precise` などを処理
- `RpgFeature` → `hp` / `exp` / `item_pickup` を処理

フィーチャーはジャンル確定後に解放されるものです。事前に揃っている必要はありません。

全フィーチャーの一覧は [docs/feature-ids.md](../feature-ids.md) を参照してください。

---

## ジャンル確定時の全体的な流れ

```
thresholds を満たすジャンルが確定
        ↓
  GenrePlugin の視覚テーマが適用される
  （背景色・空・地面・プレイヤーの見た目）
        ↓
  enableFeatures が有効化される
  （弾が撃てる・HPが生まれる など）
        ↓
  スコア計算式が切り替わる
        ↓
  説明書に「ジャンル確定宣言」が書き込まれる（manualReveal）
```

---

## 実際のデータを確認するには

| 内容 | 場所 |
|---|---|
| 全ジャンルの閾値・フィーチャー・スコア式 | `src/data/genres/*.json`（1ジャンル1ファイル） |
| 収束アルゴリズムの実装 | `src/domain/genreResolver.ts` |
| ジャンルの視覚テーマ実装 | `src/genres/` |
| フィーチャーの動作ロジック | `src/game/systems/` |

---

## 参照ドキュメント

- [docs/genre-system.md](../genre-system.md) — 全ジャンル一覧・収束アルゴリズム詳細
- [docs/feature-ids.md](../feature-ids.md) — 全フィーチャーID一覧（実装ステータス付き）
- [02-manual-json.md](02-manual-json.md) — 選択肢がパラメータを動かす仕組みの詳細
