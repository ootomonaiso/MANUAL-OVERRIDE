# 標準メインキャラ 移動フィール改善 — 要件定義書

- ステータス: **Draft（承認待ち）**
- 対象: 横スクロール系（`base` を含む重力あり水平スクロール）の標準プレイヤーキャラ
- 作成日: 2026-09-03
- 関連: [02-design.md](./02-design.md) / [03-test-requirements.md](./03-test-requirements.md) / [CLAUDE.md](../../CLAUDE.md)

---

## 1. 背景・課題

本ゲームの「0番目のジャンル」である横スクロール（Phase A チュートリアル〜`base`）の
標準プレイヤーキャラの移動は、現在のところ以下の挙動を持つ。

| 項目 | 現状 | 根拠コード |
|---|---|---|
| 水平移動 | 入力に応じて `vx` が `±runSpeed(240)` / `0` に**即座に**設定される。加速・減速なし | `src/game/systems/MovementFeature.ts:86-92` |
| 空中制御 | 空中でも地上と同一の即座速度に設定される。慣性がない | 同上 |
| 落下 | 落下重力倍率 `fallGravityMult=1.65` で急降下 | `src/game/sideScroller.ts:765` |
| ジャンプ | coyote(9f)・バッファ(10f)・変量ジャンプ(0.45) は実装済み | `src/game/sideScroller.ts:726-759` |
| 2回ジャンプ | `doubleJumpVelocity=-610` は定義済みだが**未使用**。2回ジャンプも初回と同じ `jumpVelocity` を使用 | `src/game/sideScroller.ts:741` / `src/data/config/physics.json:9` |
| 空中摩擦 | `airFrictionX=0` は定義済みだが**未使用**（デッド設定） | `src/data/gameBalance.ts:139` |

### 課題（フィール面）

1. **重量感の欠如**: 速度が即座に最大・即座に 0 になるため、キャラが「滑り台の上を滑る」
   ように無機質で、入力への応答が浮いている。
2. **空中の無慣性**: 空中でも地上同様に即座に方向・速度が変わるため、
   「飛び出してから軌道を変える」コミットメント感がない。
3. **デッド設定**: `doubleJumpVelocity` / `airFrictionX` が定義されているが未使用で、
   設計意図（2回ジャンプは弱め・空中は慣性重視）が反映されていない。

## 2. 目的（Goals）

- **G1**: 水平移動に**加速・減速**を導入し、重量感と応答性を両立させる。
- **G2**: **空中制御を地上より弱く**し、慣性（モメンタム）による軌道の変化を実現する。
- **G3**: 2回ジャンプが `doubleJumpVelocity` を使用하도록修正し、デッド設定を解消する。
- **G4**: 新規パラメータはすべて `physics.json` に定義し、コードにマジックナンバーを書かない。
- **G5**: 既存のジャンプフィール（coyote / バッファ / 変量ジャンプ / 急降下）と、
  各ジャンルの既存挙動を**壊さない**（後方互換）。

## 3. 非目的（Non-Goals）

- **NG1**: ジャンプの弧（`jumpVelocity` / `gravity`）の根本変更。
  既存の弧は良好のため、水平方向のフィール改善に集中する。
- **NG2**: 新規移動フィーチャー（ダッシュ / 壁ジャンプ / スライド等）の追加。
  既存フィーチャーはそのまま（ただしそれらと新加速ロジックの共存は保証する）。
- **NG3**: 縦スクロール STG（`scrollAxis === 'y'`）と無重力 STG（`gravity === 0`）の移動変更。
  これらは別モードであり「標準メインキャラ」の範囲外。
- **NG4**: 可動域のクランプ範囲（画面左 38%）の変更。エンドレスランナーとしての設計。
- **NG5**: タッチ / ゲームパッド入力。キーボード入力のまま。
- **NG6**: 各ジャンルの個別移動チューニング。新規パラメータは全水平ジャンル共通のグローバル値。

## 4. 機能要件

