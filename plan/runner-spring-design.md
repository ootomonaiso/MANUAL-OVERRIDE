# Runner ジャンル「バネ（Spring）ハザード」設計・要件定義

- 日付: 2026-09-09
- 対象ブランチ: `feature/runner-genre`
- ステータス: 実装指示済み

## 1. 背景・目的

Runner（エンドレスランナー）ジャンルは既に以下を持っている:

- `RunnerPlugin`（`src/genres/BasePlugin.ts`）— 視覚テーマ（dark テーマ、safe 色はティール `#00cec9`/`#55efc4`）
- `src/data/genres/runner.json` — ジャンル定義（`auto_run` / `double_jump` / `long_air` / `near_miss_combo`）
- 移動系コア機能 — 自動走行、二段ジャンプ、コヨーテタイム、ジャンプバッファ（`MovementFeature` + `sideScroller.ts`）

今回の目的: **バネ（Spring）** という新しい安全ハザードを追加する。
プレイヤーが上から当たると通常のジャンプより大きく弾き上げられる。
これにより「ジャンプの代わりにバネを踏んで高度を得る」というランナーらしい手触りを加える。

## 2. 要件

### 2.1 バネハザード

- 形状ID: `'spring'`（`HazardShape` に追加）
- 常に安全（`isSafe = true`）。**絶対にダメージを与えない**（被弾経路 `_onPlayerHit` を通さない）
- 条件: プレイヤー矩形とバネ矩形が重なっている **かつ** `player.vy >= 0`（落下中 or 静止）
  - 弾かれた直後は `vy < 0` になるため、上昇中は再発動しない（クールダウン不要）
- 発動時の効果:
  1. `player.vy = PLAYER_PHYSICS.springBounceVelocity`（`-950`。通常ジャンプ `-720` より高い）
  2. `player.onGround = false`
  3. `soundManager.onJump()` を再生（専用の SFX JSON は今回は作らない）
  4. バネの上部から上向きにパーティクルを発生（色は `h.glowColor` = ジャンルパレットの safeGlow）
- **ジャンプ状態の決定**: バネ発動時に `jumpsLeft → 0`、`jumpBufferTimer`・`coyoteTimer`・`jumpHeld` をクリアする。
  これによりジャンプ状態マシンが bounce の速度をジャンプ速度で上書き（downgrade）することを防止し、
  `stats.jumps` および `onPlayerJump` フックが発火しないことを保証する（バネは発射源でありジャンプではない）。
- **形状駆動**: `isHazardous()` の判定（beat_hazard 反転含む）**より前**にバネ処理を行う。
  反転ON でもバネは常に「弾く・無傷」のまま（色ではなく形状で意味を持つ）
- 横モード（`_updateHorizontal`）と縦モード（`_updateVertical`）の両方に同じ処理を入れる
  （横モードの collision ループは sideScroller.ts 約 822〜843 行、縦モードは 654〜674 行）
- `stats.jumps++` や `onPlayerJump` フックは**発火させない**（ジャンプ操作ではないため。
  ジャンプ反応系 Feature の二重起動を防ぐ）

### 2.2 パラメータ（JSON駆動・マジックナンバー禁止）

| ファイル | 追加キー | 値 | 備考 |
|---|---|---|---|
| `src/data/config/physics.json` | `springBounceVelocity` | `-950` | 上向き（負） |
| `src/data/config/vfx.json` | `springParticleCount` | `10` | |
| 〃 | `springParticleSpeedMin` / `springParticleSpeedMax` | `60` / `200` | 上向き扇状 |
| 〃 | `springParticleLife` | `0.45` | |
| 〃 | `springParticleSpread` | `2.4` | ラジアン（上向き中心のばらつき幅） |
| 〃 | `springParticleSize` | `3` | |

対応する型・再エクスポート・検証:

| ファイル | 変更 |
|---|---|
| `src/framework/config-types.ts` | `PhysicsConfig` に `springBounceVelocity: number`、`VfxConfig` に springParticle* 6件 |
| `src/data/gameBalance.ts` | `PLAYER_PHYSICS` に `springBounceVelocity: _p.springBounceVelocity` |
| `src/framework/ConfigValidator.ts` | `RANGE_CHECKS` に `{ section: 'physics', field: 'springBounceVelocity', max: 0 }`（上向き=負でなければならない） |

### 2.3 RunnerPlugin スポーンテーブル

`src/genres/BasePlugin.ts` の `RunnerPlugin.spawnTable` に追加:

```ts
{ shape: 'spring', placement: 'ground', weightStart: 0, weightEnd: 2, wRange: [28, 36], hRange: [20, 28], safeChance: 1 }
```

- `weightStart: 0` → ゲーム開始直後には出現しない（distance 3000px までで重み 2 に逓増）
- `safeChance: 1` → **常に `isSafe = true`** で出現（_spawnHazard の安全色経路を通る。
  ティール系で描画され、「安全色=触れてよい」という既存の視覚言語と一致する）
- `hRange: [20, 28]` → プレイヤー高さ（52）より低い。通常ジャンプ（跳ね約162px）で余裕で越えられる

### 2.4 描画

- `_drawHazard` の switch に専用分岐は**追加しない**。default の rect 経路で描画（安全色で十分読める）
- 将来改善候補: コイル状の専用 `_drawSpring`（ドキュメントの「今後の改善候補」に明記）

### 2.5 設計判断の記録

