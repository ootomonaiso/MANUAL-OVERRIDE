import { describe, it, expect } from 'vitest'
import { _isHazardous } from '../../../src/game/sideScroller'

/**
 * beat_hazard 反転判定のユニットテスト。
 *
 * _isHazardous(beatHazardInverted, hasBeatHazard, isSafe) の
 * 全組み合わせを網羅し、横モード (_updateHorizontal) と
 * 縦モード (_updateVertical) の両方で同一の判定ロジックが
 * 適用されることを保証する。
 *
 * 論理:
 *   beatHazardInverted=true && hasBeatHazard=true  →  isSafe の逆（safe=危険、hazard=安全）
 *   それ以外                                      →  isSafe=false が危険（従来通り）
 */
describe('_isHazardous', () => {
  describe('反転ON + beat_hazard有効', () => {
    it('isSafe=true のハザードは危険（反転により safe → 危険）', () => {
      expect(_isHazardous(true, true, true)).toBe(true)
    })

    it('isSafe=false のハザードは安全（反転により hazard → 安全）', () => {
      expect(_isHazardous(true, true, false)).toBe(false)
    })
  })

  describe('反転OFF + beat_hazard有効', () => {
    it('isSafe=true のハザードは安全（従来通り）', () => {
      expect(_isHazardous(false, true, true)).toBe(false)
    })

    it('isSafe=false のハザードは危険（従来通り）', () => {
      expect(_isHazardous(false, true, false)).toBe(true)
    })
  })

  describe('反転ON + beat_hazard無効', () => {
    it('isSafe=true のハザードは安全（beat_hazard 無効なので反転も無効）', () => {
      expect(_isHazardous(true, false, true)).toBe(false)
    })

    it('isSafe=false のハザードは危険（beat_hazard 無効なので従来通り）', () => {
      expect(_isHazardous(true, false, false)).toBe(true)
    })
  })

  describe('反転OFF + beat_hazard無効', () => {
    it('isSafe=true のハザードは安全（通常時）', () => {
      expect(_isHazardous(false, false, true)).toBe(false)
    })

    it('isSafe=false のハザードは危険（通常時）', () => {
      expect(_isHazardous(false, false, false)).toBe(true)
    })
  })
})
