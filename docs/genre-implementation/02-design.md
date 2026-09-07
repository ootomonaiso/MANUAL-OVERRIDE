# ジャンル実装 — 設計書

> 各ジャンルの「見た目・遊び・到達性」の具体設計。
> プラグインは既存の `src/genres/*.ts`（DungeonPlugin / RhythmPlugin / RacingPlugin 等）を
> テンプレートに、`GenrePluginBase` を継承して作る。`src/genres/index.ts` は
> `import.meta.glob` で自動収集するため、**ファイル作成 + `export default new XxxPlugin()`
> の 1 行**だけで登録される（index.ts 編集不要）。

---

## 0. プラグイン実装の共通ルール

- `class XxxPlugin extends GenrePluginBase` で `readonly id: GenreId = '<id>'` を宣言
- 必須: `skyColors` / `groundColors` / `farLayerColor` / `midLayerColor` / `palette` / `spawnTable`
- 描画は `PixelCanvas`（`src/game/render`）で。ドット絵・量子化で PixelArt 風を維持
- プレイヤーは既存 `src/data/sprites/*.json` のスプライトを `px.sprite()` で流用できる
  （`player_base` / `player_explorer` / `player_cyber_runner` / `player_diver` /
  `player_gladiator` / `player_knight` / `player_platformer` / `player_racecar` / `player_survival` 等）
- ジャンル固有 HUD（ゲージ・拠点・マーカー等）は `drawGenreHUD` に描く
- 画面装飾（走査線・ビネット・点滅等）は `drawForeground` に描く
- 毎フレームの演出（点滅・速度ライン等）は `drawForeground` / `drawMidLayer` で
  `performance.now()` を駆動源に決定的に描く（乱数でなくハッシュ or 時間関数）

### 到達性調整の手順

**重要な制約（回帰ガード）:** `tests/unit/genres/thresholdReachability.test.ts` が
puzzle（combo 6）のランダム到達率 ≥ 15% / 狙い撃ち > 20%、および主要ジャンル
（stg / idle / puzzle / runner / aerial_stg / aquatic）のランダム > 1% を強制する。
12 軸は全ジャンルで共有されるため、目標ジャンルの閾値を下げると共有軸を持つ
健全ジャンル（特に combo 系の puzzle / tetris / hack_slash）から確率を奪う
（ゼロサム）。そのため**狙い撃ち到達率の現実的な下限は約 10%**（20% は達成不可）。

調整手順:
1. `src/data/genres/<id>.json` の `thresholds` を下げる（軸 1 つ → 5 前後 / 軸 2 つ → 各 4~5）
2. **combo 軸を持つ目標ジャンル（arena / platformer）は combo 閾値を元の値に保つ**
   （puzzle を守るため）。arena は hack_slash と enemy+combo が衝突するため
   **enemy+speed に軸を切替**して独立した収束経路を持たせた
3. `npm run reach-sim` で再測定。狙い撃ち到達率が **10% 以上**になるまで調整
4. `tests/unit/genres/thresholdReachability.test.ts` がパスすること（必須）
5. 高 weight のカードを大量追加しない（カードプールの偏りで健全ジャンルが崩壊する）

**最終閾値（実装済み）:**

| ジャンル | 閾値 | 狙い撃ち到達率 |
|---|---|---|
| arena | enemy 5, speed 4 | ~11% |
| bullet_runner | tempo 5, enemy 5 | ~14% |
| tower_def | craft 5, enemy 4 | ~15% |
| rhythm | tempo 5, rhythm 5 | ~15% |
| dungeon | growth 5, craft 5 | ~9% |
| horror | survive 5, stealth 4 | ~17% |
| （その他は元閾値のまま到達可能: racing / platformer / stealth_action / runner / sports） | | 10~18% |

---

## 1. tower_def（タワーディフェンス）— 難

**世界観**: 左側に「守る拠点（城・要塞）」があり、右から敵が波状に迫る。
プレイヤーは拠点のそばで立ち、`tower` フィーチャーが最寄りの敵を自動撃破する。

- **色**: 夜空の青黒 `#0a0f1a` / `#0d1420`。地面は石畳の灰 `#1a2030` / `#0f1420`
- **farLayer**: 遠くの城壁・塔のシルエット
- **midLayer**: 手前に並ぶ**タワー（砲塔）**。決定的ハッシュで間隔配置。撃破時に光る
- **プレイヤー**: `player_gladiator` を流用、左寄りに配置（拠点を背に）
- **ハザード**: 敵（rect / pillar）が右から左へ。`palette.danger` = 赤橙
- **ジャンル固有演出（必須）**:
  - `drawForeground` で左端に**拠点（城門）**を描く。被弾すると点滅
  - `drawGenreHUD` で**タワー残数 / 撃破数**を表示
