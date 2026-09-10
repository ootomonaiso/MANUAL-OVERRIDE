# Bullet Hell（弾幕STG）実装レポート

## 概要

`bullet_hell` ジャンル（弾幕回避シューティング）を CLAUDE.md および `docs/genre/bullet-hell-genre.md` に従い実装した。

## ファイル変更一覧

### 新規作成（5ファイル）
| ファイル | 内容 |
|---|---|
| `src/data/config/bullet_hell.json` | ボス位置・弾幕パターン・弾速・カラー等のチューニング値 |
| `src/game/systems/BulletHellBossFeature.ts` | `boss_stationary` FeatureSystem。敵弾パターン生成・移動・衝突・スコア計上 |
| `src/genres/BulletHellPlugin.ts` | 東方風ビジュアル（黒背景・桜・お札・背面視点キャラクター） |
| `tests/unit/game/BulletHellBossFeature.test.ts` | 21テスト（パターン生成・移動・衝突・無敵・maxBullets・カリング等） |
| `tests/unit/domain/scoreFormulaBulletHell.test.ts` | 8テスト（スコア式評価・変数初期値） |
| `tests/unit/game/spawnGuard.test.ts` | 3テスト（空テーブルガード・回帰） |

### 変更（10ファイル）
| ファイル | 内容 |
|---|---|
| `src/data/tunables.ts` | `BULLET_HELL` 再エクスポート追加 |
| `src/domain/types.ts` | `ScoreVars` に `hitsOnBoss` / `maxHitCombo` 追加 |
| `src/data/genres/bullet_hell.json` | `enableFeatures` 再設計（`boss_stationary` 追加、`enemy_hp` 削除）、`scoreFormula` 変更 |
| `src/game/sideScroller.ts` | ScoreVars 2変数フィールド追加、vars構築更新、MutableWorld配線追加、`_spawnHazard` に空テーブルガード追加 |
| `src/game/systems/ShootFeature.ts` | `_spawnVerticalBullets` に `boss_stationary` ゲートでオートエイム分岐追加 |
| `src/game/systems/index.ts` | `BulletHellBossFeature` を `ShootFeature` 後に登録 |
| `schemas/genre.schema.json` | `boss_stationary` を enableFeatures/disableFeatures enum に追加 |
| `src/framework/config-types.ts` | `BulletHellConfig` 型定義 + `GameConfigMap` に `bullet_hell` 追加 |
| `src/data/cards/expansion-cards.json` | `c-boss-stationary` カード追加（vertical+3, enemy+3） |
| `tests/unit/domain/genreResolver.test.ts` | bullet_hell 到達性テスト2件追加 |
| `tests/unit/domain/scoreFormulaMaxCombo.test.ts` | bullet_hell を `maxCombo` 要件から除外 |
| `tests/unit/game/RpgFeature.test.ts` | モックに `addScoreVarsHitsOnBoss` / `setScoreVarsMaxHitCombo` 追加 |

## テスト結果

```
Test Files  44 passed (44)
Tests       395 passed (395)
```

新規テスト: 32件（BulletHellBossFeature: 21, scoreFormulaBulletHell: 8, spawnGuard: 3）
既存テスト: 363件（すべて PASS、 weakening せず）

## 検証コマンドと結果

| コマンド | 結果 |
|---|---|
| `npm run typecheck` (`vue-tsc --noEmit`) | PASS（エラーなし） |
| `npm run lint` (`eslint src --ext .ts,.vue`) | PASS（0 errors, 0 warnings） |
| `npm run validate` | PASS（111 passed, 0 failed） |
| `npm run test:unit:ci` (`vitest run tests/unit`) | PASS（44 files, 395 tests） |
| `npx vite build` | PASS（460 kB JS, 83 kB CSS） |

## bullet_hell の到達性

`c-boss-stationary` カード（vertical: +3, enemy: +3）を5枚選択すると `vertical: 15, enemy: 15` となり、thresholds（vertical: 4, enemy: 8）を充足。ベイズ収束で bullet_hell が最尤ジャンルになることを `genreResolver.test.ts` で検証済み。

## 設計判断との一致

- 判断1（敵弾はFeature内独立配列）: `BulletHellBossFeature.enemyBullets[]` で実装
- 判断2（被弾はFeature内で自前処理）: `world.modifyPlayerHp(-1)` + 無敵付与 + シェイク
- 判断3（`boss_stationary` 新規FeatureId）: ShootFeature のオートエイムもこのFeatureでゲート
- 判断4（ScoreVars 3点セット）: 型定義 + vars構築 + world配線 を揃えた
- 判断5（`hp` feature 有効化）: `enableFeatures` に `hp` を含める
- 判断6（空spawnTableガード）: `_spawnHazard` 先頭に早期return
- 判断7（チューニング値config化）: `bullet_hell.json` で定義、`BULLET_HELL` 経由で参照
