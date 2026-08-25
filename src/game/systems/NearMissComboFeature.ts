/**
 * game/systems/NearMissComboFeature.ts
 * 接近回避（near-miss）コンボシステム。
 *
 * ハザードがプレイヤーの X 平面を衝突なしで通過し、垂直間隔が閾値以内なら
 * near-miss として combo を +1 する。被弾でリセット、減衰で 0 に戻る。
 *
 * 対象ジャンル: platformer / runner / racing / sports / rhythm
 * すべて横スクロール前提のため、X 平面通過判定で十分。
 *
 * 座標系:
 *   - ハザード h.x はワールド座標（スポーン時 cameraX + W + offset）
 *   - プレイヤー p.x はスクリーン座標
 *   - 通過判定・衝突判定はスクリーン系に変換して行う
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import { rectsOverlap, type Hazard } from '../entities'
import { NEAR_MISS } from '../../data/tunables'
import { getActiveSystems } from '../../engine/GameRegistry'

interface NearMissState {
  passedHazards: Set<Hazard>
  decayTimer: number
}

const NEAR_MISS_POPUP_COLOR = '#88ddff'

// マジックナンバー定数化
const COMBO_POPUP_OFFSET_X = 4    // popX = p.x + p.w + 4
const COMBO_POPUP_OFFSET_Y = 20  // popY = p.y - 20

export class NearMissComboFeature implements FeatureSystem {
  readonly handles = ['near_miss_combo'] as const

  private state: NearMissState = this._fresh()

  private _fresh(): NearMissState {
    return { passedHazards: new Set(), decayTimer: 0 }
  }

  onInit(_world: MutableWorld): void {
    this.state = this._fresh()
  }

  onDisable(_world: MutableWorld): void {
    this.state = this._fresh()
  }

  update(world: MutableWorld, _input: InputSnapshot, dt: number): void {
    if (!world.rules.features.has('near_miss_combo')) return

    this._tickDecay(world, dt)
    this._detectNearMisses(world)
  }

  onPlayerHit(world: MutableWorld): void {
    if (!world.rules.features.has('near_miss_combo')) return
    world.resetCombo()
    // 被弾時に重叠中のハザードを passedHazards へ追加する。
    // clear() だと画面内に残る通過済みハザードが再評価され二重 near-miss になるため。
    // 被弾源ハザードが後に near-miss になることもここで塞げる。
    const p = world.player
    for (const h of world.hazards) {
      const hScreenX = world.getHazardScreenX(h)
      const hScreenRect = { ...h.rect, x: hScreenX }
      if (rectsOverlap(p.rect, hScreenRect, 0)) {
        this.state.passedHazards.add(h)
      }
    }
    this.state.decayTimer = 0
  }

  // ─── 内部: 減衰タイマー ──────────────────────────────────────────
  private _tickDecay(world: MutableWorld, dt: number): void {
    const s = this.state
    s.decayTimer += dt
    // combo が 0 の時は decayTimer をクランプ（無界増加防止）
    if (world.gameStats.combo === 0) {
      s.decayTimer = 0
      return
    }
    if (s.decayTimer >= NEAR_MISS.nearMissComboDecay) {
      world.setCombo(0)
      s.decayTimer = 0
      for (const sys of getActiveSystems(world.rules.features)) {
        sys.onComboChange?.(world, 0)
      }
    }
  }

  // ─── 内部: near-miss 検出 ───────────────────────────────────────
  private _detectNearMisses(world: MutableWorld): void {
    const s = this.state
    const p = world.player
    const threshold = NEAR_MISS.nearMissThreshold
    const isBeatInverted = world.gameStats.beatHazardInverted && world.rules.features.has('beat_hazard')

    for (let i = world.hazards.length - 1; i >= 0; i--) {
      const h = world.hazards[i]

      // 既に通過判定済みならスキップ（オブジェクト参照で管理）
      if (s.passedHazards.has(h)) continue

      // near-miss 対象: isSafe のハザードは安全色（避ける必要がない）
      // 例外: beat_hazard 反転時は isSafe が危険なので near-miss 対象
      const isHazardous = isBeatInverted ? h.isSafe : !h.isSafe
      if (!isHazardous) continue

      // 衝突判定: 衝突している場合は near-miss 不是（被弾扱い）
      // ハザードをスクリーン系に変換して p.rect（スクリーン系）と比較
      const hScreenX = world.getHazardScreenX(h)
      const hScreenRect = { ...h.rect, x: hScreenX }
      if (rectsOverlap(p.rect, hScreenRect, 0)) continue

      // 通過判定: ハザード右端がプレイヤー左端を下回った = 通過完了
      // hScreenX はスクリーン座標、p.x もスクリーン座標 → 直接比較可能
      if (hScreenX + h.w < p.x) {
        s.passedHazards.add(h)

        // 垂直間隔を計算（重なりなら 0）— h.rect は floatAmp 補正済み
        const gap = this._verticalGap(p, h)
        if (gap <= threshold) {
          // near-miss!
          world.setCombo(world.gameStats.combo + 1)
          s.decayTimer = 0

          // スコアポップ
          const popX = p.x + p.w + COMBO_POPUP_OFFSET_X
          const popY = p.y - COMBO_POPUP_OFFSET_Y
          world.addScorePopup(popX, popY, 'NEAR MISS!', NEAR_MISS_POPUP_COLOR)
        }
      }
    }
  }

  // ─── 内部: 垂直間隔の計算 ────────────────────────────────────────
  // 2 矩形の垂直方向の離れ（重なりなら 0）を返す。
  // h.rect.y は floatAmp 補正済み（衝突判定と同じ y 座標を使用）。
  private _verticalGap(
    p: { y: number; h: number },
    h: { y: number; h: number; rect: { y: number; h: number } },
  ): number {
    const pBottom = p.y + p.h
    const hBottom = h.rect.y + h.rect.h
    // プレイヤーがハザードより上
    if (p.y >= hBottom) return p.y - hBottom
    // ハザードがプレイヤーより上
    if (h.rect.y >= pBottom) return h.rect.y - pBottom
    // 垂直方向に重なり
    return 0
  }
}
