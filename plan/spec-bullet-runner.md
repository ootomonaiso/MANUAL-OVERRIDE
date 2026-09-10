# Bullet Runner 実装仕様

> **本文書のステータス: 実装仕様確定**
> [`genre-redesign-bullet-runner.md`](genre-redesign-bullet-runner.md) の決定事項を実装レベルに落とし込む。
> [Runner の再設計](spec-runner.md) を基盤とする。パターンJSON形式・エンジン共通基盤は [`spec-pattern-system.md`](spec-pattern-system.md) を参照。
> **既存の `BulletRunnerPlugin.ts` の spawnTable は前提が異なるため使用しない。ゼロベースで設計する。**

## 概要

`runner` ジャンルを基礎とし、`z` キーで射撃できるようにしたエンドレスランナー。穴・空中足場・バネ・トゲは [Runner の区間パターン](spec-runner.md) をそのまま使い、敵（射撃で倒す対象）だけを別レイヤーで重ねる。

## ゲームフロー

1. [`spec-runner.md`](spec-runner.md) のパターン連結ロジック（`PatternRunnerFeature`）をそのまま使用し、穴・空中足場・バネ・トゲを配置する
2. 各区間パターンが連結・スポーンされるタイミングで、対応する「敵オーバーレイ」があれば併せてスポーンする（下記データ設計）
3. プレイヤーは `z` キーで既存 `shoot.json` に基づく弾を射出し、敵にダメージを与える。敵はHPが0で撃破・消滅する
4. 敵は倒さずジャンプで飛び越える回避も可能（[genre-redesign-bullet-runner.md](genre-redesign-bullet-runner.md) の決定通り、射撃は選択肢）
5. 穴への落下・トゲ/敵との接触でゲームオーバー

## データ設計（敵オーバーレイ）

Runner の区間パターン（`src/data/patterns/runner.json`）をそのまま参照し、パターンIDごとに敵の出現候補地点を別ファイルで定義する。

新規 `src/data/patterns/bullet_runner_enemies.json`:

```json
{
  "section": "bullet_runner_enemy_overlay",
  "overlays": [
    {
      "patternId": "r_001_basic_hole",
      "spots": [
        { "x": 250, "y": 0,   "w": 32, "h": 36, "hpOverride": 2, "spawnChance": 0.6 },
        { "x": 620, "y": -80, "w": 32, "h": 36, "hpOverride": 3, "spawnChance": 0.4 }
      ]
    }
  ]
}
```

- `patternId` は `runner.json` の `patterns[].id` を参照する（存在しないIDへの参照は `validate-json.mjs` でエラーとする。既存の `conflictsWith` / `genreAffinity` 参照整合性チェックと同じ方式）
- 各 `spots[]` はパターンがスポーンされるたびに `spawnChance` の確率で独立に抽選され、配置されるかどうかが決まる（本セッションで確認済みの方式）
- `spots[].x`/`y`/`w`/`h` は Runner パターンと同じローカル座標系（パターン起点からの相対位置）
- 敵オーバーレイの座標は、同じパターンの `hole`/`oneWayPlatform` と重ならないよう手作業で配置する（自動検証は本仕様のスコープ外）
- 敵は撃破・回避のいずれも可能なため、[`spec-pattern-system.md`](spec-pattern-system.md) の reach-sim 検証の対象外とする（敵の有無に関わらず、Runner側のギミック配置だけで到達可能性が保証されていればよい）

## 敵の挙動・撃破

- 敵はステージと一緒に流れるだけで、自力移動はしない（[genre-redesign-bullet-runner.md](genre-redesign-bullet-runner.md) の決定通り、Runner のトゲと同じ方針）
- 弾の衝突判定・HPバー描画は既存実装（`enemy_hp` フィーチャー、`_drawHazard` の HP バー分岐）をそのまま使用する
- 弾のパラメータ（連射間隔・弾速・ダメージ）は既存 `shoot.json` をそのまま流用し、Bullet Runner 専用の値は新設しない

## スコア

```json
{ "scoreFormula": "distance * 0.5 + kills * 80" }
```

距離をベースに、撃破数をボーナスとして加点する（射撃がプレイの主要要素になるよう、キル報酬を明確にする、本セッションで確認済みの方向性）。係数（`0.5` / `80`）は仮値であり、実プレイバランスに応じて `score.json` 側で調整する前提。

## 操作方法

| キー | 動作 |
|------|------|
| ↑ / Space | ジャンプ（二段ジャンプ対応） |
| z | 射撃 |
| ← → ↓ | 未使用 |

## 設定ファイル一覧

| ファイル | 追加・変更内容 |
|---|---|
| `src/data/patterns/bullet_runner_enemies.json` | 新規。敵オーバーレイ本体 |
| `src/data/genres/bullet_runner.json` | `enableFeatures` を `["pattern_runner", "shoot", "enemy_hp", "double_jump"]` 等に変更、`scoreFormula` を上記に変更 |
| `src/genres/BulletRunnerPlugin.ts` | `spawnTable` を撤去。敵・穴・空中足場・バネの描画を Runner 側と共通化しつつ、ネオン配色（`colorOverride`）のみ差し替える |
| `scripts/validate-json.mjs` | `bullet_runner_enemies.json` の `patternId` 参照整合性チェックを追加 |

## 未確定事項

なし（本セッションのQ&Aで全て確定済み。敵配置は確率抽選方式、スコア式は `distance * 0.5 + kills * 80` の方向性で確定。係数の最終調整は実プレイバランスを見て行う）。
