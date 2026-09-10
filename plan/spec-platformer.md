# Platformer 実装仕様

> **本文書のステータス: 実装仕様確定**
> [`genre-redesign-platformer.md`](genre-redesign-platformer.md) の決定事項を実装レベルに落とし込む。
> パターンJSON形式・エンジン共通基盤・一方通行足場の物理・reach-sim検証は [`spec-pattern-system.md`](spec-pattern-system.md) を参照（本文書では重複記載しない）。
> **既存の `PlatformerPlugin.ts` の spawnTable、および `sideScroller.ts` の未コミット差分（旧 climb 実装）は前提が異なるため使用しない。ゼロベースで設計する。**

## 概要

要塞の最下層から、手作りされた「部屋（パターン）」を1つずつクリアしながら上へ登り続ける縦スクロール型プラットフォーマー。部屋の下端の起点（暗黙の床）から部屋上端の出口（一方通行足場）へ到達すると次の部屋へ切り替わる。画面下からは溶岩が迫り、部屋クリア数に応じて（上限付きで）上昇速度が増す。

## ゲームフロー

1. ゲーム開始時、最初の部屋パターンをロードする（後述「初期部屋の選定」）
2. プレイヤーは部屋の床（起点、暗黙に幅いっぱいの一方通行足場として自動生成）からスタートする
3. `entries` に定義された足場・バネ・移動足場・コンベアを使い、`exit`（部屋上端の一方通行足場）を目指す
4. `exit` に到達すると:
   - `patternRoomsCleared` をインクリメント
   - 次パターンをプールから均一確率で選択（直前と同一パターンは除外）
   - 画面を次パターンの初期構図（新しい部屋の床）にスクロール・再配置する
   - 溶岩の位置を部屋の初期位置にリセットする（下記「溶岩の挙動」）
5. プレイヤーが溶岩に触れたらゲームオーバー

## 画面レイアウト

[Aquatic再設計文書](genre-redesign-aquatic.md) と同じ方針: 縦長画面、左右をパネルで埋める構図。
既存の `hud_safezone.json` の `vstgLeftRatio` / `vstgRightRatio`（各0.225）を流用し、プレイヤー・パターン内の全エンティティの水平可動域をこの帯（画面幅の55%相当）に制限する。パターンJSONの `x` 座標はこの帯の内側を基準にスケーリングする（[`spec-pattern-system.md`](spec-pattern-system.md) の「Platformer パターン」参照）。

## 一方通行足場（起点・出口・通常足場）

[`spec-pattern-system.md`](spec-pattern-system.md) の物理仕様に従う。Platformer では以下の3種類すべてが `isOneWay: true` の同一ロジックで動く:

- **部屋の床（起点）**: 部屋切り替え時に自動生成。可動域いっぱいの幅
- **`entries` 内の `oneWayPlatform`**: パターンJSONで手作り配置
- **`exit`（部屋の出口）**: 到達判定は「プレイヤーがこの足場に着地した」ことをもって部屋クリアとする（一方通行足場としての物理挙動は通常のものと同一。区別は「到達したら部屋クリアイベントを発火する」点のみ）

## 溶岩の挙動

- **部屋が切り替わるたびに、溶岩の初期位置（画面下端からのオフセット）はリセットされる**（[genre-redesign-platformer.md](genre-redesign-platformer.md) の決定通り、毎回同じ相対位置から再スタート。部屋クリア直後に理不尽に飲まれることはない）
- **上昇速度は部屋クリア数に応じて上昇する**。式（案）: `lavaSpeed = min(lavaSpeedBase + patternRoomsCleared * lavaSpeedGrowthPerRoom, lavaSpeedMaxPx)`。パラメータは `src/data/config/gimmicks.json` に追加（`lavaSpeedBase` / `lavaSpeedGrowthPerRoom` / `lavaSpeedMaxPx`）
- 上限 `lavaSpeedMaxPx` を必ず設け、どれだけ部屋をクリアしても攻略不可能な速度には到達しない

## 初期部屋の選定

ゲーム開始直後の部屋も、他の部屋と同様に**全パターンから均一ランダムに選ぶ**（本セッションで確認済み）。難易度タグによる特別扱いは行わない。

## スコア（高度）

`patternRoomsCleared * roomHeightPx` の累積（[genre-redesign-platformer.md](genre-redesign-platformer.md) の決定通り）。`roomHeightPx` は `patterns.json` の `referenceHeightPx` を実行時キャンバス高さにスケーリングした値を使う。

既存の `ScoreVars.distance`（走行距離、`scoreFormula` で使える汎用変数）をそのまま「高度」として流用する。`ScoreVars` に新規変数を追加する必要はない。実装上は、部屋クリア時に `PatternClimbFeature` が [`spec-pattern-system.md`](spec-pattern-system.md) で追加する `world.addDistance(roomHeightPx)` を呼び、部屋クリアの都度まとめて加算する（Platformer は水平スクロール型のような連続的な distance 加算を行わないため、このAPIが必要になる）。

```json
{ "scoreFormula": "distance" }
```

## ビジュアル

[元ドラフト](genre-redesign-platformer.md#ビジュアル更新)を踏襲。要塞最下層のテーマ、石造りの足場・松明・要塞の壁。既存 `PlatformerPlugin.ts` の描画関数（`drawFarLayer` / `drawMidLayer` / `drawPlayer` / `drawForeground`）はビジュアル資産として流用可能（ロジック部分のみ刷新）。

一方通行足場は、通常の（存在しない）足場と区別する必要はない（Platformer では全足場が一方通行のため、視覚的な特別扱いは不要）。ただし `exit`（部屋の出口）は他の足場と視覚的に区別できるようにする（発光・色分けなど）。

## 設定ファイル一覧

| ファイル | 追加・変更内容 |
|---|---|
| `src/data/patterns/platformer.json` | 新規。パターン集本体（[`spec-pattern-system.md`](spec-pattern-system.md) 参照） |
| `src/data/config/patterns.json` | 新規。`referenceWidthPx` / `referenceHeightPx` / ジャンプ到達距離定数 |
| `src/data/config/gimmicks.json` | `lavaSpeedBase` / `lavaSpeedGrowthPerRoom` / `lavaSpeedMaxPx` を追加。旧 `climbScrollDelaySec` / `climbScrollRampSec` / `climbMaxScrollSpeed` / `climbDriftTime` 関連の定数は本再設計では不要（部屋クリア数ベースに置き換えるため） |
| `src/data/genres/platformer.json` | `enableFeatures` を `["pattern_climb"]` に変更、`scoreFormula: "altitude"` |

## 未確定事項

なし（本セッションのQ&Aで全て確定済み。初期パターン収録数はRunnerと同様20種以上、初期部屋は全パターンから均一ランダム）。
