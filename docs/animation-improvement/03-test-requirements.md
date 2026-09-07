# 標準メインキャラ アニメーション改善 — テスト要件定義

- ステータス: **Draft（承認待ち）**
- 上位文書: [01-requirements.md](./01-requirements.md) / [02-design.md](./02-design.md)
- 作成日: 2026-09-03

---

## 1. テスト方針

| レイヤ | ツール | 対象 |
|---|---|---|
| 単体テスト | Vitest（`npm run test:unit:ci`） | フレーム選択純粋関数 `selectPlayerFrame` |
| 設定整合 | `npm run validate`（`scripts/validate-json.mjs`） | `player_base.json` のスキーマ検証 |
| 統合 / E2E | Playwright（`npm run test`） | 実機での各状態アニメ |
| フィール確認 | Playwright + スクリーンショット | 静止/走行/上昇/落下/向きの視覚検証（AC-8） |

- フレーム選択は**純粋関数**（`selectPlayerFrame`）に抽出するため、描画（Canvas）に依存せず
  単体テスト可能（REQ-ANIM-05 / C4）。
- スプライトのピクセルアートの「見た目」は単体テストでは検証できないため、
  フィール確認（§5）でスクリーンショットにより検証する。

## 2. 単体テスト要件（`tests/unit/game/playerBaseAnim.test.ts`）

> `selectPlayerFrame(s: PlayerAnimState): string` を直接呼び、戻り値（フレーム名）をアサートする。
> `PlayerAnimState` は `{ vx, vy, onGround, runCycle, facing }` のリテラルで生成。

### 2.1 静止・走行（REQ-ANIM-01 / 02）

| ID | 入力 | 期待 | 対応 |
|---|---|---|---|
| **AT-01** | `{ onGround:true, vx:0, vy:0, runCycle:0, facing:1 }` | `'idle'` | REQ-ANIM-01 |
| **AT-02** | `{ onGround:true, vx:10, vy:0, runCycle:0, facing:1 }`（`< idleThreshold`） | `'idle'` | REQ-ANIM-01 |
| **AT-03** | `{ onGround:true, vx:240, vy:0, runCycle:0.0, facing:1 }` | `'run_a'` | REQ-ANIM-02 |
| **AT-04** | `{ onGround:true, vx:240, vy:0, runCycle:0.25, facing:1 }` | `'run_b'` | REQ-ANIM-02 |
| **AT-05** | `{ onGround:true, vx:240, vy:0, runCycle:0.5, facing:1 }` | `'run_c'` | REQ-ANIM-02 |
| **AT-06** | `{ onGround:true, vx:240, vy:0, runCycle:0.75, facing:1 }` | `'run_d'` | REQ-ANIM-02 |
| **AT-07** | `{ onGround:true, vx:240, vy:0, runCycle:1.0, facing:1 }`（循環） | `'run_a'` | REQ-ANIM-02 |
| **AT-08** | `{ onGround:true, vx:-240, vy:0, runCycle:0.0, facing:-1 }`（左走行） | `'run_a'`（フレームは速度絶対値で判定） | REQ-ANIM-02 |

### 2.2 空中（REQ-ANIM-03）

| ID | 入力 | 期待 | 対応 |
|---|---|---|---|
| **AT-09** | `{ onGround:false, vx:0, vy:-400, runCycle:0, facing:1 }`（上昇） | `'jump_up'` | REQ-ANIM-03 |
| **AT-10** | `{ onGround:false, vx:0, vy:0, runCycle:0, facing:1 }`（頂点・vy=0） | `'jump_fall'` | REQ-ANIM-03 |
| **AT-11** | `{ onGround:false, vx:0, vy:400, runCycle:0, facing:1 }`（落下） | `'jump_fall'` | REQ-ANIM-03 |

### 2.3 境界・フォールバック（REQ-ANIM-07）

| ID | シナリオ | 期待 | 対応 |
|---|---|---|---|
| **AT-12** | `idleThreshold` 境界（`vx = idleThreshold` ちょうど） | 走行側（`run_a`）に分類（`<` 判定のため） | REQ-ANIM-01 |
| **AT-13** | `runCycle` が負/大きな値 | `% length` で 0〜3 の範囲に収まるフレームを返す | REQ-ANIM-02 |
| **AT-14** | `DarkThemePlugin.drawPlayer` に `animState` 未渡し | フォールバック（`idle`/`run_a`）で例外なく描画 | REQ-ANIM-07 |

## 3. 設定・スプライト整合テスト

