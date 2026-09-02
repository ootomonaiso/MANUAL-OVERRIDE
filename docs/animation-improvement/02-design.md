# 標準メインキャラ アニメーション改善 — 設計書

- ステータス: **Draft（承認待ち）**
- 上位文書: [01-requirements.md](./01-requirements.md)
- 作成日: 2026-09-03

---

## 1. 現状分析（As-Is）

### 1.1 描画フロー

```
[SideScroller._drawPlayer]  (sideScroller.ts:1131)
   │  無敵点滅 / スカッシュ＆ストレッチ / 縦STG回転 を ctx に適用
   │  getGenre(genre).drawPlayer(ctx, p.w, p.h, p.onGround, this.runCycle)
   ▼
[DarkThemePlugin.drawPlayer]  (BasePlugin.ts:71)   ← base / runner 共有
   │  frame = onGround ? (runCycle*2 %2 ? run_b : run_a) : jump
   │  px.sprite('player_base', 0, 0, w, h, { frame })   ← flipX 未使用
   ▼
[SpriteRenderer.draw]  (render/SpriteRenderer.ts)
   │  player_base.json の frames[frame] をオフスクリーンに焼き込み drawImage
   ▼
  描画完了
```

- `runCycle` は `sideScroller.ts:632/700` で `|vx| * dt * VFX.runCycleRate` だけ増加（速度連動）。
- スプライト `player_base.json`: 27×39、4 フレーム（`idle`/`run_a`/`run_b`/`jump`）、14 色パレット。
- `SpriteRenderer` は `flipX` 対応済み（`SpriteRenderer.ts:88`）だが未配線。

### 1.2 現状のフレーム選択（`BasePlugin.ts:83-85`）

```ts
const frame = onGround
  ? (Math.floor(runCycle * RUN_FRAME_COUNT) % 2 === 0 ? 'run_a' : 'run_b')
  : 'jump'
```

- `idle` フレームは未使用（P1）。
- 向き・上昇/落下の区別なし（P3/P4）。

## 2. 設計方針（To-Be）

### 2.1 アニメ状態の導入

`drawPlayer` に**アニメ状態**を渡し、フレーム選択と向き反転を状態から決定する。

```ts
// 新規: src/engine/GenrePlugin.ts（または engine/types.ts）
export interface PlayerAnimState {
  vx: number        // 水平速度 px/s（向き・静止/走行判定）
  vy: number        // 垂直速度 px/s（上昇/落下判定）
  onGround: boolean // 接地フラグ
  runCycle: number  // 走行アニメ位相（0〜1 繰り返し、速度連動）
  facing: 1 | -1    // 最終移動方向（1=右, -1=左）。vx≈0 時は保持
}
```

### 2.2 `drawPlayer` シグネチャの拡張（後方互換）

```ts
// GenrePlugin.ts / GenrePluginBase.ts
drawPlayer(
  ctx: CanvasRenderingContext2D,
  w: number, h: number,
  onGround: boolean,
  runCycle: number,
  animState?: PlayerAnimState,   // ← 追加（任意）
): void
```

- **後方互換の根拠**: TypeScript では、抽象/インターフェースのメソッドより**引数が少ない**
  具体実装は有効。既存の 5 引数プラグイン（`rpg`/`dungeon` 等）は変更不要。
- `_drawPlayer` は 6 引数で呼び出す（5 引数プラグインは 6 引数を無視）。

### 2.3 フレーム選択ロジック（純粋関数化）

フレーム選択を**純粋関数**に抽出し、描画と分離（REQ-ANIM-05 / C4）。

```ts
// 新規: src/genres/playerBaseAnim.ts（または BasePlugin.ts 内のエクスポート関数）
export const RUN_FRAMES = ['run_a', 'run_b', 'run_c', 'run_d'] as const
const IDLE_SPEED_THRESHOLD = 20   // px/s（vfx.json 化推奨）

export function selectPlayerFrame(s: PlayerAnimState): string {
  if (!s.onGround) {
    return s.vy < 0 ? 'jump_up' : 'jump_fall'
  }
  if (Math.abs(s.vx) < IDLE_SPEED_THRESHOLD) {
    return 'idle'
  }
  const idx = Math.floor(s.runCycle * RUN_FRAMES.length) % RUN_FRAMES.length
  return RUN_FRAMES[idx]
}
```

**状態 → フレーム 対応表**:

