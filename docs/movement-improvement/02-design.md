# 標準メインキャラ 移動フィール改善 — 設計書

- ステータス: **Draft（承認待ち）**
- 上位文書: [01-requirements.md](./01-requirements.md)
- 作成日: 2026-09-03

---

## 1. 現状分析（As-Is）

### 1.1 水平移動のデータフロー

```
[InputManager] ──keys/justPressed──▶ [MovementFeature.preUpdate]
                                          │  p.vx = ±runSpeed / 0   ← 即座設定（重量感なし）
                                          ▼
                              [SideScroller._updateHorizontal]
                                          │  p.x += p.vx * dt        ← 位置積分（変更しない）
                                          │  p.x = clamp(playerMinX, W*playerMaxXRatio)
                                          ▼
                                       描画
```

- 速度の算出は `MovementFeature.preUpdate`（FeatureSystem）が担当。
- 位置積分 `p.x += p.vx * dt` と可動域クランプは `sideScroller.ts` が担当。
- この分離は維持する。**変更するのは「速度の算出」のみ**。

### 1.2 現状の速度算出（`MovementFeature.ts:86-92`）

```ts
} else if (this.dash.timer <= 0 && !this.slide.active) {
  // ダッシュ中は _updateDash が vx を設定済み、スライド中は速度維持
  const isAutoRun = r.features.has('auto_run')
  p.vx = (isAutoRun || input.keys.has(r.controls.moveRight)) ? runSpeed
       : input.keys.has(r.controls.moveLeft) ? -runSpeed
       : 0
}
```

- `runSpeed` は `slow_precise` 時 `× slowPreciseRatio`（`MovementFeature.ts:77-79`）。
- ダッシュ / スライド中はこの分岐に入らず、各フィーチャーが `vx` を支配。

### 1.3 現状のジャンプ（`sideScroller.ts:721-801`）

- coyote(`coyoteFrames=9`)・バッファ(`jumpBufferFrames=10`)・変量ジャンプ(`jumpCutMultiplier=0.45`)・
  急降下(`fallGravityMult=1.65`)・着地スカッシュ は実装済み。**これらは変更しない**。
- 2回ジャンプ: `jumpsLeft` が最大 2 だが、ジャンプ速度は常に `jumpVelocity`（`sideScroller.ts:741`）。
  `doubleJumpVelocity` は未使用。

## 2. 設計方針（To-Be）

### 2.1 核心: 目標速度への加速・減速

「即座に `vx` を設定する」を「**目標速度 `targetVx` に向かって `vx` を加速・減速する**」に置き換える。

- 地上: 強い加速・減速（素早い立ち上がり・素早い停止 → 重量感と応答性）
- 空中: 弱い加速・減速（慣性 → コミットメント感・ふわっとした軌道）

### 2.2 加速ロジック（アルゴリズム）

```
applyHorizontalControl(p, targetVx, dt):
  onGround = p.onGround
  accel =
    if onGround: (targetVx != 0) ? groundAccel : groundDecel
    else:        (targetVx != 0) ? airAccel    : airDecel

  if targetVx != 0:
    # 目標へ加速（超過しない）
    if p.vx < targetVx: p.vx = min(targetVx, p.vx + accel * dt)
    else:               p.vx = max(targetVx, p.vx - accel * dt)
  else:
    # 0 へ減速（超過しない）
    if p.vx > 0: p.vx = max(0, p.vx - accel * dt)
    else:        p.vx = min(0, p.vx + accel * dt)
```

**挙動の検証**:

| 状況 | 結果 |
|---|---|
| 静止→右押下 | `vx` が `0 → +runSpeed` へ滑らかに加速（`groundAccel`） |
| 右移動中→入力解除 | `vx` が `+runSpeed → 0` へ減速（`groundDecel`） |
| 右移動中→左押下 | `vx` が `+runSpeed → -runSpeed` へ「減速→反転→加速」（即座反転しない） |
| 空中で右押下 | 地上より遅く `+runSpeed` へ加速（`airAccel`） |
| 空中で入力解除 | 緩やかに 0 へ（`airDecel`、慣性で滑る） |
| `auto_run` | `targetVx` 常に `+runSpeed` → 常に加速 |
| ダッシュ中 / スライド中 | 分岐に入らず `vx` を維持（既存） |

### 2.3 実装場所

- `applyHorizontalControl` は `MovementFeature` の**プライベートヘルパー**（`_applyHorizontalControl`）として実装。
  - 理由: 速度算出は移動フィーチャーの責務（C4 重複排除 / アーキテクチャ整合）。
  - `sideScroller.ts` の位置積分 `p.x += p.vx * dt` は**変更しない**（C6）。
