# Aquatic 実装仕様 v2

> **本文書のステータス: 実装仕様確定**
> [`genre-redesign-aquatic.md`](genre-redesign-aquatic.md) の決定事項を実装レベルに落とし込む。同名旧版（自動中央維持＋酸素ゲージ）は破棄。
> パターンJSONの共通コンセプト（`PatternEntry` の型・一方通行足場の物理）は [`spec-pattern-system.md`](spec-pattern-system.md) を踏襲するが、Aquatic は Runner（水平エンドレス）・Platformer（垂直部屋クリア）のどちらでもない **「垂直エンドレス連結」** という第3の形を取るため、本文書で個別に定義する。
> **既存の `AquaticPlugin.ts` / `AquaticFeature.ts` 等、既存実装があってもその内容に合わせる必要はない。ゼロベースで設計する。**

## 概要

深海を舞台に、プレイヤーが海の底へ向かってひたすら潜り続ける水中アクションゲーム。画面は遅い一定速度で自動的に下へスクロールし、画面下から横方向に長い岩が次々出現する。プレイヤーは小さい重力の中でゆったり落下しつつ、小さくジャンプもしながら岩を乗り継いで下へ進み続ける。酸素ゲージは持たず、画面外（上下どちらの方向）へ逸脱したら即敗北。

## 画面レイアウト

縦長画面、左右をパネルで埋める構図（`aerial_stg`/`platformer` と同じ扱い）。
既存 `src/data/config/hud_safezone.json` の `vstgLeftRatio` / `vstgRightRatio`（各0.225）をそのまま流用し、プレイヤー・岩・ギミックの水平可動域をこの帯（画面幅の55%相当）に制限する。`scrollMode: 'y'` は既存の縦スクロール機構（`aerial_stg` が使うもの）をそのまま使う。

## 垂直方向の挙動（重力・ジャンプ）

`AquaticFeature`（既存ファイルを全面書き換え）が毎フレーム以下を行う:

```
p.vy += aquaticGravityPxPerSec2 * dt
if (ジャンプ入力 justPressed && p.onGround) {
  p.vy = aquaticJumpVelocityPxPerSec   // 負値、小さめ
}
p.y += p.vy * dt
```

- `aquaticGravityPxPerSec2` / `aquaticJumpVelocityPxPerSec` は `src/data/config/aquatic.json` に新設する。`physics.json` の `defaultGravity`（1600）/`jumpVelocity`（-720）に対して大幅に小さい値を仮置きし、実プレイで調整する
- 既存の共通ジャンプ処理（`MovementFeature`／`physics.json` 固定値前提）は Aquatic では使わない。`src/data/genres/aquatic.json` の `disableFeatures` にジャンプ・重力関連の既存 FeatureId を指定し、`gravity` フィールド自体も参照しない（Aquatic 専用 Feature が完全に管理する）
- `p.onGround` は「一方通行足場（岩・ふわふわ足場）に着地している」ことを表す既存の判定をそのまま使う

## 水平方向の挙動

`←→` キーでプレイヤーが自由に移動する。可動域は上記セーフゾーン帯に制限する（既存の横方向クランプロジックを踏襲）。
流れが強いゾーン（後述）に重なっている間は、通常の左右移動に加えて `p.x += currentVxPxPerSec * dt` を上乗せする（プレイヤー操作とは独立に重ねがけする水流の力）。

## 地形生成: 縦エンドレス・パターン方式

Runner の「固定長区間をプールから均一確率で選び連結する」方式を縦方向に転用する。

### 型定義（`src/engine/patternTypes.ts` に追加）

```ts
// Aquatic 専用: 'current'（流れゾーン。非接触・重なり判定のみで水平方向へ押し流す）
export type PatternEntryKind = 'oneWayPlatform' | 'spring' | 'spike' | 'current'

export interface AquaticPatternEntry extends PatternEntry {
  /** kind: 'current' のみ有効。水平方向の押し流し速度 px/sec（+右 / -左） */
  currentVx?: number
}

export interface AquaticPattern {
  id: string
  entries: AquaticPatternEntry[]
}

export interface AquaticPatternFile {
  section: 'aquatic_patterns'
  segmentLengthPx: number
  patterns: AquaticPattern[]
}
```

