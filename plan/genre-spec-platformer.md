# platformer 実装仕様（簡易版）

元設計: `Platformer.md`（ユーザー添付）。デザイン指定: 砦の最下層から無限に登り続ける。

## コア

- `scrollDirection: vertical` + 新規 `climb` フィーチャー。
- 縦スクロールの「下から出現・上へ流れる」は aquatic と同じ仕組みを流用
  （`SpawnEntry.direction:'left'`）。プレイヤーは重力に従って落下し、`climb` フィーチャー時のみ
  `_updateVertical` が横スクロールと同じ重力・ジャンプ・コヨーテ・バッファ・二段ジャンプ物理を適用する。
- 足場（`isPlatform`）に上から乗ると着地。バネ（`isSpring`）は強反発。
  移動足場（`isPlatform` + `driftEnabled:true`、既存 `vertical_scroll` フィーチャーの水平ドリフトを
  「全ハザード」から「`driftEnabled` を持つハザードのみ」に変更して再利用）。
  コンベア（`isPlatform` + `conveyorVx`）は乗っている間、水平速度を加算。
- 溶岩: 画面下端の帯として描画・判定する専用ロジック（ハザード配列を使わず `_updateVertical` の
  `climb` 分岐内で直接判定）。プレイヤーの足元が画面下端の溶岩帯に達したら即死。
  上昇速度は既存の距離ベース加速（`DISTANCE_ACCEL`、上限あり）をスクロール速度に適用するだけで表現する
  （足場・溶岩とも同じ `effectiveScrollSpeed` で画面を流れるため、速度が上がるほど猶予が減る）。

## ビジュアル

- 砦の最下層から無限に登る。石造りの足場・松明・要塞の壁。上るほど背景が変化する演出は任意（今回は
  石壁テクスチャの縦スクロール一枚背景に留める）。

## 変更ファイル

- `src/data/genres/platformer.json`（`scrollDirection: vertical`、`climb` を enableFeatures に追加、
  `environment` を要塞向けに変更）
- `src/genres/PlatformerPlugin.ts`（縦スクロール要塞ビジュアルに全面変更、spawnTable を足場中心に再構成）
- `src/game/sideScroller.ts`（`_updateVertical` に `climb` 分岐: 重力・ジャンプ・足場着地・溶岩判定）
- `src/game/systems/MovementFeature.ts`（`climb` 時は縦速度を自前物理に委ねる）
- `src/data/config/gimmicks.json`（溶岩帯の高さ等を共有設定に含める）