| 状態 | 条件 | フレーム |
|---|---|---|
| 静止 | `onGround && |vx| < 20` | `idle` |
| 走行 | `onGround && |vx| >= 20` | `run_a`→`run_b`→`run_c`→`run_d`（`runCycle` 連動） |
| 上昇 | `!onGround && vy < 0` | `jump_up` |
| 落下 | `!onGround && vy >= 0` | `jump_fall` |

### 2.4 `DarkThemePlugin.drawPlayer` の新実装

```ts
drawPlayer(ctx, w, h, onGround, runCycle, animState?): void {
  const px = new PixelCanvas(ctx)
  px.ellipse(w / 2, h + 2, w * 0.4, 4, 'rgba(0,0,0,0.25)')  // 影（維持）

  const s: PlayerAnimState = animState ?? {
    vx: 0, vy: 0, onGround, runCycle, facing: 1,
  }
  const frame = selectPlayerFrame(s)
  const flipX = s.facing === -1
  px.sprite('player_base', 0, 0, w, h, { frame, flipX })
}
```

- `animState` 未渡しのフォールバック（後方互換・単体テスト用）を保持。
- スカッシュ＆ストレッチ・無敵点滅・縦 STG 回転は `_drawPlayer` 側で**維持**（変更しない）。

### 2.5 向き（`facing`）の追跡

`facing` は `vx≈0` 時にも直前方向を保持するため、状態として追跡する。

- **追跡場所**: `sideScroller.ts` のフィールド（`private facing: 1 | -1 = 1`）。
- **更新**: `_updateHorizontal`（または `_drawPlayer` 直前）で、
  `if (p.vx > FACING_DEADZONE) this.facing = 1; else if (p.vx < -FACING_DEADZONE) this.facing = -1`
  （`FACING_DEADZONE` ≈ `20` px/s、`idleThreshold` と同値で整合）。
- `animState.facing` に渡す。

### 2.6 `_drawPlayer` の変更

```ts
// sideScroller.ts:1160 付近
const animState: PlayerAnimState = {
  vx: p.vx, vy: p.vy, onGround: p.onGround,
  runCycle: this.runCycle, facing: this.facing,
}
getGenre(this.rules.genre).drawPlayer(ctx, p.w, p.h, p.onGround, this.runCycle, animState)
```

## 3. 新規スプライトフレーム（player_base.json）

### 3.1 追加フレーム（REQ-ANIM-06）

| フレーム | 意図 | 設計指針 |
|---|---|---|
| `run_c` | 走行 4 フレームの 3 枚目（逆足接地） | `run_a` の左右対称的な足位相。体は前傾維持 |
| `run_d` | 走行 4 フレームの 4 枚目（足が揃う通過位相） | `run_b` と同様の通過位相（脚が体下面に寄る） |
| `jump_up` | 上昇（跳躍直後） | 脚を引き気味に伸ばし、体を少し上へ。`jump` より伸びた姿勢 |
| `jump_fall` | 落下 | 脚を前に出し着地準備。`jump` より脚が開いた姿勢 |

- 全て **27×39・既存 14 色パレット**で設計（C2）。新規色は追加しない。
- 既存 `idle`/`run_a`/`run_b`/`jump` は**維持**（フォールバック・他参照用）。
- `SpriteRenderer` は `frames` に追加するだけで自動焼き込み（C1、コード変更不要）。

### 3.2 任意追加（REQ-ANIM-08、Phase 2 判断）

| フレーム | 意図 |
|---|---|
| `idle_a` / `idle_b` | 呼吸アニメ（胸の上下 1px 程度）。静止時の生命感 |
| `land` | 着地ポーズ（しゃがみ気味）。スカッシュ演出と併用 |

> 初期（Phase 1〜2）は単一 `idle` で可。フィール確認後に追加判断（Q3）。

## 4. 実装フェーズ分割（Q5）

| フェーズ | 内容 | 新規アート | 成果 |
|---|---|---|---|
| **Phase 1** | `idle` 修正（REQ-ANIM-01）・向き反転（REQ-ANIM-04）・`animState` 導入（REQ-ANIM-07）・フレーム選択純粋関数（REQ-ANIM-05）。走行は既存 `run_a`/`run_b`、空中は既存 `jump` | なし | 静止ポーズ修正・向き追従（即効性） |
| **Phase 2** | 4 フレーム走行（REQ-ANIM-02）・上昇/落下（REQ-ANIM-03）。`run_c`/`run_d`/`jump_up`/`jump_fall` 追加（REQ-ANIM-06） | 4 フレーム | 滑らかな走行・跳躍の弧 |
| **Phase 3**（任意） | 呼吸アニメ / 着地ポーズ（REQ-ANIM-08） | 2〜3 フレーム | 生命感・着地感 |