| ID | シナリオ | 期待 | 対応 |
|---|---|---|---|
| **AT-15** | `player_base.json` に `run_c`/`run_d`/`jump_up`/`jump_fall` が存在 | `npm run validate` がスキーマ検証に成功（27×39・パレット整合） | REQ-ANIM-06 |
| **AT-16** | 新規フレームの各行列が 27 文字・全 39 行 | スキーマの `w`/`h` と一致（validate 成功） | REQ-ANIM-06 / C2 |
| **AT-17** | 新規フレームに既存パレット外の文字が使われていない | validate 成功（未定義パレット文字は描画されない・警告） | C2 |

## 4. 統合 / E2E テスト要件（Playwright）

> 既存の `tests/smoke.spec.ts` / `tests/tetris.spec.ts` を参照し、
> ゲーム起動→入力→スクリーンショット/状態確認のパターンを流用する。

| ID | シナリオ | 期待 | 対応 |
|---|---|---|---|
| **IT-01** | 起動後無入力（静止） | キャラが `idle` ポーズ（走り途中でない姿勢）で表示 | AC-1 / REQ-ANIM-01 |
| **IT-02** | 右キー押下で右走行 | 右向きで 4 フレーム走行アニメ | AC-2/4 / REQ-ANIM-02 |
| **IT-03** | 左キー押下で左走行 | **左向き（左右反転）**で走行アニメ | AC-3 / REQ-ANIM-04 |
| **IT-04** | 右走行中→左キーへ切替 | 向きの切替が即座でなく、減速（姉妹仕様）と連動して自然に反転 | REQ-ANIM-04 |
| **IT-05** | ジャンプキー押下（上昇） | `jump_up` ポーズ | AC-5 / REQ-ANIM-03 |
| **IT-06** | ジャンプ頂点以降（落下） | `jump_fall` ポーズに切替 | AC-5 / REQ-ANIM-03 |
| **IT-07** | 着地 | スカッシュ演出が維持され、`idle`/走行へ復帰 | AC-6 / G7 |
| **IT-08** | 被弾（無敵時間） | 無敵点滅が維持される | AC-6 / G7 |

## 5. フィール確認（主観的検証 / AC-8）

> ピクセルアートの「見た目」は数値テストでは捕捉できないため、実機 + スクリーンショットで確認する。

- **手順**:
  1. `npm run dev`（バックグラウンド起動、ログはファイルへ、PID 記録）。
  2. Playwright でゲーム起動、標準キャラ（base）で操作。
  3. 以下をスクリーンショットで確認:
     - 静止時の `idle` ポーズ（AC-1）
     - 左右の向き反転（AC-2/3）
     - 4 フレーム走行の滑らかさ（AC-4）
     - 上昇/落下のポーズ切替（AC-5）
  4. アニメが不自然な場合、`player_base.json` の新規フレームを調整し再確認。
  5. 走行速度感が速すぎる場合、`vfx.json` の `runCycleRate` を微調整。
- **判定**: 各状態のアニメが自然で、既存より滑らか・意図が伝わることを確認。
- **後始末**: 確認後に dev サーバーを停止（起動したプロセスを kill）。
- **スクリーンショット保存先**: `tmp/`（リポジトリ直下には置かない）。

## 6. 回帰スコープ

- **対象ジャンル**: `base` / `runner`（`DarkThemePlugin` 共有）。
- **非対象（影響なしを確認）**: 他ジャンル（`rpg`/`dungeon`/`hack_slash` 等）は `drawPlayer` 未変更。
  代表 1 ジャンルで「キャラ描画が従来通り」を確認。
- **維持すべき演出**: スカッシュ＆ストレッチ / 無敵点滅 / 縦 STG 回転 / 影。
- **CI**: `npm run ci`（typecheck / lint / validate / check-doc-links / test:features / build / bundle-size / test:unit:ci）が全て成功。

## 7. Definition of Done（テスト観点）

- [ ] 単体テスト AT-01〜AT-14（`selectPlayerFrame`）が全て実装され、成功。
- [ ] `player_base.json` の新規フレームが `npm run validate` に合格（AT-15〜AT-17）。
- [ ] 統合テスト IT-01〜IT-08 が全て実装され、成功。
- [ ] フィール確認（§5）が完了し、スクリーンショットを `tmp/` に保存。
- [ ] `npm run ci` が成功。
- [ ] 回帰スコープ（§6）で他ジャンル・既存演出に不具合がないことを確認。
- [ ] Phase 1（idle 修正・向き反転）と Phase 2（4 フレーム・上昇/落下）がそれぞれフィール確認済み。