- **遊び**: `tower`（自動撃破）+ `enemy_hp` + `item_pickup`。既存 Feature で成立
- **到達性**: 現状 1.9% → `thresholds` を `{ craft: 5, enemy: 4 }` 等に下げる +
  craft/enemy 軸のカード確認 → 20% 以上

---

## 2. stealth_action（スチールスアクション）— 難

**世界観**: 暗い街・施設。見張りの**警戒範囲（円錐）**を避け、静止で隠密する。

- **色**: 深夜の青黒 `#05070d` / `#0a0f1a`。地面はアスファルト `#0d1118`
- **farLayer**: 建物の窓（点灯した窓が点滅）
- **midLayer**: 見張りの**警戒円錐**（半透明の扇）。`performance.now()` でゆっくり回転
- **プレイヤー**: `player_explorer` を暗色で。隠密時は半透明（`stealth_mode` の演出と連動）
- **ハザード**: 見張り（pillar 型）。`palette.danger` = 赤
- **ジャンル固有演出（必須）**:
  - `drawForeground` で**隠密ゲージ**（静止で上昇）を `drawGenreHUD` に描く
  - 画面全体を暗くし、プレイヤー周囲だけ明らめ（ビネット）
- **遊び**: `stealth_mode`（静止で隠密・無敵）+ `slow_precise`。既存 Feature で成立
- **到達性**: 現状 14.5% → `thresholds` を `{ stealth: 5 }` に下げる → 20% 以上

---

## 3. dungeon（ダンジョン探索）— 難

**世界観**: 石造りの地下迷宮。松明のオレンジと黒の闇（既存 DungeonPlugin が良好）。

- **現状**: プラグイン有（松明・石壁・ランタン）。視覚は良好
- **改善点**:
  - `drawGenreHUD` で**HP / 経験値 / レベル**を表示（`hp` / `exp` / `item_pickup` と連動）
  - 宝箱・罠の視認性を高める（`spawnTable` に chest 型を追加可）
- **遊び**: `hp` + `exp` + `item_pickup` + `slow_precise` + `melee_kill`。既存 Feature で成立
- **到達性**: 現状 4.7% → `thresholds` を `{ growth: 5, craft: 4 }` 等に下げる +
  growth 軸のカード確認 → 20% 以上

---

## 4. rhythm（リズムゲーム）— 難

**世界観**: サイバーパンク / ネオン。BPM に同期してビートが流れる（既存 RhythmPlugin が良好）。

- **現状**: プラグイン有（ネオンの縦ライン）。視覚は良好
- **改善点**:
  - **ビートマーカー**を強化: 画面下端にビートが流れてくるレーンを `drawForeground` に描く
  - `drawGenreHUD` で**コンボ / ビートヒット数**を表示
  - ハザードがビートで色反転する演出（`beat_hazard` と連動）を明確化
- **遊び**: `beat_hazard` + `just_input` + `beat_dash` + `near_miss_combo`。既存 Feature で成立
- **到達性**: 現状 3.7% → `thresholds` を `{ tempo: 5, rhythm: 4 }` 等に下げる +
  tempo/rhythm 軸のカード確認 → 20% 以上

---

## 5. glitch（壊れたゲーム）— 易（特殊）

**世界観**: 矛盾の蓄積でゲームが「壊れる」。`resolvable: false`（通常到達不可、矛盾カード専用）。

- **色**: 通常テーマを壊した感じ。基調は base を引き継ぎ、**色ずれ・反転**を叠加す
- **ジャンル固有演出（必須）**:
  - `drawForeground` で**スクリーントゥイスト**（水平方向のランダムなシフト、時間関数で決定的）
  - **色反転・RGB ずれ**（一定周期で画面の一部を反転）
  - **ノイズ / 走査線**（ドットのランダム点滅）
  - `onUpdate` で稀に**入力反転**の演出（既存 LearningSystem の invertHazard を流用可）
- **遊び**: `movement` + `hp`。壊れた挙動（ハザードの反転・速度の乱れ）で表現
- **到達性**: `resolvable: false` のため reach-sim 対象外。矛盾カード経由のみ到達

