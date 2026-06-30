# FeatureId リファレンス

`RuntimeRules.features: Set<FeatureId>` に含まれるフラグ一覧。  
ジャンル定義の `enableFeatures` / `disableFeatures` で制御される。

---

## STG 系

| FeatureId | 説明 | 対応 FeatureSystem |
|---|---|---|
| `shoot` | 前方弾発射（デフォルトキー: Z） | ShootFeature |
| `three_way` | 三方向弾（shoot の拡張） | ShootFeature |
| `charge_shot` | 長押しチャージショット | ShootFeature |
| `spread_shot` | 扇状5方向散弾 | ShootFeature |
| `bomb` | 爆弾アイテム（画面全体攻撃） | ShootFeature |
| `enemy_hp` | 敵が HP を持ち複数ヒット必要 | ShootFeature |
| `boss` | ボスエネミー出現（強化HP・HPバー描画・撃破演出） | SpecialFeature ✅ |

---

## 移動系

| FeatureId | 説明 | 対応 FeatureSystem |
|---|---|---|
| `auto_run` | 自動前進（プレイヤーは左右とジャンプのみ） | MovementFeature ✅ |
| `slow_precise` | 低速精密移動（速度 × slowPreciseRatio） | MovementFeature ✅ |
| `double_jump` | 空中でもう一度ジャンプ可能 | MovementFeature ✅ |
| `long_air` | 空中でスコアボーナス（0.8pt/sec） | MovementFeature ✅ |
| `dash` | 短距離ダッシュ（Shift など）+ 無敵フレーム + トレイル演出 | MovementFeature ✅ |
| `wall_jump` | 画面端（壁扱い）到達時にジャンプ権回復 + 逆方向押し出し | MovementFeature ✅ |
| `slide` | しゃがみスライド（障害物くぐり） | MovementFeature (⚠️未実装・console.warn) |
| `gravity_flip` | 重力反転（天井を床として走る） | MovementFeature (⚠️未実装・console.warn) |
| `vertical_scroll` | 縦スクロールモード + ハザード蛇行ドリフト演出 | MovementFeature ✅ |

---

## RPG / 育成系

| FeatureId | 説明 | 対応 FeatureSystem |
|---|---|---|
| `hp` | HP システム（複数回被弾許容） | RpgFeature ✅（onPlayerHit で HP 減算・無敵・エフェクト） |
| `exp` | 経験値・レベルアップ | RpgFeature ✅（item_pickup と連動） |
| `item_pickup` | フィールドアイテム収集 | RpgFeature ✅（update で収集・EXP / HP 付与） |
| `shield` | シールド（1回ガード） | RpgFeature (⚠️スタブ) |

---

## パズル系

| FeatureId | 説明 | 対応 FeatureSystem |
|---|---|---|
| `grid_stop` | move/solveフェーズ交互切替。solve中はscrollSpeed=0で停止 | PuzzleFeature ✅ |
| `puzzle_solve` | solve→move切替時にターゲットセル判定。正解でコンボ+スコア、不正解でリセット | PuzzleFeature ✅ |

---

## リズム系

| FeatureId | 説明 | 対応 FeatureSystem |
|---|---|---|
| `beat_hazard` | BPM 同期でハザードが色変化・反転 | RhythmFeature ✅ |
| `just_input` | ジャスト入力でボーナス | RhythmFeature ✅ |
| `beat_dash` | リズムに合わせたダッシュで加速 | RhythmFeature ✅ |

---

## ステルス / 特殊系

| FeatureId | 説明 | 対応 FeatureSystem |
|---|---|---|
| `stealth_mode` | 静止継続で「隠れ」状態に。無敵 + ステルスボーナス + 半透明演出 | SpecialFeature ✅ |
| `time_bonus` | 一定時間ごと（5秒）にスコア加算（+50pt） | SpecialFeature ✅ |
| `color_touch` | 安全色を踏むと得点・消滅・エフェクト | SpecialFeature ✅ |
| `tower` | 一定間隔で最も近いハザードを自動撃破（描画+動作+パーティクル） | SpecialFeature ✅ |
| `boss` | isBossスポーンを強化HP化。HPバー描画・撃破演出・スコア加算 | SpecialFeature ✅ |

---

## テトリス系

| FeatureId | 説明 | 対応 FeatureSystem |
|---|---|---|
| `tetris_mode` | 横スクロールを停止し 10×20 グリッドのテトリスを起動（7-Bag・ゴーストピース・ロックディレイ・ウォールキック） | TetrisFeature ✅ |

---

## 実装ステータス

| ステータス | 意味 |
|---|---|
| ✅ 完全実装 | preUpdate / update / render まで実装済み |
| ⚠️ 未実装 | FeatureId は定義済みだがロジック未実装（console.warn 出力） |
| ─ sideScroller 直接処理 | FeatureSystem を経由せず sideScroller が処理（移管課題） |

| FeatureSystem | 対象 FeatureId | ステータス |
|---|---|---|
| ShootFeature | shoot / three_way / charge_shot / spread_shot / bomb / enemy_hp | ✅ |
| RhythmFeature | beat_hazard / just_input / beat_dash | ✅ |
| MovementFeature | auto_run / slow_precise / double_jump / long_air / dash / wall_jump / vertical_scroll | ✅（slide / gravity_flip は ⚠️ 未実装・console.warn） |
| RpgFeature | hp / exp / item_pickup / shield | ✅（hp: onPlayerHit、item_pickup: update。shield は未実装） |
| PuzzleFeature | grid_stop / puzzle_solve | ✅ |
| SpecialFeature | stealth_mode / time_bonus / tower / color_touch / boss | ✅ |
| TetrisFeature | tetris_mode | ✅ |

---

## FeatureId を新規追加するには

1. `src/data/genres/<ジャンルID>.json` の該当ジャンルの `enableFeatures` に追加
2. `src/game/systems/` に `XxxFeature.ts` を作成（[feature-system.md](feature-system.md) 参照）
3. `src/game/systems/index.ts` に `registerFeature(new XxxFeature())` を追加

> **注:** `FeatureId` は `string` 型（union 型ではない）のため、型定義の修正は不要です。
