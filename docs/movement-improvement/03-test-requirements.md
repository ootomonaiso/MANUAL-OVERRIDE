# 標準メインキャラ 移動フィール改善 — テスト要件定義

- ステータス: **Draft（承認待ち）**
- 上位文書: [01-requirements.md](./01-requirements.md) / [02-design.md](./02-design.md)
- 作成日: 2026-09-03

---

## 1. テスト方針

| レイヤ | ツール | 対象 |
|---|---|---|
| 単体テスト | Vitest（`npm run test:unit:ci`） | 加速・減速ロジック、2回ジャンプ速度 |
| 統合 / E2E | Playwright（`npm run test`） | 実機での移動フィール・回帰 |
| フィール確認 | Playwright + スクリーンショット | 重量感・慣性の主観的検証（AC-7） |

- 単体テストは `tests/unit/game/` に配置（既存の `RpgFeature.test.ts` / `MeleeKillFeature.test.ts` と同様の
  `MutableWorld` モック + `InputSnapshot` を渡して `preUpdate` を呼び、`world.player` をアサートするパターン）。
- 加速ロジックは `dt` 乗算（フレームレート非依存）のため、テストでは固定 `dt`（例: `1/60`）で複数フレーム回す。

## 2. 単体テスト要件（`tests/unit/game/MovementFeature.test.ts`）

> テスト用モックは既存パターンを流用（`Player` 実インスタンス + 最小 `MutableWorld`）。
> `rules.features` / `rules.controls` / `player.onGround` を制御して各シナリオを再現する。

| ID | シナリオ | 初期状態 | 操作（InputSnapshot） | 期待（複数フレーム後） | 対応要件 |
|---|---|---|---|---|---|
| **UT-01** | 地上・右加速 | `vx=0`, `onGround=true` | `moveRight` 押下を N フレーム維持 | `vx` が `0` から `+runSpeed` へ**漸増**し、`runSpeed` を**超過しない** | REQ-MOV-01 |
| **UT-02** | 地上・停止減速 | `vx=+runSpeed`, `onGround=true` | 無入力 N フレーム | `vx` が `+runSpeed` から `0` へ**漸減**（即座 0 にならない） | REQ-MOV-02 |
| **UT-03** | 空中加速は地上より弱い | `vx=0`, `onGround=false` | `moveRight` 押下 | 同一フレーム数で `vx` の増加量が地上（UT-01）より**小さい**（`airAccel < groundAccel`） | REQ-MOV-03 |
| **UT-04** | 空中減速は地上より弱い | `vx=+runSpeed`, `onGround=false` | 無入力 | 同一フレーム数で `vx` の減少量が地上（UT-02）より**小さい**（`airDecel < groundDecel`） | REQ-MOV-03 |
| **UT-05** | 方向反転は滑らか | `vx=+runSpeed`, `onGround=true` | `moveLeft` 押下 | `vx` が即座に `-runSpeed` にならず、`+runSpeed → 0 → -runSpeed` へ漸変 | REQ-MOV-04 |
| **UT-06** | auto_run | `vx=0`, `onGround=true`, `features` に `auto_run` | 無入力 | `vx` が `+runSpeed` へ加速（入力不要） | REQ-MOV-05 |
| **UT-07** | slow_precise | `vx=0`, `onGround=true`, `features` に `slow_precise` | `moveRight` 押下 | 目標が `runSpeed × slowPreciseRatio`（`vx` はこの値に漸近） | REQ-MOV-06 |
| **UT-08** | ダッシュ中は加速スキップ | ダッシュ発動中（`dash.timer>0`） | `moveRight` 押下 | `vx` は `dashSpeed`（加速ロジックが干渉しない） | REQ-MOV-07 |
| **UT-09** | dt 非依存 | 同一初期状態 | `dt=1/60`×60 フレーム vs `dt=1/30`×30 フレーム | 同一実時間（1秒）後の `vx` がほぼ一致（フレームレート非依存） | RISK-3 |
| **UT-10** | 可動域クランプ維持 | `vx=+runSpeed` 高速移動 | 右端へ移動 | `p.x` が `W*playerMaxXRatio` を超過しない（`_updateHorizontal` 側だが回帰確認） | C6 / BC-1 |

### 2.1 2回ジャンプ速度テスト（`tests/unit/game/doubleJumpVelocity.test.ts`）

> `sideScroller.ts` のジャンプ処理はプライベートメソッドのため、
> 既存テスト（`tests/unit/game/` 配下）の SideScroller インスタンス化パターンを流用し、
> 入力シミュレートで 1回/2回ジャンプを再現して `player.vy` をアサートする。