---

## 6. horror（サバイバルホラー）— 易

**世界観**: ほぼ漆黒。視界が限られ、明かりが点滅する。正気を保つ。

- **色**: 漆黒 `#020202` / `#050508`。地面は暗い土 `#0a0a0d`
- **farLayer**: ほぼ見えない（暗闇）。遠くの明かりが点滅
- **midLayer**: 歪んだ柱・扉のシルエット（暗く）
- **プレイヤー**: `player_explorer` を暗色で。周囲だけ明らめ
- **ハザード**: 暗闇に浮かぶ赤い目（`palette.danger` = 赤、グロー強め）
- **ジャンル固有演出（必須）**:
  - `drawForeground` で**強めのビネット**（視界制限）+ **明かりの点滅**（時間関数で決定的）
  - `drawGenreHUD` で**正気ゲージ**（被弾・時間経過で減少）を表示
- **遊び**: `hp` + `stealth_mode` + `slow_precise`。既存 Feature で成立
- **到達性**: 現状 5.6% → `thresholds` を `{ survive: 5, stealth: 4 }` 等に下げる +
  survive 軸のカード確認 → 20% 以上

---

## 7. idle（放置ゲーム）— 易

**世界観**: 落ち着いた場所。何もせずとも資源が積み上がる。

- **色**: 明るいクリーム `#f5f5f0` / `#e8e8e0`。地面は温かい茶 `#d8d0c0`
- **farLayer**: 穏やかな丘・建物のシルエット（明るい）
- **midLayer**: **積み上がる資源の山**（ブロックが時間経過で増える演出）
- **プレイヤー**: `player_base` を流用
- **ハザード**: 少ない（`spawnDensity` の baseInterval 大）。`palette.danger` = 柔らかい赤
- **ジャンル固有演出（必須）**:
  - `drawForeground` / `drawGenreHUD` で**累積資源数 / 自動増加分**を表示
  - 資源が画面内で積み上がる演出（`item_pickup` / `tower` と連動）
- **遊び**: `item_pickup` + `exp` + `tower`。既存 Feature で成立
- **到達性**: 現状 22.3%（OK）。維持

---

## 8. runner（エンドレスランナー）— 易

**世界観**: 高速で走り続ける。速度感・モーションが主役。

- **色**: 夜の街 `#1a1a2e` / `#16213e`。地面はアスファルト `#0f0f1a`
- **farLayer**: 高速で流れる街のシルエット（パララックス強め）
- **midLayer**: 街灯・看板（高速で流れる）
- **プレイヤー**: `player_cyber_runner` を流用
- **ハザード**: 障害物（rect / pillar）。`palette.danger` = 赤
- **ジャンル固有演出（必須）**:
  - `drawForeground` で**速度ライン**（水平の光線、`performance.now()` で流れる）
  - `scrollSpeedBonus` でスクロール速度を上げる（速度感）
  - `drawGenreHUD` で**距離 / 最高速度**を表示
- **遊び**: `auto_run` + `double_jump` + `long_air` + `near_miss_combo`。既存 Feature で成立
- **到達性**: 現状 17.2% → `thresholds` を `{ tempo: 6 }` に下げる → 20% 以上

---

## 9. sports（スポーツゲーム）— 易

**世界観**: スタジアム。スコアボードとタイム。記録更新。

- **色**: 昼のスタジアム。空は明るい青 `#87ceeb` / `#b0e0ff`。地面は芝 `#2d5a27` / `#1f4019`
- **farLayer**: 観客席のシルエット（点滅する歓声感）
- **midLayer**: スタジアムの柱・ゴール
- **プレイヤー**: `player_base` を流用
- **ハザード**: 障害物（rect）。`palette.danger` = 赤
- **ジャンル固有演出（必須）**:
  - `drawForeground` / `drawGenreHUD` で**スコアボード**（タイム / 記録）を表示
  - ゴールラインの演出（`time_bonus` と連動）
- **遊び**: `dash` + `time_bonus` + `just_input` + `near_miss_combo`。既存 Feature で成立
- **到達性**: 現状 17.8% → `thresholds` を `{ speed: 3, rhythm: 4 }` 等に下げる → 20% 以上

---

## 10. racing（レーシングゲーム）— 易

**世界観**: レースコース。速度・チェッカーフラッグ。既存 RacingPlugin が良好。

- **現状**: プラグイン有。視覚は良好
- **改善点**:
  - `drawGenreHUD` で**タイム / 順位**を表示
  - チェッカーフラッグのゴール演出
