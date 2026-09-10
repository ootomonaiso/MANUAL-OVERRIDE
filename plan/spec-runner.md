# Runner 実装仕様

> **本文書のステータス: 実装仕様確定**
> [`genre-redesign-runner.md`](genre-redesign-runner.md) の決定事項を実装レベルに落とし込む。
> パターンJSON形式・エンジン共通基盤・reach-sim検証は [`spec-pattern-system.md`](spec-pattern-system.md) を参照（本文書では重複記載しない）。
> **既存の `BasePlugin.ts`（`RunnerPlugin`）の spawnTable は前提が異なるため使用しない。ゼロベースで設計する。**

## 概要

`base` ジャンルを基礎とし、移動を自動化してジャンプアクションと障害物対応に集中させたエンドレスランナー。操作は基本的にジャンプのみ。手作りされた固定長の区間パターンを連結してエンドレスに走行する。

## ゲームフロー

1. ゲーム開始時、最初の区間パターンをロードする
2. プレイヤーは自動的に右方向へ進み続ける。ジャンプで穴・トゲ（敵）を回避する
3. プレイヤーが現在の区間の終端（`patternLengthPx`）に到達する前に、次の区間パターンをプールから均一確率で選択し（直前と同一パターンは除外）、現在区間の終端に連結してスポーンする（先読み生成。既存の `nextSpawnDist` 型の先読みロジックと同じ考え方）
4. 敵（トゲ）・穴・その他致死ハザードへの接触でゲームオーバー

## 難易度スケーリング（速度のみ）

[genre-redesign-runner.md](genre-redesign-runner.md) の決定通り、パターン選択は均一確率のまま変えず、**スクロール速度の時間経過による上昇のみ**で難易度を調整する。

既存エンジンの `_update()` が全ジャンル共通で持つ `effectiveScrollSpeed = r.scrollSpeed * distanceAccelFactor`（`distanceAccelFactor` は距離ベースで1.0倍→1.5倍に頭打ちする既存の汎用加速カーブ、`game_balance.json` の `DISTANCE_ACCEL` 定数）を**そのまま流用する**。Runner専用の新しい速度成長式は不要（上限も既にこの既存カーブに内包されている）。

## トゲ（敵）の扱い

[genre-redesign-runner.md](genre-redesign-runner.md) の決定通り、Runner の「敵」は実体としてはトゲ（`PatternEntryKind: 'spike'`）であり、自力移動はしない固定ハザード。ステージと一緒に流れるだけで、接触判定は他の致死ハザードと同一（即死）。

## 視覚設計（全面刷新対象）

[genre-redesign-runner.md](genre-redesign-runner.md) で「穴・空中足場・バネ・トゲ（敵）すべて」が視認性改善の対象と決定済み。実装方針:

- **色相を要素ごとに完全分離**する（同系色を共有させない）。例: 穴=黒系（背景と同化させず縁を発光させる）、空中足場（`oneWayPlatform`）=土台色+上面ハイライト、バネ=warning色（黄〜橙）+反発方向を示す矢印装飾、トゲ=danger色（赤系）+棘のシルエット
- **シルエットで判別できる形状差**を持たせる（バネ=菱形、トゲ=三角の集合、足場=横長矩形、穴=地面の欠落そのもの）
- 現行の `BasePlugin.ts`（diamond/spike 形状を使い回す実装）は視認性不足の原因の一つのため、Runner 専用の描画関数を新設し、他ジャンルとの形状共有をやめる

具体的な配色・形状は実装時に別途デザイン確認を行う（本文書ではデータ構造・ロジックの確定を優先する）。

## 操作方法

| キー | 動作 |
|------|------|
| ↑ / Space | ジャンプ（二段ジャンプ対応） |
| ← → ↓ | 未使用 |

コヨーテタイム・ジャンプ入力バッファ・二段ジャンプは既存の共通ジャンプ物理（`physics.json` / `PLAYER_PHYSICS`）をそのまま使用し、Runner専用の再実装は行わない。

## スコア

距離ベース（既存の `distance` をそのまま使用）。

```json
{ "scoreFormula": "distance" }
```

## 設定ファイル一覧

| ファイル | 追加・変更内容 |
|---|---|
| `src/data/patterns/runner.json` | 新規。区間パターン集本体（[`spec-pattern-system.md`](spec-pattern-system.md) 参照）。初期20種以上を収録 |
| `src/data/genres/runner.json` | `enableFeatures` を `["pattern_runner", "double_jump"]` 等に変更（既存の `auto_run` は維持） |
| `src/genres/BasePlugin.ts` | `RunnerPlugin` の `spawnTable` を撤去。`drawHazard` をトゲ/穴/足場/バネそれぞれ専用の描画に刷新 |

## 未確定事項（実装前に確認が必要）

なし（本セッションのQ&Aで全て確定済み）。