- 呼び出しは `MovementFeature.preUpdate` の速度マッピング分岐内（`this.dash.timer <= 0 && !this.slide.active` 時）。
  - `dt` は `preUpdate` の引数から取得。
  - 地上/空中判定は `p.onGround`（**前フレーム値**）を使用。
    - 注記: `preUpdate` は `_updateHorizontal`（`onGround` を更新）より前に走るため、
      ジャンプ開始フレーム・着地フレームは 1 フレーム遅れの判定になる。
      移動フィールへの影響は知覚できない範囲（ゲーム開発の標準的な慣行）。

### 2.4 `p.onGround` の前フレーム使用に関する注意

- 加速ロジックは `preUpdate` で `p.onGround`（前フレーム）を読む。
- 着地した直後の 1 フレームは「空中減速」が適用されるが、影響は微小。
- 逆に、この 1 フレーム差により「着地瞬間の減速が緩くなる」ことはなく、
  着地フレームは `_updateHorizontal` で `onGround=true` になるため次フレームから地上減速。
- 特段の対策は不要。**テストで「着地後の減速が地上減速になる」ことを確認する**。

## 3. 新規パラメータ（physics.json）

### 3.1 追加

| キー | 初期値 | 単位 | 意味 | 制約 |
|---|---|---|---|---|
| `groundAccel` | `2600` | px/s² | 地上・目標速度への加速 | `> 0` |
| `groundDecel` | `3400` | px/s² | 地上・入力なし時の減速（停止） | `> 0` |
| `airAccel` | `1500` | px/s² | 空中・目標速度への加速（地上より弱く） | `> 0` |
| `airDecel` | `600` | px/s² | 空中・入力なし時の減速（慣性重視で緩やか） | `> 0` |

**初期値の根拠**（`runSpeed=240` px/s 基準）:

| パラメータ | 0→240 到達時間 | 240→0 停止時間 | 意図 |
|---|---|---|---|
| `groundAccel=2600` | ≈0.09s | — | 素早い立ち上がり（重いが遅くない） |
| `groundDecel=3400` | — | ≈0.07s | 加速より速い停止（回避の応答性） |
| `airAccel=1500` | ≈0.16s | — | 地上より遅い（空中のコミットメント感） |
| `airDecel=600` | — | ≈0.40s | 緩やか（空中の慣性・ふわ感） |

> **注**: 初期値は設計上の妥当値。**実装時のフィール確認（AC-7 / Playwright）で微調整**する。
> 調整は `physics.json` の数値変更のみで完結（コード変更不要、C1/C2）。

### 3.2 削除

| キー | 理由 |
|---|---|
| `airFrictionX` | デッド設定（`gameBalance.ts:139` のマッピングと `config-types.ts:33` の型定義のみ参照、実ロジック未使用）。新 `airAccel`/`airDecel` と概念が被り混乱を招くため廃止（REQ-MOV-10）。 |

## 4. 2回ジャンプの修正（REQ-MOV-08）

`sideScroller.ts` のジャンプ処理で、**空中・coyote 外**のジャンプ（= 真の 2回ジャンプ）に
`doubleJumpVelocity` を使用させる。

```ts
// sideScroller.ts:741 付近（ジャンプ実行ブロック内）
// 現行: p.vy = PLAYER_PHYSICS.jumpVelocity
// 修正: 真の 2回ジャンプ（空中 & coyote 切れ）は doubleJumpVelocity
const isAirDouble = !p.onGround && this.coyoteTimer <= 0
p.vy = isAirDouble ? PLAYER_PHYSICS.doubleJumpVelocity : PLAYER_PHYSICS.jumpVelocity
```

- 1回ジャンプ・coyote ジャンプ（地面を直に離れた直後）: `jumpVelocity`（現状維持）。
- 真の 2回ジャンプ（空中で意図的に 2 回目）: `doubleJumpVelocity`（`-610`、初回より弱め）。
- **着地バッファジャンプ**（`sideScroller.ts:781`、着地と同時にバッファ消費）は
  地上ジャンプ相当のため `jumpVelocity` のまま（`isAirDouble` は `onGround=true` で false）。

## 5. 変更ファイル一覧