- **遊び**: `auto_run` + `dash` + `time_bonus` + `near_miss_combo`。既存 Feature で成立
- **到達性**: 現状 11.6% → `thresholds` を `{ speed: 3, tempo: 5 }` 等に下げる → 20% 以上

---

## 11. arena（アリーナバトル）— 易（要緊急対応）

**世界観**: 闘技場。多数の敵 + ボス。既存 ArenaPlugin が良好。

- **現状**: プラグイン有。**到達率 0.2% でほぼ到達不能**（最優先）
- **改善点**:
  - `drawGenreHUD` で**ボス HP バー / 撃破数**を表示（`boss` / `enemy_hp` と連動）
  - 敵の密集感（`spawnDensity` で密度を上げる）
- **遊び**: `shoot` + `enemy_hp` + `boss` + `dash`。既存 Feature で成立
- **到達性**: 現状 0.2% → `thresholds` を `{ enemy: 4, combo: 3 }` 等に大幅に下げる +
  enemy/combo 軸のカードを確実に供給 → 20% 以上

---

## 12. aquatic（水中アドベンチャー）— 易

**世界観**: 深海。気泡・青。既存 AquaticPlugin が良好。

- **現状**: プラグイン有。視覚は良好
- **改善点**:
  - 気泡の演出を強化（`drawForeground`）
  - `drawGenreHUD` で**酸素 / 深度**を表示（`hp` と連動）
- **遊び**: `hp` + `item_pickup` + `slow_precise`。既存 Feature で成立
- **到達性**: 現状 34.1%（OK）。維持

---

## 13. hack_slash（ハックアンドスラッシュ）— 易

**世界観**: 近接戦闘。コンボ。既存 HackSlashPlugin が良好。

- **現状**: プラグイン有。視覚は良好
- **改善点**:
  - `drawGenreHUD` で**コンボ数 / 最大コンボ**を表示
  - 斬撃の演出（`melee_kill` / `dash` と連動）
- **遊び**: `shoot` + `enemy_hp` + `exp` + `item_pickup` + `dash` + `boss`。既存 Feature で成立
- **到達性**: 現状 22.9%（OK）。維持

---

## 14. platformer（プラットフォームアクション）— 易

**世界観**: 空中の足場。跳躍。既存 PlatformerPlugin が良好。

- **現状**: プラグイン有。視覚は良好
- **改善点**:
  - 浮遊する足場（`spawnTable` に air 配置を強化）
  - `drawGenreHUD` で**コンボ / 滞空時間**を表示
- **遊び**: `double_jump` + `long_air` + `wall_jump` + `near_miss_combo`。既存 Feature で成立
- **到達性**: 現状 11.8% → `thresholds` を `{ aerial: 4, combo: 3 }` 等に下げる → 20% 以上

---

## 15. bullet_runner（弾幕ランナー）— 易（要緊急対応）

**世界観**: 走りながら弾を撃つ。既存 BulletRunnerPlugin が良好。

- **現状**: プラグイン有。**到達率 1.7% でほぼ到達不能**（最優先）
- **改善点**:
  - `drawGenreHUD` で**撃破数 / 距離**を表示
  - 弾幕の密度感（`spawnDensity`）
- **遊び**: `auto_run` + `shoot` + `enemy_hp`。既存 Feature で成立
- **到達性**: 現状 1.7% → `thresholds` を `{ tempo: 5, enemy: 4 }` 等に大幅に下げる +
  tempo/enemy 軸のカードを確実に供給 → 20% 以上

---

## 16. 実装バッチ構成（Implementer への依頼単位）

| バッチ | 内容 | 担当 |
|---|---|---|
| **B1** | 新規プラグイン 7 つ（tower_def / stealth_action / horror / idle / runner / sports / glitch） | Implementer |
| **B2** | 既存 8 プラグインのアイデンティティ強化（ジャンル固有 HUD 追加） | Implementer |
| **B3** | 到達性調整（thresholds + カード）— arena / bullet_runner / tower_def / rhythm / dungeon / horror / racing / platformer / stealth_action / runner / sports | deepseek_general |
| **B4** | 検証（動画・スクショ・reach-sim・テスト） | 司令塔（私） |

> B1 → B2 → B3 の順で実施。B3 は B1/B2 と独立なので並行可。
> 各バッチ完了後に B4 で動画検証し、問題があれば該当バッチに戻す。
