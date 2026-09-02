# 標準メインキャラ アニメーション改善 — 要件定義書

- ステータス: **Draft（承認待ち）**
- 対象: 標準プレイヤーキャラ（`base` / `runner` ジャンル、スプライト `player_base`）
- 作成日: 2026-09-03
- 関連: [02-design.md](./02-design.md) / [03-test-requirements.md](./03-test-requirements.md)
- 姉妹仕様書: [../movement-improvement/01-requirements.md](../movement-improvement/01-requirements.md)（移動フィール。本仕様は**描画・アニメーション**に限定）

---

## 1. 背景・課題

標準キャラ（`player_base`、27×39 px）のアニメーションは、
`DarkThemePlugin.drawPlayer`（`src/genres/BasePlugin.ts:71-87`）がフレームを選択し、
`SpriteRenderer` が `src/data/sprites/player_base.json` のピクセル配列を描画する構成。

### 現状のフレーム構成

`player_base.json` には **4 フレーム** 定義がある: `idle` / `run_a` / `run_b` / `jump`。

### 現状のフレーム選択ロジック（`BasePlugin.ts:83-85`）

```ts
const frame = onGround
  ? (Math.floor(runCycle * RUN_FRAME_COUNT) % 2 === 0 ? 'run_a' : 'run_b')
  : 'jump'
```

### 課題（アニメーション面）

| # | 課題 | 影響 |
|---|---|---|
| **P1** | **`idle` フレームが未使用**。`onGround` 時は常に `run_a`/`run_b`（走行ポーズ）を表示 | 立ち止まっても「走り途中」の姿勢で固まる。不自然 |
| **P2** | **走行が 2 フレームのみ**（`run_a`/`run_b`） | 走行が硬い・ロボットチック |
| **P3** | **空中が `jump` 1 フレーム**（上昇・落下の区別なし） | 跳躍の弧が表現できない。浮遊感がない |
| **P4** | **向き反転（`flipX`）が未使用**。常に右向き | 左に走っても右を向く。移動方向と体の向きが食い違う |
| **P5** | 着地ポーズがない（スカッシュ演出のみ） | 着地の着実感が弱い（軽微） |

> 補足: `SpriteRenderer` は `flipX` 機能を既に持つ（`SpriteRenderer.ts:25,88`）が、
> どのプラグインからも渡されていない。P4 は「機能はあるが未配線」。

## 2. 目的（Goals）

- **G1**: 静止時は `idle` フレームを表示する（P1 修正）。
- **G2**: 移動方向に応じてキャラの向きを反転させる（P4 修正、`flipX` 配線）。
- **G3**: 走行アニメを **4 フレーム** に拡張し、滑らかな走行を実現する（P2）。
- **G4**: 空中を **上昇（`jump_up`）/ 落下（`jump_fall`）** で分け、跳躍の弧を表現する（P3）。
- **G5**: フレーム選択ロジックを**純粋関数**に抽出し、描画に依存せず単体テスト可能にする。
- **G6**: 新規フレームは既存パレット・サイズ（27×39）・スタイルと整合する。
- **G7**: 既存のスカッシュ＆ストレッチ（着地・急上昇）と無敵点滅は維持。

## 3. 非目的（Non-Goals）

- **NG1**: 他ジャンル（`rpg` / `dungeon` / `hack_slash` 等）の個別キャラのアニメーション変更。
  本仕様は標準キャラ（`player_base`）に限定。ただし設計（`drawPlayer` の状態拡張）は他ジャンルに拡張可能。
- **NG2**: スプライトの解像度・サイズ変更（27×39 を維持）。
- **NG3**: 移動フィール（加速・減速）そのもの。姉妹仕様書 [movement-improvement](../movement-improvement/) の範囲。
  （本仕様の走行アニメは `runCycle` に連動するため、移動フィール改善と相乗効果がある）
- **NG4**: 縦 STG / 無重力 STG などの別モードのキャラ描画。
- **NG5**: 敵・アイテムのスプライト変更。

## 4. 機能要件

