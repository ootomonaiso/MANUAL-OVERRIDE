/**
 * game/systems/NearMissComboFeature.ts
 * 接近回避（near-miss）コンボシステム。
 *
 * ハザードがプレイヤーの X 平面を衝突なしで通過し、垂直間隔が閾値以内なら
 * near-miss として combo を +1 する。被弾でリセット、減衰で 0 に戻る。
 *
 * 対象ジャンル: platformer / runner / racing / sports / rhythm
 * すべて横スクロール前提のため、X 平面通過判定で十分。
 */

import type { FeatureSystem } from '../../engine/FeatureSystem'
import type { MutableWorld, InputSnapshot } from '../../engine/types'
import { rectsOverlap } from '../entities'
import { NEAR_MISS } from '../../data/tunables'
import { getActiveSystems } from '../../engine/GameRegistry'

interface NearMissState {
  passedHazards: Set<number>
  decayTimer: number
}

const NEAR_MISS_POPUP_COLOR = '#88ddff'

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
    this.state.passedHazards.clear()
    this.state.decayTimer = 0
  }

  // ─── 内部: 減衰タイマー ──────────────────────────────────────────
  private _tickDecay(world: MutableWorld, dt: number): void {
    const s = this.state
    s.decayTimer += dt
    if (s.decayTimer >= NEAR_MISS.nearMissComboDecay && world.gameStats.combo > 0) {
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

    for (let i = world.hazards.length - 1; i >= 0; i--) {
      const h = world.hazards[i]

      // 既に通過判定済みならスキップ
      if (s.passedHazards.has(h.passId)) continue

      // 衝突判定: 衝突している場合は near-miss 不是（被弾扱い）
      if (rectsOverlap(p.rect, h.rect, 0)) continue

      // 通過判定: ハザード右端がプレイヤー左端を下回った = 通過完了
      if (h.x + h.w < p.x) {
        s.passedHazards.add(h.passId)

        // 垂直間隔を計算（重なりなら 0）
        const gap = this._verticalGap(p, h)
        if (gap <= threshold) {
          // near-miss!
          world.setCombo(world.gameStats.combo + 1)
          s.decayTimer = 0

          // スコアポップ
          const popX = p.x + p.w + 4
          const popY = p.y - 20
          world.addScorePopup(popX, popY, 'NEAR MISS!', NEAR_MISS_POPUP_COLOR)
        }
      }
    }
  }

  // ─── 内部: 垂直間隔の計算 ────────────────────────────────────────
  // 2 矩形の垂直方向の離れ（重なりなら 0）を返す。
  private _verticalGap(p: { y: number; h: number }, h: { y: number; h: number }): number {
    const pBottom = p.y + p.h
    const hBottom = h.y + h.h
    // プレイヤーがハザードより上
    if (p.y >= hBottom) return p.y - hBottom
    // ハザードがプレイヤーより上
    if (h.y >= pBottom) return h.y - pBottom
    // 垂直方向に重なり
    return 0
  }
}
