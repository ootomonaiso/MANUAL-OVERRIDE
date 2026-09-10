# runner 実装仕様（簡易版）

元設計: `Runner.md`（ユーザー添付）。デザイン指定: 昼の都市、奥にビル街。

## コア

- 既存の横スクロール + `auto_run` + `double_jump` + `long_air` + `near_miss_combo` を維持。
- 新規ギミックをハザードに追加（`Hazard`/`SpawnEntry` 拡張、`isGimmick:true` で共通化）:
  - `isHole`: 地面の穴。プレイヤーの足元にこのハザードがある区間は地面に着地しない
    （落下を続け、画面下に落ちきったら死亡）。
  - `isPlatform`: 空中足場。上から乗ると着地できる（`isSafe` 扱いなので通常接触では死なない）。
  - `isSpring`: バネ。上から乗ると通常より強く跳ね上がる。
- 敵は右から出現し接触で即死（既存の `isSafe:false` ハザードのまま。専用敵スプライトは
  `RunnerPlugin` 側で `diamond`/`spike` 形状を敵らしい配色に）。
- 到達可能性の厳密な保証（automatic reachability proof）は実装しない。
  穴の最大幅・出現間隔を二段ジャンプの水平到達距離より十分小さく調整することで
  理不尽な即死配置を避ける（既存ジャンルも同水準のスポーン間隔チューニングで対応している）。

## ビジュアル

- 昼の都市。空は明るい青、奥にビル街のシルエット（`BasePlugin.drawMidLayer` のビル群を踏襲しつつ
  昼用パレットに変更）、地面はアスファルト風。

## 変更ファイル

- `src/data/genres/runner.json`（背景色調整、必要なら thresholds はそのまま）
- `src/genres/BasePlugin.ts`（`RunnerPlugin` を昼の都市パレットに変更、spawnTableに hole/platform/spring 追加）
- `src/game/sideScroller.ts`（横スクロール着地判定に hole/platform/spring 対応を追加。runner/bullet_runner共通）
- `src/data/config/gimmicks.json`（新規: 穴の致死判定余白・足場着地許容量・バネ反発速度）