1. **バネ判定の位置**: 衝突ループ内・`isHazardous()` の直前。`continue` で被弾・safe-touch の
   両方を経由しない（NearMissComboFeature は `world.hazards` を直接走査するため影響なし）。
2. **無敵時間中のバネ**: 現状ループは `p.invincible <= 0` ガード内にあるため、無敵中はバネが
   効かない。Runner には hp feature がなく一撃で終わるため許容する（最小差分優先）。
   ドキュメントの「実装上の注意点」に明記すること。
3. **専用 SFX なし**: `onJump()` を流用（タスク指示どおり）。専用 JSON は後回し。

## 3. ドキュメント

### 3.1 `docs/genre/runner-genre.md`（新規作成）

> 注: 既存の `Runner.md` はリポジトリに存在しないため、「移動」ではなく新規作成する。

`docs/genre/tetris-genre.md` と同じ形式で**実装を記録**する（設計ではなく実際の実装）。
最低限以下のセクション:

- 概要
- アーキテクチャ（ファイル構成: entities.ts / physics.json / vfx.json / gameBalance.ts /
  config-types.ts / ConfigValidator.ts / sideScroller.ts / BasePlugin.ts / runner.json）
- ジャンル収束条件（`runner.json` の `thresholds: { tempo: 8 }`、tempo を加算するカード例:
  `c-tempo-smooth` +2 / `c-tempo-speed` +3 / `c-rhythm-beat` +1 等）
- ゲーム仕様（操作: 自動走行 + Space ジャンプ/二段ジャンプ。コヨーテ/バッファ。
  long_air スコア。near_miss_combo。**バネの挙動と数値**）
- 実装上の注意点（§2.5 の設計判断 + `isSafe`/`safeChance` の関係 + 無敵時間中の非動作）
- テスト（§4 のテスト一覧と結果）

### 3.2 `docs/genre/README.md`

ドキュメント一覧の表に `runner` の行を追加:
`| runner | [runner-genre.md](./runner-genre.md) | エンドレスランナー（自動走行・二段ジャンプ・バネ） |`

## 4. テスト

### 4.1 ユニットテスト `tests/unit/game/SpringFeature.test.ts`（新規）

パターン参照: `tests/unit/game/multiHitGuard.test.ts`
（`new SideScroller(canvas, rules)` + private メソッド呼び出し。
`any` を使わず、`scroller as unknown as { ... }` の型付きキャストで private へアクセスする）

必須テスト:

1. **バネがプレイヤーを弾く**: 落下中（`vy > 0`）or 接地でバネと重なったプレイヤーが
   `_updateHorizontal` 1 フレーム後に `vy === PLAYER_PHYSICS.springBounceVelocity`、
   `onGround === false` になる
2. **バネはプレイヤーにダメージを与えない**: バネと重なる状態で `_updateHorizontal` を実行しても
   `stats.collisions === 0`、`dead === false`、HP 変化なし
3. **バネの跳ね速度は通常ジャンプより高い**:
   `PLAYER_PHYSICS.springBounceVelocity < PLAYER_PHYSICS.jumpVelocity`
   （つまり絶対値で 950 > 720）

追加テスト（推奨・実装容易なもの):

4. 上昇中（`vy < 0`）のバネは再発動しない
5. 縦モード（`_updateVertical`）でもバネが弾く

### 4.2 検証コマンド

- `npx vitest run`（全ユニットテストが通ること）
- `npm run build`（vue-tsc + vite build）
- `npm run lint`
- `npm run validate`

### 4.3 視覚確認（実装後の検証フェーズで実施）

- dev サーバ起動（`DEBUG_MODE = import.meta.env.DEV` で dev 環境ではデバッグパネル出現）
- デバッグパネルの `force genre` で `runner` を強制
- スpring（ティール色の矩形）が地面に出現すること、プレイヤーが踏むと高く弾かれることを
  スクリーンショット/動画で確認

## 5. 変更ファイル一覧（想定）

| ファイル | 種別 |
|---|---|
| `src/game/entities.ts` | 修改（`HazardShape` に `'spring'`） |
| `src/data/config/physics.json` | 修改（`springBounceVelocity: -950`） |
| `src/data/config/vfx.json` | 修改（springParticle* 6件） |
| `src/framework/config-types.ts` | 修改（PhysicsConfig / VfxConfig） |
| `src/data/gameBalance.ts` | 修改（PLAYER_PHYSICS） |
| `src/framework/ConfigValidator.ts` | 修改（RANGE_CHECKS 1件） |
| `src/game/sideScroller.ts` | 修改（横/縦 collision ループ + `_onSpringBounce` ヘルパー） |
| `src/genres/BasePlugin.ts` | 修改（RunnerPlugin.spawnTable 1行） |
| `tests/unit/game/SpringFeature.test.ts` | 新規 |
| `docs/genre/runner-genre.md` | 新規 |
| `docs/genre/README.md` | 修改（索引1行） |

## 6. コーディング規約（再確認）

- `any` 型禁止（ESLint `@typescript-eslint/no-explicit-any`: error。テストも `any` 不使用）
- ソース内の数値リテラル禁止 → 必ず JSON 設定経由（`PLAYER_PHYSICS` / `VFX`）
- 重複ロジック（横/縦で同じバネ処理）は `_onSpringBounce` ヘルパーに抽出
- コメントは「なぜ」だけ。命名規則は既存に従う（private は `_` プレフィックス）
