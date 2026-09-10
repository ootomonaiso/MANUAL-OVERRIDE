# パターンシステム 実装仕様（Runner / Platformer / Bullet Runner 共通基盤）

> **本文書のステータス: 実装仕様確定**
> [`genre-redesign-runner.md`](genre-redesign-runner.md) / [`genre-redesign-platformer.md`](genre-redesign-platformer.md) /
> [`genre-redesign-bullet-runner.md`](genre-redesign-bullet-runner.md) で決定した「手作りパターン方式」の共通基盤を実装レベルで定義する。
> 個別ジャンルの仕様は [`spec-runner.md`](spec-runner.md) / [`spec-platformer.md`](spec-platformer.md) / [`spec-bullet-runner.md`](spec-bullet-runner.md) を参照。
> **既存の `spawnTable` による重み付きランダム生成・旧 `climb` フィーチャー（sideScroller.ts の未コミット差分含む）は前提が異なるため、本仕様では使用しない。ゼロベースで設計する。**

## 設計方針

- パターンは完全に手作りで JSON に定義する。プレイ中のハザード配置に手続き型の乱数生成を用いない
- ジャンルごとに座標系・繋ぎ方が異なる:
  - **Runner / Bullet Runner**: 水平・固定長区間を連結していくエンドレス方式
  - **Platformer**: 垂直・1画面1部屋のクリア＆ループ方式
- パターンJSONのトップレベル構造はジャンルごとに分けるが、「配置要素（PatternEntry）」の型と「一方通行足場の物理判定」は共通化する

## データ設計

### PatternEntry（共通・1個のギミック/足場の配置）

新規 `src/engine/patternTypes.ts`:

```ts
export type PatternEntryKind = 'oneWayPlatform' | 'hole' | 'spring' | 'spike'

export interface PatternEntry {
  kind: PatternEntryKind
  /**
   * パターンローカル座標。
   * Runner: x = パターン起点からの水平距離px、y = 地面を0とした相対高さpx（負値=空中）
   * Platformer: x = 部屋内水平位置px（可動域内 0〜bandWidthPx）、y = 部屋底からの高さpx
   */
  x: number
  y: number
  w: number
  h: number
  /** 左右往復する移動足場にする（oneWayPlatform のみ有効） */
  driftEnabled?: boolean
  /** コンベア速度 px/sec（+右 / -左、oneWayPlatform のみ有効） */
  conveyorVx?: number
}
```

`kind: 'hole'` は `w`/`h` の `h` を無視し、地面の欠落区間として扱う（Runner のみ）。
`kind: 'spike'` は Runner 再設計文書で「敵」から改称した、自力移動しない固定ハザード（接触即死、ステージと一緒に流れるだけ）。

### Runner / Bullet Runner パターン（水平・固定長区間）

`src/data/patterns/runner.json`:

```json
{
  "section": "runner_patterns",
  "patternLengthPx": 900,
  "patterns": [
    {
      "id": "r_001_basic_hole",
      "entries": [
        { "kind": "hole", "x": 320, "y": 0, "w": 70, "h": 20 },
        { "kind": "oneWayPlatform", "x": 500, "y": -90, "w": 90, "h": 16 },
        { "kind": "spike", "x": 700, "y": 0, "w": 30, "h": 40 }
      ]
    }
  ]
}
```

- `patternLengthPx` は全パターン共通の固定長（[Runner再設計文書](genre-redesign-runner.md)の決定）。各 `entries[].x` はこの範囲 `[0, patternLengthPx)` に収まっていること
- エンジンはプールから均一確率で1パターンを選び（直前と同一パターンは除外）、直前区間の終端Xに `patternLengthPx` を加算した位置を新区間の原点として連結する
- Bullet Runner はこのファイルをそのまま流用し（[`spec-bullet-runner.md`](spec-bullet-runner.md) 参照）、敵配置だけを別ファイル `src/data/patterns/bullet_runner_enemies.json` で重ねる

### Platformer パターン（垂直・1画面1部屋）

`src/data/patterns/platformer.json`:

```json
{
  "section": "platformer_patterns",
  "referenceWidthPx": 480,
  "referenceHeightPx": 720,
  "patterns": [
    {
      "id": "p_001_stairs",
      "entries": [
        { "kind": "oneWayPlatform", "x": 40,  "y": 140, "w": 130, "h": 18 },
        { "kind": "spring",         "x": 200, "y": 260, "w": 34,  "h": 16 },
        { "kind": "oneWayPlatform", "x": 60,  "y": 420, "w": 150, "h": 18, "driftEnabled": true }
      ],
      "exit": { "x": 90, "y": 560, "w": 140, "h": 18 }
    }
  ]
}
```

- 部屋の床（起点）は暗黙に「可動域いっぱいの幅の一方通行足場」として自動生成され、パターンJSONには含めない
- `exit` は必須。到達すると部屋クリアとして扱う一方通行足場
- `x`/`y` は `referenceWidthPx`/`referenceHeightPx` を基準解像度としたpx値。実行時にキャンバスサイズへスケーリングする（`x' = x * canvasBandWidth / referenceWidthPx` 等）

## エンジン設計

### 新規ファイル

