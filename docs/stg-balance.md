# STG バランス修正 — 設計書

## 背景

ユーザーからのフィードバック（stg / aerial_stg 共通 + 個別）:

| # | 問題 | 対象 |
|---|------|------|
| 1 | 敵の密度が足りない | 共通 |
| 2 | 敵が硬すぎる | 共通 |
| 3 | 敵が速すぎる | 共通 |
| 4 | 3方向射出の斜めが斜めすぎる | 共通 |
| 5 | アイテム（射撃強化）が欲しい | 共通 |
| 6 | 触れても安全な青い敵を無くす | 共通 |
| 7 | 背景の「網みたいなやつ」が何인지不明 | stg |
| 8 | 敵が全然凝っていない | aerial_stg |
| 9 | プレイヤーの向きがおかしい | aerial_stg |

## 修正方針

### 1. 敵の密度（共通）

**現状**: `stg.json` の `spawnDensity.baseInterval = 1800`。`aerial_stg.json` は spawnDensity 未定義（デフォルト使用）。

**修正**:
- `stg.json`: `baseInterval: 1800 → 1100`、`minInterval: 600 → 450`
- `aerial_stg.json`: `spawnDensity` を追加 `{ baseInterval: 1100, minInterval: 450, decayRate: 0.0002 }`

### 2. 敵の硬さ（共通）

**現状**: `SPAWN.enemyHpAmount = 3`（`enemy_hp` 有効時、敵は 3HP）。

**修正**: spawnTable の各エントリに `hpOverride: 2` を追加（敵を 2HP に）。
- `StgPlugin.ts` spawnTable: 全 4 エントリに `hpOverride: 2`
- `AerialStgPlugin.ts` spawnTable: 全 3 エントリに `hpOverride: 2`

### 3. 敵の速度（共通）

**現状**: スクロール速度 = `BASE_SCROLL_SPEED(300) + tempo * TEMPO_SPEED_BONUS`。STG の tempo が高いため敵が速い。

**修正**: `GenrePlugin.scrollSpeedBonus` を負値で設定（スクロール速度を減速）。
- `StgPlugin.ts`: `scrollSpeedBonus = -80`
- `AerialStgPlugin.ts`: `scrollSpeedBonus = -80`

※ 背景も減速するが、STG ではプレイヤーが撃てる時間を稼ぐため許容範囲。

### 4. 3方向射出の角度（共通）

**現状**: `shoot.json` の `threeWayYRatio = 0.6`（斜めすぎる）、`threeWaySpeedRatio = 0.8`（サイド弾が遅い）。

**修正**:
- `threeWayYRatio: 0.6 → 0.28`（斜めを浅く）
- `threeWaySpeedRatio: 0.8 → 0.95`（サイド弾を速く、中央弾と速度差を縮める）

### 5. アイテム（射撃強化）（共通）

**現状**: STG にパワーアップアイテムなし。アイテムは `exp`/`hp` のみ（RpgFeature 処理）。

**修正**:
- `entities.ts`: Item type に `'power'` を追加
- `domain/types.ts`: FeatureId に `'power_up'` を追加
- 新 Feature: `src/game/systems/PowerUpFeature.ts`
  - `handles = ['power_up']`
  - `'power'` アイテムを収集 → 射撃クールダウンを 5 秒間 50% 短縮
  - ShootFeature との連携: world に `powerBoostTimer` を設定（ShootFeature が参照）
- `sideScroller.ts` のアイテムスポーンロジック: `power_up` 有効時に `'power'` アイテムを一定確率でスポーン
- `stg.json` / `aerial_stg.json`: `enableFeatures` に `'power_up'` を追加
- `spawn.json`: `powerDropChance: 0.15`（アイテムスポーン時の power 確率）を追加
- power アイテムの見た目: 既存の item スプライトを流用（または発光する四角形）

### 6. 青い安全敵の除去（共通）

**現状**: `safeChance ?? default`。stg は `safeChance` 未設定（デフォルトで青い安全敵が出現）。aerial_stg は `safeChance: 0`（既に設定済み）。

**修正**: `StgPlugin.ts` spawnTable の全 4 エントリに `safeChance: 0` を追加。

### 7. 背景の「網みたいなやつ」（stg）

**現状**: `StgPlugin.drawForeground` の走査線（3px 間隔の横線、421-424 行）が「網」に見える。

**修正**: 走査線を描画を削除（421-424 行を削除）。ビネット・HUD・光条は維持。

### 8. 敵の凝り（aerial_stg）

**現状**: 敵は既にカスタム描画（戦闘機・爆撃機・ミサイル）だが、視覚的差別化が不十分。

**修正**:
- 敵戦闘機（diamond）: 機首の赤い発光コア + 翼のフラッターアニメーションを追加
- 爆撃機（rect）: 主砲の発光 + 被弾時の煙を追加
- ミサイル（pillar）: 尾炎の揺らぎ + 機体の回転アニメーションを追加
- 各敵に固有の色相シフト（戦闘機=赤、爆撃機=紫、ミサイル=橙）

### 9. プレイヤーの向き（aerial_stg）

**現状**: `spriteFacesUp = true` でエンジンの -90° 回転を無効化。`drawPlayer` は機首=上（cx, 0）で描画。

**修正**:
- 実際の描画を確認（スクリーンショット）し、機首が上を向いているか検証
- 万が一回転が二重に掛かっている場合は `spriteFacesUp` のロジックを修正
- 機首の発光（キャノピーの光）を強化して向きを明確にする

## 対象ファイル

| ファイル | 変更内容 |
|----------|----------|
| `src/data/genres/stg.json` | spawnDensity 変更 + power_up feature 追加 |
| `src/data/genres/aerial_stg.json` | spawnDensity 追加 + power_up feature 追加 |
| `src/data/config/shoot.json` | threeWayYRatio / threeWaySpeedRatio 変更 |
| `src/data/config/spawn.json` | powerDropChance 追加 |
| `src/genres/StgPlugin.ts` | hpOverride + safeChance + scrollSpeedBonus + 走査線削除 |
| `src/genres/AerialStgPlugin.ts` | hpOverride + scrollSpeedBonus + 敵描画強化 + 向き確認 |
| `src/game/entities.ts` | Item type に 'power' 追加 |
| `src/domain/types.ts` | FeatureId に 'power_up' 追加 |
| `src/game/systems/PowerUpFeature.ts` | **新規** — power アイテム処理 |
| `src/game/systems/index.ts` | PowerUpFeature 登録 |
| `src/game/sideScroller.ts` | power アイテムスポーンロジック |
| `src/game/systems/ShootFeature.ts` | powerBoostTimer 参照（クールダウン短縮） |

## 検証

1. `npx vue-tsc --noEmit` — 型チェック
2. `npm run lint` — ESLint
3. `npm run test` — ユニットテスト
4. `npm run build` — ビルド
5. スクリーンショット確認:
   - stg: 敵密度・HPバー(2段)・3方向弾の角度・power アイテム・走査線なし
   - aerial_stg: 敵密度・HPバー(2段)・敵の凝り・プレイヤーの向き（機首=上）
6. 動作確認: power アイテム取得 → 射撃速度が上がる