| ID | シナリオ | 期待 | 対応要件 |
|---|---|---|---|
| **UT-11** | 1回ジャンプ（地上） | `vy = jumpVelocity`（現状維持） | REQ-MOV-08 |
| **UT-12** | 2回ジャンプ（空中・coyote 外） | `vy = doubleJumpVelocity`（`-610`、`jumpVelocity` と**異なる**） | REQ-MOV-08 |
| **UT-13** | coyote ジャンプ（地面直離脱） | `vy = jumpVelocity`（`doubleJumpVelocity` ではない） | REQ-MOV-08 |

## 3. 設定整合テスト（`tests/unit/framework/`）

| ID | シナリオ | 期待 | 対応要件 |
|---|---|---|---|
| **UT-14** | `physics.json` に 4 パラメータ存在 | `PLAYER_PHYSICS.groundAccel` 等が正の数で読み込まれる | REQ-MOV-09 |
| **UT-15** | `airFrictionX` が廃止 | `PLAYER_PHYSICS` / `PhysicsConfig` に `airFrictionX` が存在しない | REQ-MOV-10 |
| **UT-16** | ConfigValidator が新規パラメータを検証 | 負値 / 欠落時にバリデーションエラー（`npm run validate` 成功） | REQ-MOV-09 |

## 4. 統合 / E2E テスト要件（Playwright）

> 既存の `tests/smoke.spec.ts` / `tests/genre-lock-no-update.spec.ts` を参照し、
> ゲーム起動→入力→状態確認のパターンを流用する。

| ID | シナリオ | 期待 | 対応 |
|---|---|---|---|
| **IT-01** | 起動後右キー押下 | プレイヤーが右へ移動（`x` が増加）、即座に最大速度にならない | AC-1 / AC-3 |
| **IT-02** | 右移動中に入力解除 | プレイヤーが数フレームで減速停止（即座停止しない） | AC-2 |
| **IT-03** | ジャンプキー押下 | 既存通りジャンプ（coyote / バッファ / 変量ジャンプが機能） | AC-5 / C6 |
| **IT-04** | 障害物出現時にジャンプ回避 | 被弾しない（回避が加速ロジックでも達成可能） | AC-5 / BC-2 |
| **IT-05** | ジャンル確定（base→任意） | 移動フィールが破綻せず継続プレイ可能（回帰なし） | AC-5 |

## 5. フィール確認（主観的検証 / AC-7）

> 数値テストでは捕捉できない「手触り」を、実機操作 + スクリーンショットで確認する。

- **手順**:
  1. `npm run dev`（バックグラウンド起動、ログはファイルへ、PID 記録）。
  2. Playwright でゲーム起動、標準キャラ（base）で操作。
  3. 以下をスクリーンショット / 動画で確認:
     - 立ち上がりの滑らかさ（UT-01 の主観的裏付け）
     - 停止の滑らかさ（UT-02）
     - 空中の慣性（UT-03/04）
     - 2回ジャンプの高度差（UT-12）
  4. フィールが不自然な場合、`physics.json` の 4 パラメータを微調整し再確認。
- **判定**: 「重量感と応答性が両立し、既存より手触りが良い」ことを確認。
- **後始末**: 確認後に dev サーバーを停止（起動したプロセスを kill）。

## 6. 回帰スコープ

- **対象ジャンル**: 全水平スクロール系（`base` / `runner` / `rpg` / `dungeon` / `hack_slash` / `survival` 等）。
  同一キャラのフィール改善のため、代表的な 2〜3 ジャンルで動作確認。
- **対象フィーチャー**: `auto_run` / `slow_precise` / `dash` / `slide` / `wall_jump` / `double_jump`。
- **非対象（影響なしを確認）**: 無重力 STG / 縦 STG / `tetris_mode` / `lights_out`。
- **CI**: `npm run ci`（typecheck / lint / validate / check-doc-links / test:features / build / bundle-size / test:unit:ci）が全て成功。

## 7. Definition of Done（テスト観点）

- [ ] 単体テスト UT-01〜UT-16 が全て実装され、成功。
- [ ] 統合テスト IT-01〜IT-05 が全て実装され、成功。
- [ ] フィール確認（§5）が完了し、スクリーンショットを `tmp/` に保存（リポジトリ直下には置かない）。
- [ ] `npm run ci` が成功。
- [ ] 回帰スコープ（§6）のジャンルで動作確認済み。
- [ ] 新規パラメータの初期値がフィール確認で妥当と確認済み（必要なら `physics.json` で調整）。
