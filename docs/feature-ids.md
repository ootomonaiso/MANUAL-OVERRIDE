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
| `boss` | ボスエネミー出現 | SpecialFeature ✅

---

## 移動系

| FeatureId | 説明 | 対応 FeatureSystem |
|---|---|---|
| `auto_run` | 自動前進（プレイヤーは左右とジャンプのみ） | MovementFeature ✅ |
| `slow_precise` | 低速精密移動（速度 × slowPreciseRatio） | MovementFeature ✅ |
| `double_jump` | 空中でもう一度ジャンプ可能 | MovementFeature ✅ |
| `long_air` | 空中でスコアボーナス（0.8pt/sec） | MovementFeature ✅ |
| `dash` | 短距離ダッシュ（Shift など） | ExtraMovementFeature ✅ |
| `wall_jump` | 壁接触中に逆方向ジャンプ | ExtraMovementFeature ✅ |
| `slide` | しゃがみスライド（障害物くぐり） | ExtraMovementFeature ✅ |
| `gravity_flip` | 重力反転（天井を床として走る） | ExtraMovementFeature ✅ |
| `vertical_scroll` | 縦スクロールモード | ExtraMovementFeature ✅ |

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
| `grid_stop` | スクロール停止してグリッド配置モード | PuzzleFeature ✅ |
| `puzzle_solve` | 正解が存在するパズル入力 | PuzzleFeature ✅ |

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
| `stealth_mode` | 透明化・一定時間ハザード無視 | SpecialFeature ✅ |
| `time_bonus` | タイムアタック評価（早いほど高得点） | SpecialFeature ✅ |
| `color_touch` | 安全色を踏むと得点 | SpecialFeature ✅ |

---

## タワー / クラフト系

| FeatureId | 説明 | 対応 FeatureSystem |
|---|---|---|
| `tower` | タワー設置（停止して配置） | SpecialFeature ✅ |

---

## 実装ステータス

| ステータス | 意味 |
|---|---|
| ✅ 完全実装 | preUpdate / update / render まで実装済み |
| ⚠️ スタブ登録済み | FeatureSystem として登録済みだがロジック未移管 |
| ─ sideScroller 直接処理 | FeatureSystem を経由せず sideScroller が処理（移管課題） |

| FeatureSystem | 対象 FeatureId | ステータス |
|---|---|---|
| ShootFeature | shoot / three_way / charge_shot / spread_shot / bomb / enemy_hp | ✅ |
| RhythmFeature | beat_hazard / just_input / beat_dash | ✅ |
| MovementFeature | auto_run / slow_precise / double_jump / long_air | ✅ |
| RpgFeature | hp / exp / item_pickup / shield | ✅ |
| ExtraMovementFeature | dash / wall_jump / slide / gravity_flip / vertical_scroll | ✅ |
| PuzzleFeature | grid_stop / puzzle_solve | ✅ |
| SpecialFeature | stealth_mode / time_bonus / tower / color_touch / boss | ✅ |

---

## FeatureId を新規追加するには

1. `src/domain/types.ts` の `FeatureId` union に文字列リテラルを追加
2. `src/data/config/genres.json` の該当ジャンルの `enableFeatures` に追加
3. `src/game/systems/` に `XxxFeature.ts` を作成（[feature-system.md](feature-system.md) 参照）
4. `src/game/systems/index.ts` に `registerFeature(new XxxFeature())` を追加
