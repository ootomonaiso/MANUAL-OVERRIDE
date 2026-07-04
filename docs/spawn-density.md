# ジャンル固有スポーン密度

## 概要

各ジャンルが独自のハザード出現間隔設定（`spawnDensity`）を持てるようになった。
これにより、STGのように敵を密集させたいジャンルとIdleのように疎にしたいジャンルで
異なるゲーム感覚を実現できる。

## 設定方法

`src/data/genres/<genre>.json` に `spawnDensity` フィールドを追加する:

```json
{
  "id": "stg",
  "spawnDensity": {
    "baseInterval": 1800,
    "minInterval": 600,
    "decayRate": 0.0002
  }
}
```

| フィールド | 説明 | デフォルト（global） |
|---|---|---|
| `baseInterval` | 初期スポーン間隔（ms） | 2400 |
| `minInterval` | 最小間隔＝最大密度の上限（ms） | 800 |
| `decayRate` | 距離による間隔短縮の減衰率 | 0.00015 |

## スポーン間隔の計算式

```
interval = baseInterval * exp(-decayRate * distance)
final    = max(minInterval, interval)
nextSpawnDist += (final / 1000) * scrollSpeed
```

- `distance` が増加するほど間隔が短くなり、ハザードが密集する
- `minInterval` で最大密度に上限を設ける

## 既存ジャンルとの互換性

`spawnDensity` を未設定のジャンルは、`src/data/config/game_balance.json` の
`HAZARD_SPAWN`（global設定）を自動的に使用するため、既存ジャンルの動作は変更されない。

## 実装構成

```
src/engine/GenrePlugin.ts        ← spawnDensity? をインターフェースに追加
src/engine/GenrePluginBase.ts    ← 同上（基底クラス）
src/engine/GameRegistry.ts       ← mergeSpawnDensity() でJSON→TSマージ
src/game/sideScroller.ts         ← _getSpawnParams() でper-genre取得
src/plugins/JSONGenrePlugin.ts   ← spawnDensity パススルー
src/genres/index.ts              ← JSONからTSプラグインへのマージ orchestrate
src/framework/config-types.ts    ← GenreDefJSON に spawnDensity? 追加
schemas/genre.schema.json        ← JSON Schema に spawnDensity を追加
```

## 既存の spawnDensity 設定済みジャンル

| ジャンル | baseInterval | minInterval | decayRate | 意図 |
|---|---|---|---|---|
| stg | 1800 | 600 | 0.0002 | 密集した敵 |
| arena | 1500 | 500 | 0.00025 | 極端な多敵密度 |
| bullet_hell | 1200 | 400 | 0.0003 | 超密集弾幕 |
| survival | 2000 | 700 | 0.00018 | 持続的脅威 |
| idle | 4000 | 2000 | 0.00005 | 非常に疎、リラックス |
| runner | 2200 | 900 | 0.00013 | 標準ランナーペース |

## 新しいジャンルに追加するには

1. `src/data/genres/<new_genre>.json` に `spawnDensity` を追加
2. TSプラグインがある場合は、`src/genres/index.ts` 側のマージ処理で自動反映
3. TSプラグインがない場合は `JSONGenrePlugin` が自動で `spawnDensity` を保持
4. （オプション）`schemas/genre.schema.json` に説明追加

コード変更は不要。JSONのみで完結する。