> Phase 1 は新規アートなしで P1/P4 を解消し、即座に改善を届ける。
> Phase 2 で P2/P3 を解消。各フェーズでフィール確認（AC-8）。

## 5. 変更ファイル一覧

| ファイル | 変更内容 | フェーズ |
|---|---|---|
| `src/engine/GenrePlugin.ts` | `PlayerAnimState` 定義、`drawPlayer` に `animState?` 追加 | 1 |
| `src/engine/GenrePluginBase.ts` | 抽象 `drawPlayer` に `animState?` 追加 | 1 |
| `src/genres/playerBaseAnim.ts`（新規） | `selectPlayerFrame` 純粋関数・`RUN_FRAMES` | 1 |
| `src/genres/BasePlugin.ts` | `DarkThemePlugin.drawPlayer` を新実装に置換（`selectPlayerFrame` + `flipX`） | 1 |
| `src/game/sideScroller.ts` | `facing` 追跡、`_drawPlayer` が `animState` を構築・渡す | 1 |
| `src/data/sprites/player_base.json` | `run_c`/`run_d`/`jump_up`/`jump_fall` 追加 | 2 |
| `src/data/config/vfx.json` | `idleThreshold`（任意、定数でも可） | 1 |
| `tests/unit/game/playerBaseAnim.test.ts`（新規） | `selectPlayerFrame` の単体テスト | 1 |

## 6. エッジケース・既存演出との共存

| 状況 | 挙動 | 対応 |
|---|---|---|
| スカッシュ＆ストレッチ（着地・急上昇） | `_drawPlayer` の `ctx.scale` で維持 | 変更しない（G7）。フレームと併用 |
| 無敵点滅 | `_drawPlayer` の `invincible` 判定で維持 | 変更しない |
| 縦 STG 回転 | `_drawPlayer` の `-90°` 回転で維持 | 変更しない。`flipX` との干渉を確認（回転後に反転） |
| 加速ロジック（姉妹仕様） | `runCycle` が速度連動のため、加速時に走行アニメも加速 | 相乗効果。`runCycleRate` をフィール確認で微調整 |
| `runCycleRate`（0.006） | 4 フレーム化で 1 フレーム表示時間が半分になる | 走行速度感が速く感じる場合、`vfx.json` で微調整 |
| `animState` 未渡し（他プラグイン/テスト） | フォールバックで `idle`/`run_a` | 後方互換維持 |

## 7. リスク

- **RISK-1**: 新規フレーム（`run_c`/`run_d`/`jump_up`/`jump_fall`）のピクセルアートの品質。
  → 既存フレームを土台に位相だけ変え、フィール確認（AC-8）で反復調整。
- **RISK-2**: 4 フレーム化で走行アニメが速く見える。
  → `runCycleRate` を `vfx.json` で調整（コード変更不要）。
- **RISK-3**: `flipX` と縦 STG 回転の干渉。
  → 縦 STG は NG4（対象外）だが、`_drawPlayer` の回転と `flipX` の順序を確認して不自然にならないよう検証。
- **RISK-4**: `facing` 追跡のデッドゾーンが不適切で「向きが頻繁に切替わる」。
  → `FACING_DEADZONE` を `idleThreshold` と同値（20 px/s）で整合。フィール確認で調整。

## 8. 実装順序（Implementer 向け）

**Phase 1**:
1. `PlayerAnimState` を `engine/GenrePlugin.ts` に定義。
2. `GenrePlugin.ts` / `GenrePluginBase.ts` の `drawPlayer` に `animState?` を追加。
3. `playerBaseAnim.ts` に `selectPlayerFrame` を実装（純粋関数）。
4. `BasePlugin.ts` の `DarkThemePlugin.drawPlayer` を新実装に置換。
5. `sideScroller.ts` で `facing` を追跡し、`_drawPlayer` が `animState` を渡す。
6. 単体テスト（`selectPlayerFrame`）を作成。
7. `npm run typecheck && npm run lint && npm run validate && npm run test:unit:ci && npm run build`。
8. Playwright で静止・向きを確認（スクリーンショット）。

**Phase 2**:
9. `player_base.json` に `run_c`/`run_d`/`jump_up`/`jump_fall` を追加（既存スタイル整合）。
10. `selectPlayerFrame` が新フレームを参照するよう確認（`RUN_FRAMES` 4 枚・`jump_up`/`jump_fall`）。
11. `npm run validate`（スプライトスキーマ検証）+ ビルド + Playwright で走行・跳躍を確認。
12. フィール確認で `runCycleRate` を微調整（必要なら）。
