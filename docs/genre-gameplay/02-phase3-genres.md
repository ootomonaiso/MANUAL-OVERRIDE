# Phase 3: 8 ジャンルの個別ゲームプレイ設計

> 対象: runner / bullet_runner / aquatic / platformer / dungeon / arena / hack_slash / stealth_action
> 方針: 既存 Feature を強化 or GameMode でコアループを置換。各ジャンルが「○○ゲームだ」と一目で分かる手応えを持たせる。

---

## 1. platformer — 縦スクロール + 溶岩追跡（GameMode）

**コア**: 下から溶岩が追いかけてくる縦スクロール。プラットフォームを駆け上って高みを目指す。

### ゲームループ
- プレイヤーは画面中央に固定、カメラが上昇
- 溶岩（lava）が画面下部から上昇（速度: 30px/s、時間経過で加速 +5px/s 每 10 秒）
- プラットフォームを生成（上から下へ 80〜150px 間隔）
- プラットフォーム種類:
  - **normal** (60%): 静的。幅 60〜120px
  - **spring** (15%): 踏むと 2 倍の高さへ跳ね上がる。黄色で視覚区別
  - **conveyor** (15%): 左右にゆっくり移動（20px/s）。矢印で方向を示す
  - **crumble** (10%): 踏むと 0.5 秒後に崩壊（赤茶色で視覚区別）
- 障害物: なし（溶岩だけが危険）
- 入力: 左右移動 + ジャンプ（二段ジャンプ可）

### 勝利/敗北
- **勝利**: 高度 3000px に到達（`isWon`）
- **敗北**: 溶岩に接触（`isLost`）

### HUD
- 左上: 高度 (`ALT: 1234m`)
- 右下: 溶岩までの距離（色: 青→黄→赤）

### 視覚
- 背景: 既存 PlatformerPlugin（青空・雲）
- 溶岩: 画面下部からオレンジの帯（波状の先端）
- プラットフォーム: 色で種類を示す（normal=緑, spring=黄, conveyor=青, crumble=赤茶）

### 実装ファイル
- `src/game/modes/PlatformerMode.ts` (新規)
- `src/genres/PlatformerPlugin.ts` — `gameMode` フィールドを追加

---

## 2. arena — ウェーブ制アリーナバトル（GameMode）

**コア**: 画面がアリーナ（左右に壁）で閉じられている。敵が波状に現れ、全滅させると次のウェーブ。

### ゲームループ
- プレイヤーは画面中央、左右移動 + ジャンプ + 射撃（Z）
- アリーナ幅: 画面幅 - 40px（左右 20px に壁）
- 敵生成: 画面右端から 1〜3 体同時出現（ウェーブ番号で増加）
  - 敵: 赤い四角形（w:24 h:24）、HP=2、左へ移動（速度 60+wave*10 px/s）
  - 敵はプレイヤーの Y に追従（垂直速度 40px/s）
- 弾: 右方向に発射（速度 400px/s）
- 敵に命中: HP-1。HP0 で撃破（+100 点）
- 敵がプレイヤーに接触: HP-1（プレイヤー HP=3）、無敵 1 秒
- ウェーブ間: 3 秒間隔（「WAVE N」表示）
- 5 ウェーブで勝利

### 勝利/敗北
- **勝利**: 5 ウェーブ全滅（`isWon`）
- **敗北**: プレイヤー HP=0（`isLost`）

### HUD
- 左上: WAVE N/5 + 残敵数
- 右上: プレイヤー HP（ハート 3 個）

### 視覚
- 背景: 既存 ArenaPlugin（闘技場）
- アリーナ壁: 左右に石柱（画面端）
- 敵: 赤い四角 + 目（2 点）

### 実装ファイル
- `src/game/modes/ArenaMode.ts` (新規)
- `src/genres/ArenaPlugin.ts` — `gameMode` フィールドを追加

---

## 3. aquatic — 酸素管理水中アドベンチャー（Feature 強化）