| ID | 要件 | 優先度 |
|---|---|---|
| **REQ-MOV-01** | 地上で方向キー押下時、`vx` は目標速度（`±runSpeed`）へ**加速**して近づく。目標を超過しない。 | Must |
| **REQ-MOV-02** | 地上で入力なし時、`vx` は 0 へ**減速**して近づく（即座に 0 にならない）。 | Must |
| **REQ-MOV-03** | 空中での加速・減速は地上より**弱い**（`airAccel < groundAccel`、`airDecel < groundDecel`）。 | Must |
| **REQ-MOV-04** | 方向反転（右移動中に左キー）は即座の反転でなく、減速→加速で滑らかに遷移する。 | Must |
| **REQ-MOV-05** | `auto_run` フィーチャー時、`vx` は常に `+runSpeed` へ加速する（既存挙動を維持）。 | Must |
| **REQ-MOV-06** | `slow_precise` フィーチャー時、目標速度は `runSpeed × slowPreciseRatio` になる（既存挙動を維持）。 | Must |
| **REQ-MOV-07** | ダッシュ中は `_updateDash` が `vx` を設定する（加速ロジックはスキップ）。スライド中も同様に速度維持。 | Must |
| **REQ-MOV-08** | 2回ジャンプ（空中・coyote 外）は `doubleJumpVelocity` を使用。1回ジャンプ・coyote ジャンプは `jumpVelocity` を使用。 | Must |
| **REQ-MOV-09** | 新規パラメータ（`groundAccel` / `groundDecel` / `airAccel` / `airDecel`）を `physics.json` に定義し、`ConfigValidator` / `config-types.ts` / `gameBalance.ts` に反映する。 | Must |
| **REQ-MOV-10** | デッド設定 `airFrictionX` を廃止（参照箇所・型定義・バリデータから除去）。 | Should |
| **REQ-MOV-11** | 加速ロジックは `MovementFeature`（FeatureSystem）内に実装し、エンジン本体（`sideScroller.ts`）の位置積分 `p.x += p.vx*dt` は変更しない。 | Must |

## 5. 受け入れ基準（Acceptance Criteria）

- **AC-1**: 右キー押下から最大速度到達までがフレーム単位で滑らか（即座に `runSpeed` にならない）。
- **AC-2**: 入力解除後、キャラは即座に止まらず数フレームで減速停止する。
- **AC-3**: 空中で方向を変えると、地上より遅く速度が切り替わる（慣性を感じる）。
- **AC-4**: 2回ジャンプの到達高度が 1回ジャンプと明確に異なる（`doubleJumpVelocity` 反映）。
- **AC-5**: 既存の障害物回避（ジャンプ / ダッシュ / スライド）が引き続き機能する（回帰なし）。
- **AC-6**: `npm run typecheck` / `npm run lint` / `npm run validate` / 単体テスト / ビルド が全て成功。
- **AC-7**: Playwright による実機操作確認で、移動フィールが改善され、UI・描画に不具合がない（スクリーンショット確認）。

## 6. 制約（Constraints）

- **C1**: JSON 駆動設計を維持。ルール・数値は `src/data/config/*.json` へ。
- **C2**: マジックナンバー禁止。新規数値は `physics.json` 経由（`PLAYER_PHYSICS` / `PHYSICS`）。
- **C3**: `any` 禁止（ESLint error）。命名規則を遵守（クラス PascalCase 等）。
- **C4**: 重複コード禁止。加速ロジックは 1 箇所に集約（ヘルパー関数化）。
- **C5**: オフライン完全動作を維持（外部依存追加なし）。
- **C6**: `sideScroller.ts` の既存ジャンプ処理（coyote / バッファ / 変量 / 急降下 / 着地スカッシュ）は変更しない。
  変更は「水平速度の算出」に限定。

## 7. 影響範囲（Impact）

- 変更対象ファイル（詳細は設計書参照）:
  - `src/data/config/physics.json`（新規パラメータ追加 / `airFrictionX` 削除）
  - `src/framework/config-types.ts`（型定義）
  - `src/data/gameBalance.ts`（`PLAYER_PHYSICS` マッピング）
  - `src/framework/ConfigValidator.ts`（バリデーション）
  - `src/game/systems/MovementFeature.ts`（加速ロジック実装）
  - `src/game/sideScroller.ts`（2回ジャンプ速度の分岐のみ）
  - `tests/unit/game/`（新規単体テスト）
- 影響を受けるプレイ体験: 全水平スクロール系ジャンル（`base` / `runner` / `rpg` / `dungeon` 等）。
  同一キャラのフィール改善のため、全ジャンルで一貫した改善になる。

## 8. 要確認事項（承認前に決定）

| # | 事項 | 提案 | 理由 |
|---|---|---|---|
| Q1 | 新規パラメータの初期値 | `groundAccel=2600` / `groundDecel=3400` / `airAccel=1500` / `airDecel=600`（px/s²） | 地上は素早い立ち上がり・素早い停止、空中は慣性重視。実機フィール確認で微調整 |
| Q2 | `airFrictionX` の扱い | 廃止（削除） | デッド設定。新 `airAccel`/`airDecel` と概念が被り混乱を招く |
| Q3 | `PhysicsOverride`（バージョン毎物理上書き）への新規パラメータ追加 | **追加しない**（今回はグローバル値のみ） | スコープ管理。必要になったら拡張 |
| Q4 | 縦 STG / 無重力 STG への適用 | 適用しない | 「標準メインキャラ」は水平 base の範囲。別モードは別設計 |
| Q5 | 仕様書の置き場所 | `docs/movement-improvement/` | 正式な仕様書群として `docs/` 配下 |