### データ設計（`src/data/patterns/aquatic.json`）

```json
{
  "section": "aquatic_patterns",
  "segmentLengthPx": 900,
  "patterns": [
    {
      "id": "a_001_basic_zigzag",
      "entries": [
        { "kind": "oneWayPlatform", "x": 20,  "y": 160, "w": 200, "h": 28 },
        { "kind": "oneWayPlatform", "x": 220, "y": 420, "w": 200, "h": 28 },
        { "kind": "spike",          "x": 120, "y": 300, "w": 30,  "h": 30 }
      ]
    }
  ]
}
```

- `segmentLengthPx` は全パターン共通の固定長（縦方向）。各 `entries[].y` はこの範囲 `[0, segmentLengthPx)` に収まっていること。`y=0` が浅い側（前セグメントに接続）、`y=segmentLengthPx` が深い側（次セグメントに接続）
- `entries[].x` はセーフゾーン帯内のローカル座標（`0` 〜 帯幅px）
- `kind: 'oneWayPlatform'`: 岩本体。`w` を大きく（横方向に長く）取る。`driftEnabled: true` にすると「ふわふわ移動する足場」になる（見た目・サイズはジャンル側の描画で岩と区別する）
- `kind: 'spike'`: 敵。Runner と同じ「自力移動しない固定ハザード、接触即死」の意味で流用し、`AquaticPlugin` 側で魚のシルエットとして描画する
- `kind: 'current'`: 流れゾーン。`currentVx` を持つ。衝突判定は行わず、重なり判定のみでプレイヤーの水平位置に力を加える
- エンジンはプールから均一確率で1パターンを選び（直前と同一パターンは除外）、直前セグメントの終端Yに `segmentLengthPx` を加算した位置を新セグメントの原点として連結する（Runner の `patternLengthPx` 連結ロジックを縦方向に転用）

## 死亡条件

- `p.y + p.h <= 0` → 上方向へ逸脱（スクロールに置き去りにされた） → 敗北
- `p.y >= world.canvas.height` → 下方向へ逸脱（岩に乗れず自由落下しきった） → 敗北
- `spike`（敵）との接触 → 即死。既存の「非 `isSafe` 接触＝即死」の汎用フォールバックにそのまま乗せる（旧版の `interactionKind` による特殊分岐は廃止し、通常のハザード即死経路に統一する）

## 難易度スケーリング（スクロール速度）

Runner/Platformer と同じ「時間経過ベースでスクロール速度が上昇、上限あり」の考え方を採用する。既存の距離ベース難易度曲線（`game_balance.json`、1.0倍→1.5倍）は使わない。

```
scrollSpeed = min(scrollSpeedBasePxPerSec + elapsedSec * scrollSpeedGrowthPxPerSec2, scrollSpeedMaxPxPerSec)
```

パラメータは `src/data/config/aquatic.json` に追加する（`scrollSpeedBasePxPerSec` / `scrollSpeedGrowthPxPerSec2` / `scrollSpeedMaxPxPerSec`）。

## スコア

```json
{ "scoreFormula": "distance" }
```

- `distance` はスクロールした深度をそのまま流用する。Aquatic は Runner 型（連続スクロール）であり Platformer のような「部屋クリア時に一括加算」ではないため、`world.addDistance()` は不要。毎フレームのスクロール量をそのまま `distance` に積算する既存の仕組みをそのまま使う

## 到達可能性検証（reach-sim 拡張）

既存の `scripts/pattern-reach-sim.mjs` は Runner（水平ジャンプの最大到達距離）・Platformer（垂直ジャンプの最大到達距離）を前提にした検証ロジックであり、Aquatic の「小重力での自由落下＋小ジャンプ」には流用できない。Aquatic 用に新しい検証観点を追加する:

- 連続する岩の間で、自由落下時間内に画面下端まで落ちきらないか（落下ペースがスクロール速度に対して致命的に速すぎないか）
- 横方向のオフセットが、落下時間内に到達可能な水平移動距離（左右移動速度 × 落下時間）に収まっているか
- 検証用定数は `src/data/config/aquatic.json` に追加する（仮称: `maxFallGapPx` / `maxFallDriftPx`）。`aquaticGravityPxPerSec2` / `aquaticJumpVelocityPxPerSec` / 左右移動速度からの理論値を目安とし、実プレイで調整する