**コア**: 酸素ゲージが減少する水中。アイテムで酸素を回復。泳ぐ（ジャンプしない）。

### 追加メカニック（AquaticFeature）
- **酸素ゲージ**: 初期 100、減少速度 3/sec。0 で敗北
- **酸素回復アイテム**: 気泡（diamond shape, safe）を回収で +30
- **泳ぎ**: `jump` キーで上昇、`down` キーで下降。重力を半減（浮力）
- **海流**: 5 秒ごとに一定方向に押し流す（速度 30px/s、2 秒持続）
- 既存: `slow_precise`（低速精密移動）は維持

### HUD
- 右上: 酸素バー（青→黄→赤）
- 左上: 深度（`DEPTH: 123m`）

### 実装ファイル
- `src/game/systems/AquaticFeature.ts` (新規)
- `src/game/systems/index.ts` — 登録追加
- `src/data/genres/aquatic.json` — `enableFeatures` に `aquatic` を追加
- `schemas/genre.schema.json` — enum に `aquatic` を追加

---

## 4. runner — レーンロック + コヨーテタイム（Feature 強化）

**コア**: 3 レーンのみに限定された自動ラン。左右移動なし、上下キーでレーン切替。

### 追加メカニック（LaneDodgeFeature 強化）
- **レーンロック**: 左右キー無効化。上下キーのみでレーン切替（3 レーン）
- **コヨーテタイム**: 地面を離れてから 0.1 秒以内ならジャンプ可能
- **ジャンプバッファ**: 着地 0.1 秒前にジャンプを押したら、着地時に発動
- **速度加速**: 10 秒ごとに +10px/s（最大 +100px/s）
- 既存: `auto_run`, `double_jump`, `long_air`, `near_miss_combo` は維持

### HUD
- 既存: 距離 + 速度
- 追加: レーン表示（3 つの点、現在レーンを強調）

### 実装ファイル
- `src/game/systems/LaneDodgeFeature.ts` — 強化（レーンロック + コヨーテタイム + バッファ）
- `src/game/InputManager.ts` — coyoteTime / jumpBuffer 支援（任意）

---

## 5. bullet_runner — 敵専用射撃（Feature 強化）

**コア**: 自動走行 + 射撃。障害物（ハザード）は撃てず、敵（HP あり）のみ撃てる。

### 追加メカニック（ShootFeature 強化 or BulletRunnerFeature）
- **敵専用射撃**: 弾がハザード（shape: rect/pillar/spike, hp 無）に当たると消滅（ダメージなし）
- **敵 HP バー**: 敵（hpOverride あり）の上に HP バーを表示
- **敵ドロップ**: 撃破時にアイテム（+50 点 or パワーアップ）
- 既存: `auto_run`, `shoot`, `enemy_hp` は維持

### HUD
- 左上: 撃破数 + 距離
- 右上: パワーレベル（3 段階）

### 実装ファイル
- `src/game/systems/ShootFeature.ts` — 敵/障害物判定追加（`isEnemy` チェック）
- `src/data/genres/bullet_runner.json` — 必要に応じて調整

---

## 6. dungeon — 部屋制 + 松明管理（Feature 強化）

**コア**: 部屋（room）を移動するダンジョン。松明の光が減少し、暗闇で視界が制限される。

### 追加メカニック（DungeonFeature）
- **部屋制**: 画面を「部屋」（幅 400px）に分割。部屋には 2〜4 体の敵 + 0〜1 体の宝箱
- **松明**: 光半径が時間経過で減少（初期 200px → 最小 80px）。松明アイテムで回復
- **暗闇演出**: 光半径外は完全に暗い（ビネット強化）
- **宝箱**: 開けると ランダム（HP+1 / 松明+1 / 経験値+5）
- 既存: `melee_kill`, `exp`, `hp`, `item_pickup` は維持

### HUD
- 右上: 松明ゲージ（オレンジバー）
- 左上: 部屋番号（`ROOM: 3`）+ レベル