| ID | 要件 | 優先度 |
|---|---|---|
| **REQ-ANIM-01** | 地上で `|vx| < idleThreshold` のとき `idle` フレームを表示。 | Must |
| **REQ-ANIM-02** | 地上で `|vx| >= idleThreshold` のとき、`run_a`→`run_b`→`run_c`→`run_d` の **4 フレーム** 走行アニメを表示。 | Must |
| **REQ-ANIM-03** | 空中で `vy < 0`（上昇）のとき `jump_up`、`vy >= 0`（落下）のとき `jump_fall` を表示。 | Must |
| **REQ-ANIM-04** | 最終移動方向が左のとき `flipX` でスプライトを左右反転。`vx≈0` 時は直前の向きを保持。 | Must |
| **REQ-ANIM-05** | フレーム選択ロジックを純粋関数（入力: 状態、出力: フレーム名）として抽出し、描画処理と分離する。 | Must |
| **REQ-ANIM-06** | `player_base.json` に `run_c` / `run_d` / `jump_up` / `jump_fall` フレームを追加（既存パレット・27×39・スタイル整合）。 | Must |
| **REQ-ANIM-07** | `drawPlayer` にアニメ状態（`vx`/`vy`/`onGround`/`runCycle`/`facing`）を渡す仕組みを追加し、**既存プラグインの後方互換を維持**（5 引数実装が引き続き有効）。 | Must |
| **REQ-ANIM-08** | 静止時の微細な呼吸アニメ（`idle_a`/`idle_b`）または着地ポーズ（`land`）を追加。 | Should |
| **REQ-ANIM-09** | `idleThreshold` / 走行フレーム数などの新規定数は `vfx.json`（または定数）で定義し、マジックナンバーを避ける。 | Should |

## 5. 受け入れ基準（Acceptance Criteria）

- **AC-1**: 入力なしで静止すると、キャラは `idle` ポーズ（走り途中でない姿勢）で表示される。
- **AC-2**: 左キーで左に走ると、キャラは左を向いて（左右反転して）走行アニメする。
- **AC-3**: 右に走ると右向き、左に走ると左向きと、移動方向に追従する。
- **AC-4**: 走行中は 4 フレームが循環し、2 フレーム時より滑らかに見える。
- **AC-5**: ジャンプ中は上昇時と落下時でポーズが切り替わる。
- **AC-6**: 既存のジャンプ・スカッシュ・無敵点滅・縦 STG の回転が引き続き機能する（回帰なし）。
- **AC-7**: `npm run typecheck` / `npm run lint` / `npm run validate` / 単体テスト / ビルド が全て成功。
- **AC-8**: Playwright による実機確認で、各状態（静止/走行/上昇/落下/向き）のアニメが正しく表示される（スクリーンショット確認）。

## 6. 制約（Constraints）

- **C1**: スプライトは `src/data/sprites/*.json` のピクセル配列（スキーマ: `schemas/sprite.schema.json`）。
  新規フレームは `frames` に追加するだけ（コード変更不要、`SpriteRenderer` は自動で焼き込む）。
- **C2**: スプライトサイズ 27×39・既存パレット（14 色）を維持。新規色は原則追加しない。
- **C3**: `drawPlayer` のシグネチャ変更は**後方互換**（既存の 5 引数プラグインが壊れない）。
- **C4**: フレーム選択は純粋関数（副作用なし）で、単体テスト可能。
- **C5**: `any` 禁止・命名規則遵守（ESLint）。
- **C6**: 移動フィール仕様書（movement-improvement）と重複しない。本仕様は描画・アニメーションに限定。

## 7. 影響範囲（Impact）

- 変更対象:
  - `src/data/sprites/player_base.json`（新規フレーム追加）
  - `src/genres/BasePlugin.ts`（`DarkThemePlugin.drawPlayer` のフレーム選択・`flipX` 配線）
  - `src/engine/GenrePlugin.ts` / `src/engine/GenrePluginBase.ts`（`drawPlayer` にアニメ状態引数を追加、後方互換）
  - `src/game/sideScroller.ts`（`_drawPlayer` がアニメ状態を構築・渡す、`facing` 追跡）
  - `src/data/config/vfx.json`（`idleThreshold` 等の新規定数、任意）
  - `tests/unit/`（フレーム選択純粋関数の単体テスト）
- 影響を受けるジャンル: `base` / `runner`（`DarkThemePlugin` 共有）。
- 他ジャンルは `drawPlayer` 未変更のため影響なし（NG1）。

## 8. 要確認事項（承認前に決定）

| # | 事項 | 提案 | 理由 |
|---|---|---|---|
| Q1 | 新規フレームの作成方法 | 既存 `idle`/`run_a`/`run_b`/`jump` を土台に、足・体の位相を変えた `run_c`/`run_d`/`jump_up`/`jump_fall` を設計 | 既存スタイルと整合。実装時にピクセル配列を作成 |
| Q2 | 静止判定 `idleThreshold` | 約 `20` px/s（`vfx.json` に定義） | 加速ロジック（姉妹仕様）による微速度ノイズを静止と判定 |
| Q3 | 呼吸アニメ / 着地ポーズ（REQ-ANIM-08） | **Phase 2 で任意追加**（初期は単一 `idle` で可） | 初期スコープを絞る。フィール確認後に判断 |
| Q4 | 他ジャンルへの適用 | **しない**（標準キャラのみ） | NG1。設計は拡張可能だが今回は範囲外 |
| Q5 | 実装フェーズ分割 | Phase 1 = コードのみ（idle 修正・向き反転・既存フレーム）、Phase 2 = 新規フレーム追加 | 新規アートなしで即改善を届け、その後滑らか化 |