## ビジュアル

[`genre-redesign-aquatic.md`](genre-redesign-aquatic.md) の記述を踏襲: 深い青色基調の深海、横に長い岩のシルエット、ふわふわ足場は岩より小さく発光、敵は棘・牙を思わせる魚のシルエット、流れゾーンは水流パーティクルで方向を可視化、深度表示をHUDに常時表示。酸素ゲージ・サンゴ関連のHUD/演出は全て削除する。

## 設定ファイル一覧

| ファイル | 追加・変更内容 |
|---|---|
| `src/data/genres/aquatic.json` | `gravity` フィールドは Aquatic 専用 Feature が参照しないため実質不要（スキーマ上は残してよい）。`enableFeatures`/`disableFeatures` を全面差し替え（`oxygen` を削除、パターン系の新 Feature ID を追加）。`controls` から `moveUp`/`moveDown` を削除し `jump` を有効化 |
| `src/data/config/aquatic.json` | 内容を全面差し替え。`oxygenDecayRate`/`healRate`/`creatureDamageRate`/`terrainPushSpeed`/`centerReturnSpeed` を削除し、`aquaticGravityPxPerSec2` / `aquaticJumpVelocityPxPerSec` / `scrollSpeedBasePxPerSec` / `scrollSpeedGrowthPxPerSec2` / `scrollSpeedMaxPxPerSec` / `currentVxPxPerSec`（既定値）/ `maxFallGapPx` / `maxFallDriftPx` に置き換える |
| `src/engine/patternTypes.ts` | `PatternEntryKind` に `'current'` を追加。`AquaticPatternEntry` / `AquaticPattern` / `AquaticPatternFile` 型を新設 |
| `schemas/pattern.schema.json` | Aquatic 用パターンJSONの検証を追加（別ファイル `schemas/aquatic-pattern.schema.json` に分けるか、既存ファイルを拡張するかは実装時に判断） |
| `src/data/patterns/aquatic.json` | 新規。岩・敵・ふわふわ足場・流れゾーンの手作りパターン集（初期20種以上を目安、Runner/Platformerと同水準） |
| `src/framework/PatternLoader.ts` | `aquatic.json` の読み込みを追加 |
| `src/game/systems/AquaticFeature.ts` | 全面書き換え。重力・ジャンプ・セグメント連結・流れゾーンの力・画面外死亡判定を担当する新ロジックに置き換える |
| `src/genres/AquaticPlugin.ts` | `spawnTable` ベースの実装を削除し、パターン由来の `entries` 描画（岩・ふわふわ足場・敵・流れゾーン）に差し替える |
| `src/game/entities.ts` | `interactionKind: 'terrain' | 'creature' | 'heal'` は Aquatic では未使用化する（他ジャンルが使っていなければ削除、使っていれば温存しつつ Aquatic からの参照のみ外す） |
| `scripts/pattern-reach-sim.mjs` | Aquatic 用の検証ロジック（自由落下ベース）を追加 |
| `schemas/genre.schema.json` | `enableFeatures`/`disableFeatures` の enum に Aquatic 用の新 Feature ID（例: `pattern_descend`）を追加 |

## 未確定事項（実装前に確認が必要）

1. **重力・ジャンプ初速度の具体的な数値**: 小さすぎるとジャンプの意味がなくなり、大きすぎると通常ジャンプと変わらなくなる。実プレイでの調整が前提
2. **スクロール速度の初期値・上限値**: 遅すぎると間延びし、速すぎると理不尽になる
3. **reach-sim 拡張の検証式の具体的な定数**: 「到達可能性検証」節の観点を元に、理論値算出後に実プレイで調整する
4. **岩の標準的な幅・隙間の目安**: 横方向にどれだけ動けば次の岩に届くか。初期パターン制作時に決める
5. **`spec-pattern-system.md` への正式な追記**: Aquatic の「垂直エンドレス連結」を Runner（水平）・Platformer（垂直部屋）と並ぶ第3の形として共通ドキュメントに反映するかどうかは別途判断（本文書では Aquatic 側にのみ記載し、共通ドキュメントの更新はスコープ外とした）