| ファイル | 変更内容 | 種別 |
|---|---|---|
| `src/data/config/physics.json` | `groundAccel`/`groundDecel`/`airAccel`/`airDecel` 追加、`airFrictionX` 削除 | データ |
| `src/framework/config-types.ts` | `PhysicsConfig` に 4 フィールド追加、`airFrictionX` 削除 | 型 |
| `src/data/gameBalance.ts` | `PLAYER_PHYSICS` に 4 フィールド追加、`airFrictionX` 削除 | マッピング |
| `src/framework/ConfigValidator.ts` | 4 フィールドの `min:0`（exclusiveMin）チェック追加、`airFrictionX` 参照削除 | バリデーション |
| `src/game/systems/MovementFeature.ts` | `_applyHorizontalControl` 追加、速度マッピング分岐を加速ロジックに置換 | 実装 |
| `src/game/sideScroller.ts` | 2回ジャンプ速度の分岐（`isAirDouble`）のみ | 実装 |
| `tests/unit/game/MovementFeature.test.ts` | 新規単体テスト（加速・減速・空中・方向反転・auto_run・slow_precise・dash） | テスト |
| `tests/unit/game/doubleJumpVelocity.test.ts` | 2回ジャンプ速度テスト（または既存テストに統合） | テスト |

> `framework/types.ts` の `PhysicsOverride`（バージョン毎上書き）には**追加しない**（Q3 決定事項）。

## 6. エッジケースと既存フィーチャーとの共存

| フィーチャー / モード | 挙動 | 対応 |
|---|---|---|
| `auto_run` | `targetVx = +runSpeed` 固定 → 常に加速 | 既存維持（REQ-MOV-05） |
| `slow_precise` | `runSpeed × slowPreciseRatio` が目標 | 既存維持（REQ-MOV-06） |
| `dash` | ダッシュ中は `vx = dashSpeed`（加速分岐スキップ） | 既存維持（REQ-MOV-07）。ダッシュ終了後は加速ロジックが引き継ぐ |
| `slide` | スライド中は速度維持（加速分岐スキップ） | 既存維持（REQ-MOV-07） |
| `wall_jump` | `preUpdate` で `vx = ±wallJumpPushSpeed` を設定後、加速分岐が目標へ加速 | 現状（即座上書き）と同等。1 フレームの押し出しは加速で滑らかに |
| `double_jump` | 2回ジャンプ速度が `doubleJumpVelocity` に | 修正（REQ-MOV-08） |
| 無重力 STG（`gravity===0`） | 別パス（`sideScroller.ts:708-719`）、`vx` は上下キーで即座 | **対象外**（NG3） |
| 縦 STG（`scrollAxis==='y'`） | 別パス（`MovementFeature.ts:81-85`）、即座速度 | **対象外**（NG3） |
| `tetris_mode` / `lights_out`（noControlMode） | `p.x += p.vx*dt` は無効。`vx` は加速しても位置不変 | 挙動不変（位置が動かないため影響なし） |

## 7. 後方互換・リスク

- **BC-1**: 位置積分・クランプ・ジャンプ処理は不変。影響は「水平速度の立ち上がり/停止の滑らかさ」のみ。
- **BC-2**: 既存の障害物回避は加速ロジックでも達成可能（`groundAccel` が十分速い）。
  回避不能になるリスクは低いが、**フィール確認（AC-7）で必ず検証**。
- **RISK-1**: `airDecel` が緩すぎると空中で「止まらない」感覚になり回避が難しくなる。
  → 初期値 `600`（0.4s 停止）は中庸。フィール確認で調整。
- **RISK-2**: `groundDecel` が速すぎると「滑らない」感じになり重量感が薄れる。
  → 初期値 `3400`（0.07s 停止）は応答性重視。フィール確認で調整。
- **RISK-3**: 加速ロジックの `dt` 依存。高 fps / 低 fps で挙動が変わらないよう
  `dt` 乗算（フレームレート非依存）で実装（`throwEngine.ts:84` と同様の慣行）。

## 8. 実装順序（Implementer 向け）

1. `physics.json` に 4 パラメータ追加、`airFrictionX` 削除。
2. `config-types.ts` / `gameBalance.ts` / `ConfigValidator.ts` に反映。
3. `MovementFeature.ts` に `_applyHorizontalControl` を追加し、速度マッピング分岐を置換。
4. `sideScroller.ts` の 2回ジャンプ速度を `isAirDouble` で分岐。
5. 単体テスト作成（[03-test-requirements.md](./03-test-requirements.md) 参照）。
6. `npm run typecheck && npm run lint && npm run validate && npm run test:unit:ci && npm run build`。
7. Playwright で実機フィール確認（スクリーンショット撮影・微調整）。
