import { describe, it, expect } from 'vitest'
import { comboMilestone, type ComboMilestone } from '../../src/domain/comboMilestones'

const MILESTONES: ComboMilestone[] = [
  { at: 5, label: 'GOOD' },
  { at: 10, label: 'GREAT' },
  { at: 20, label: 'EXCELLENT' },
  { at: 30, label: 'UNSTOPPABLE' },
  { at: 50, label: 'LEGENDARY' },
  { at: 100, label: 'GODLIKE' },
]

describe('comboMilestone', () => {
  it('combo 1 未満なら null を返す', () => {
    expect(comboMilestone(0, MILESTONES)).toBeNull()
    expect(comboMilestone(1, MILESTONES)).toBeNull()
    expect(comboMilestone(4, MILESTONES)).toBeNull()
  })

  it('ちょうど 5 なら GOOD を返す', () => {
    expect(comboMilestone(5, MILESTONES)?.label).toBe('GOOD')
  })

  it('6〜9 は null を返す', () => {
    expect(comboMilestone(6, MILESTONES)).toBeNull()
    expect(comboMilestone(7, MILESTONES)).toBeNull()
    expect(comboMilestone(9, MILESTONES)).toBeNull()
  })

  it('ちょうど 100 なら GODLIKE を返す', () => {
    expect(comboMilestone(100, MILESTONES)?.label).toBe('GODLIKE')
  })

  it('101 なら null を返す', () => {
    expect(comboMilestone(101, MILESTONES)).toBeNull()
  })

  it('空配列なら常に null', () => {
    expect(comboMilestone(5, [])).toBeNull()
    expect(comboMilestone(100, [])).toBeNull()
  })
})