### 実装ファイル
- `src/game/systems/DungeonFeature.ts` (新規)
- `src/game/systems/index.ts` — 登録追加
- `src/data/genres/dungeon.json` — `enableFeatures` に `dungeon` を追加
- `schemas/genre.schema.json` — enum に `dungeon` を追加

---

## 7. hack_slash — コンボ + 斬撃（Feature 強化）

**コア**: 近接斬撃でコンボを繋ぐ。射撃ではなく「斬る」。

### 追加メカニック（HackSlashFeature or MeleeKillFeature 強化）
- **斬撃**: Z キーで前方に斬撃（範囲: 前方 40px、持続 0.1 秒）。弾ではなく範囲攻撃
- **コンボ**: 2 秒以内の連続ヒットでコンボカウント。コンボ 5 で「CRITICAL」（2 倍ダメージ）
- **斬撃演出**: 斬った方向に弧状の光（0.2 秒）
- **画面シェイク**: クリティカル時
- 既存: `exp`, `item_pickup`, `dash`, `boss`, `enemy_hp` は維持
- `shoot` Feature は `melee_kill` に置換（斬撃 = melee_kill の強化版）

### HUD
- 左上: コンボ数（大きく表示、フェードアウト）
- 右上: HP + 経験値

### 実装ファイル
- `src/game/systems/MeleeKillFeature.ts` — 斬撃アニメーション + コンボシステム追加
- `src/data/genres/hack_slash.json` — `shoot` を `melee_kill` に変更

---

## 8. stealth_action — 見張り検知（Feature 強化）

**コア**: 見張りの警戒円錐に入る移動で検知される。静止すると隠密。

### 追加メカニック（StealthFeature）
- **見張り検知**: ハザード（pillar 型 = 見張り）が警戒円錐を持つ
  - 円錐: 見張りの正面、長さ 100px、角度 60°
  - プレイヤーが円錐内 + 移動中 → 検知メーター増加（+20/sec）
  - プレイヤーが円錐内 + 静止 → 検知メーター増加なし
  - プレイヤーが円錐外 → 検知メーター減少（-10/sec）
  - 検知メーター 100 で敗北（「発覚」）
- **隠密**: 静止 2 秒以上で半透明（既存 stealth_mode と連動）
- **ノイズ**: ダッシュ/ジャンプでノイズ発生（近隣の見張りがそちらを向く）
- 既存: `stealth_mode`, `slow_precise` は維持

### HUD
- 右上: 検知メーター（緑→黄→赤）
- 左上: 隠密ステータス（「隠密中」/「警戒」/「発覚寸前」）

### 実装ファイル
- `src/game/systems/StealthFeature.ts` (新規)
- `src/game/systems/index.ts` — 登録追加
- `src/data/genres/stealth_action.json` — `enableFeatures` に `stealth` を追加
- `schemas/genre.schema.json` — enum に `stealth` を追加

---

## 実装順序（優先度）

| # | ジャンル | 種別 | 作業量 | 優先度 |
|---|---|---|---|---|
| 1 | platformer | GameMode | 大 (400 行) | 高 |
| 2 | arena | GameMode | 中 (300 行) | 高 |
| 3 | aquatic | Feature | 中 (200 行) | 高 |
| 4 | runner | Feature 強化 | 小 (100 行) | 中 |
| 5 | bullet_runner | Feature 強化 | 小 (80 行) | 中 |
| 6 | dungeon | Feature | 中 (250 行) | 中 |
| 7 | hack_slash | Feature 強化 | 中 (150 行) | 中 |
| 8 | stealth_action | Feature | 中 (200 行) | 中 |

## 共通制約
- マジックナンバー禁止（定数 or config JSON）
- `PixelCanvas` で描画（既存スプライト流用可）
- 既存テストを壊さない
- `vue-tsc` / `lint` / `vitest` / `build` がパスすること
- オフライン完結（外部アセット不使用）