| ファイル | 責務 |
|---|---|
| `src/framework/PatternLoader.ts` | `src/data/patterns/*.json` を読み込み・型検証して公開する（`ConfigLoader` のパターン版） |
| `src/game/systems/PatternRunnerFeature.ts` | Runner / Bullet Runner 用。区間パターンの連結・選択・スポーンを担当する新規 FeatureSystem |
| `src/game/systems/PatternClimbFeature.ts` | Platformer 用。部屋のロード・クリア判定・次部屋切り替え・溶岩制御を担当する新規 FeatureSystem |
| `scripts/pattern-reach-sim.mjs` | パターンJSONに対するヒューリスティック到達可能性検証 |
| `schemas/pattern.schema.json` | パターンJSONの構造検証（`scripts/validate-json.mjs` に統合） |
| `src/data/config/patterns.json` | ジャンプ到達距離の定数・基準解像度など、パターン系ジャンル共通のチューニング値 |

### 既存ファイルへの変更

| ファイル | 変更内容 |
|---|---|
| `src/game/entities.ts` | `Hazard` に `isOneWay?: boolean` を追加。既存の `isPlatform`（乗ると止まる汎用足場）とは別に、「上昇中は素通り・下降中のみ着地」を表すフラグとして新設する |
| `src/engine/types.ts` | `MutableWorld` に `patternRoomsCleared: number`（Platformer のスコア・溶岩速度計算用）と `addDistance(amount: number): void`（部屋クリア時に既存 `ScoreVars.distance` を任意量だけ加算するAPI。Platformer が「高度」を新規スコア変数を増やさず `distance` に相乗りさせるために使う）を追加 |
| `src/game/systems/index.ts` | `PatternRunnerFeature` / `PatternClimbFeature` を `GameRegistry.registerFeature()` で登録 |
| `src/data/genres/runner.json` / `bullet_runner.json` / `platformer.json` | `enableFeatures` に新 Feature ID（`pattern_runner` / `pattern_climb`）を追加。旧 `climb` は廃止 |
| `scripts/validate-json.mjs` | `validatePatterns()` を追加し、`src/data/patterns/` を検証対象に含める |
| `package.json` | `"validate:patterns": "node scripts/pattern-reach-sim.mjs ."` を追加し、`ci` スクリプトに組み込む |

## 物理・当たり判定仕様（一方通行足場）

`isOneWay: true` のハザードは、ジャンル共通で以下の semi-solid platform ロジックにより判定する:

1. プレイヤーの垂直速度が上昇方向（`vy < 0`）の間は、一方通行足場との当たり判定を完全にスキップする（下から突き抜ける）
2. プレイヤーの垂直速度が下降方向（`vy >= 0`）で、かつ前フレームの足元Y座標が足場の上端以上（＝まだ足場の中に潜り込んでいない）の場合のみ、今フレームで足場上端を跨いだら着地させる
3. 既存の `isPlatform`（Bullet Runner の空中足場等、据え置き）は従来通り「上から乗ると着地」のみとし、本ロジックの対象外とする

## 到達可能性検証（ヒューリスティック、`scripts/pattern-reach-sim.mjs`）

`npm run validate:patterns` として実行し、`ci` に組み込む。実装前にユーザーへ確認済みの通り、**厳密な物理シミュレーションではなく、最大水平・垂直ギャップを定数と比較するヒューリスティック検証**とする。

### 検証定数（`src/data/config/patterns.json`）

`physics.json` の値から算出した理論値を初期値の目安とする（実プレイで要調整）:

| 定数 | 説明 | 算出式（目安） | 概算値 |
|---|---|---|---|
| `maxJumpRisePx` | 単発ジャンプの最大上昇量 | `jumpVelocity² / (2 * defaultGravity)` | ≈162px |
| `maxDoubleJumpRisePx` | 二段ジャンプ込みの最大上昇量 | `maxJumpRisePx + doubleJumpVelocity² / (2 * defaultGravity)` | ≈278px |
| `maxJumpGapPx` | 単発ジャンプの滞空中に進める最大水平距離 | `runSpeed * 単発ジャンプ滞空時間` | ≈190px |
| `maxDoubleJumpGapPx` | 二段ジャンプ込みの最大水平距離 | 同上を二段ジャンプ滞空時間で再計算 | ≈310px |

> 上記の概算値は `physics.json`（`jumpVelocity: -720`, `doubleJumpVelocity: -610`, `defaultGravity: 1600`, `runSpeed: 240`, `fallGravityMult: 1.65`）からの理論計算であり、コヨーテタイム・ジャンプ入力バッファ・ジャンプカット等の影響は含まない概算値。実装時に実プレイフィールで調整すること。

### 検証ロジック

- **Runner / Bullet Runner パターン**: 各パターンの `entries` を x 昇順に並べ、`hole` の幅・`oneWayPlatform` 間の間隔が `maxDoubleJumpGapPx`（Runner は二段ジャンプ前提）を超えていないか検証する
- **Platformer パターン**: 部屋の床（暗黙の起点、y=0）→ `entries` → `exit` を y 昇順に並べ、連続する2要素間の Δy が `maxDoubleJumpRisePx` を、Δx が `maxDoubleJumpGapPx` を超えていないか検証する。`driftEnabled`（移動足場）はドリフト範囲の両端のうち最も厳しい位置関係を採用する
- 検証失敗時はファイル名・パターンIDを列挙して `process.exit(1)` する（`validate-json.mjs` と同じスタイル）

## スコープ外・未確定事項

- `patterns.json` の定数は理論値からの概算であり、実装時に実プレイで調整が必要
- Bullet Runner の敵レイヤーの具体的なスキーマは [`spec-bullet-runner.md`](spec-bullet-runner.md) を参照
- Platformer の初期パターン収録数は未確認（[`spec-platformer.md`](spec-platformer.md) 参照）
