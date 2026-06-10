# `src/game/` — ゲームエンジン・エンティティ・フィーチャシステム

Canvas ゲームエンジン本体、エンティティ定義、FeatureSystem 実装を収める。

---

## `sideScroller.ts`

Canvas ゲームエンジン本体。横スクロールと縦スクロールの両モードをサポート。

### クラス `SideScroller`

| メソッド | 概要 |
|---|---|
| `constructor(canvas, rules)` | Canvas と RuntimeRules で初期化 |
| `start(): void` | ゲームループ開始 (requestAnimationFrame) |
| `stop(): void` | ゲームループ停止、イベント解除 |
| `setPaused(v: boolean): void` | 一時停止切替 |
| `updateRules(rules, manual?): void` | ルール更新（learningRules も同期） |
| `getSnapshot(): GameSnapshot` | ゲームスナップショット（距離/スコア/HP/shouldUpdate など） |
| `markUpdated(index: number): void` | 説明書更新完了をマーク |
| `getStats(): ActionStats` | 行動統計を返す |

### インターフェース `GameSnapshot`

| フィールド | 概要 |
|---|---|
| `distance` | 走行距離 px |
| `playScore` | プレイスコア |
| `combo` | 現在コンボ数 |
| `kills` | 撃破数 |
| `exp` | 累積EXP |
| `beatHits` | ビートヒット数 |
| `survivedSec` | 生存時間 秒 |
| `hp`, `maxHp` | HP |
| `dead` | 死亡フラグ |
| `shouldUpdate` | 説明書更新トリガー（null = なし） |
| `statJumps`, `statMoveLeft`, `statMoveRight` | 入力統計 |
| `firstJumpDone` | 最初のジャンプ完了フラグ |

---

## `entities.ts`

ゲームに登場するエンティティの定義。

### クラス・インターフェース

| 型 | 概要 |
|---|---|
| `Rect` | 矩形 (`x`, `y`, `w`, `h`) |
| `Player` | プレイヤー (`x, y, w=36, h=52, vy, vx, onGround, jumpsLeft, invincible, hp, maxHp, exp, airTime, runFrame, landSquash`) |
| `Hazard` | 障害物 (`x, y, w, h, color, glowColor, shape, hp, maxHp, isSafe, pulse, floatAmp`) |
| `HazardShape` | 障害物形状 (`rect`, `spike`, `pillar`, `diamond`) |
| `Bullet` | プレイヤー弾 (`x, y, w=14, h=5, vx, vy, alive, trail[]`) |
| `Item` | アイテム (`x, y, w=22, h=22, type: 'exp' \| 'hp', alive, pulse`) |
| `ScorePopup` | スコアポップアップ (`x, y, text, color, life, vy`) |
| `BeatMarker` | ビートマーカー (`t`, `x`, `strength`) |

### エクスポート関数

| 関数 | 概要 |
|---|---|
| `rectsOverlap(a: Rect, b: Rect, grace?: number): boolean` | 衝突判定（grace付き — デフォルト4px内縮） |

---

## `throwEngine.ts`

投擲エンジン。ドラッグ → 放投 → 物理シミュレーション。

### インターフェース `ThrowState`

| フィールド | 概要 |
|---|---|
| `phase` | `idle`, `dragging`, `flying`, `done` |
| `startX/Y`, `currentX/Y` | ドラッグ座標 |
| `power` | 0〜1 のゲージ値 |
| `manualX/Y`, `vx`, `vy` | 飛行中の位置・速度 |
| `airTime` | 滞空時間 |
| `peakY` | 最高点 |
| `result` | `ThrowResult \| null` |
| `score` | 投擲スコア |

### エクスポート関数

| 関数 | 概要 |
|---|---|
| `createThrowState(): ThrowState` | 初期状態を生成 |
| `onDragStart(state, x, y): void` | ドラッグ開始 |
| `onDragMove(state, x, y): void` | ドラッグ中更新 |
| `onRelease(state): void` | 放投（速度・角度を計算） |
| `updateThrow(state, dt, canvasHeight): void` | 物理更新（重力・空気抵抗） |

---

## `game/systems/` — FeatureSystem 実装

### `index.ts`

全 FeatureSystem を GameRegistry に一括登録。

### `MovementFeature.ts`

**handles:** `auto_run`, `slow_precise`, `double_jump`, `long_air`

- `preUpdate()`: 入力→速度マッピング（横/縦モード両対応）
- `update()`: long_air 中のスコアボーナス
- `onInit()`: double_jump 有効時に jumpsLeft を2に設定

### `ShootFeature.ts`

**handles:** `shoot`, `three_way`, `charge_shot`, `spread_shot`, `enemy_hp`, `bomb`

- `update()`: 弾発射・衝突判定・スコア計算・コンボ管理
- `render()`: 弾の描画
- `onManualUpdated()`: 状態リセット

### `RpgFeature.ts`

**handles:** `hp`, `exp`, `item_pickup`, `shield`

- `onPlayerHit()`: HP 減算・無敵フレーム・シェイク・パーティクル
- `update()`: アイテム収集判定・EXP/HP付与

### `RhythmFeature.ts`

**handles:** `beat_hazard`, `just_input`, `beat_dash`

- `update()`: ビート同期・色反転・ジャスト入力判定
- `render()`: ビートマーカー描画
- `onManualUpdated()`: BPM 変更で状態リセット

### `ExtraMovementFeature.ts`

**handles:** `dash`, `wall_jump`, `slide`, `gravity_flip`, `vertical_scroll`

- **未実装**。有効化時は console.warn で警告。

### `PuzzleFeature.ts`

**handles:** `grid_stop`, `puzzle_solve`

- **未実装**。有効化時は console.warn で警告。

### `SpecialFeature.ts`

**handles:** `stealth_mode`, `time_bonus`, `tower`, `color_touch`, `boss`

- `onSafeHazardTouch()`: color_touch 実装（スコア・消滅・パーティクル）
- `stealth_mode`, `time_bonus`, `tower`, `boss`: **未実装**。有効化時は console.warn で警告。

---

## `game/systems/shootSystem.ts`

射撃システムの純粋関数実装。

### エクスポート関数

| 関数 | 概要 |
|---|---|
| `createShootState(): ShootState` | 射撃状態を初期化 |
| `updateShoot(state, hazards, shootPressed, playerX, playerY, playerH, rules, dt, viewportLeft?, viewportRight?, viewportTop?): ShootResult` | 弾発射・移動・衝突判定・スコア計算 |

### インターフェース

| 型 | 概要 |
|---|---|
| `ShootState` | (`bullets[]`, `kills`, `combo`, `comboTimer`, `shotCooldown`) |
| `ShootResult` | (`scoreGain`, `destroyedHazards[]`, `shotFired`) |

---

## `game/systems/rhythmSystem.ts`

リズムシステムの純粋関数実装。

### エクスポート関数

| 関数 | 概要 |
|---|---|
| `createRhythmState(bpm: number): RhythmState` | リズム状態を初期化 |
| `updateRhythm(state, dt, rules, hazardColors, safeColors): void` | ビート同期・色反転フラグ更新 |
| `evaluateTiming(state, currentMs): number` | 入力のビート一致度を 0〜1 で返す |

### インターフェース

| 型 | 概要 |
|---|---|
| `RhythmState` | (`beatInterval`, `nextBeat`, `beatCount`, `beatMarkers[]`, `beatHazardInverted`, `beatHits`, `justWindowMs`, `lastJustMs`) |
