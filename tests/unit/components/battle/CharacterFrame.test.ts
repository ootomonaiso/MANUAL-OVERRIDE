import { describe, it, expect, afterEach } from 'vitest'
import { createApp, h, type App } from 'vue'
import CharacterFrame from '../../../../src/components/battle/CharacterFrame.vue'
import type { AffinityPreview } from '../../../../src/components/battle/CharacterFrame.vue'

/**
 * 18個のpropsを1つの入れ子ビューオブジェクトへ再構成するリファクタが控えている。
 * BattleScreen.test.ts が触れていない敵専用の枝（相性チップ・状態異常・シールド・NEXT）を
 * ここで固定する。
 */

interface Props {
  label: string
  hp: number
  maxHp: number
  shield: number
  alive: boolean
  spriteId: string
  side: 'enemy' | 'player'
  spriteHeight: number
  isBoss?: boolean
  targetable?: boolean
  nextSkillLabel?: string | null
  nextDamageLabel?: string | null
  nextMarkColor?: string
  affinityPreview?: AffinityPreview | null
  statusEffects?: { label: string; isBuff: boolean; scopeLabel: string }[]
}

interface Harness {
  host: HTMLElement
  app: App
}

let current: Harness | null = null

const ENEMY_SPRITE = 'battle_slime'
const PLAYER_SPRITE = 'battle_heroine'

function baseEnemy(over: Partial<Props> = {}): Props {
  return {
    label: 'スライム', hp: 30, maxHp: 40, shield: 0, alive: true,
    spriteId: ENEMY_SPRITE, side: 'enemy', spriteHeight: 96, ...over,
  }
}
function basePlayer(over: Partial<Props> = {}): Props {
  return {
    label: '主人公', hp: 30, maxHp: 40, shield: 0, alive: true,
    spriteId: PLAYER_SPRITE, side: 'player', spriteHeight: 96, ...over,
  }
}

function mountFrame(props: Props): Harness {
  const host = document.createElement('div')
  document.body.appendChild(host)
  const app = createApp({ render: () => h(CharacterFrame, { ...props }) })
  app.mount(host)
  current = { host, app }
  return current
}

function $(host: HTMLElement, sel: string): HTMLElement | null {
  return host.querySelector(sel)
}
function $$(host: HTMLElement, sel: string): HTMLElement[] {
  return [...host.querySelectorAll<HTMLElement>(sel)]
}
function textOf(el: Element | null): string {
  return el?.textContent?.replace(/\s+/g, ' ').trim() ?? ''
}

afterEach(() => {
  if (current) { current.app.unmount(); current.host.remove(); current = null }
})

describe('CharacterFrame: ルートの分類', () => {
  it('side がそのままルートのクラスになる', () => {
    expect($(mountFrame(baseEnemy()).host, '.char-unit.enemy')).not.toBeNull()
  })

  it('倒れている・ボス・対象選択中はそれぞれ専用クラスで示す', () => {
    const h = mountFrame(baseEnemy({ alive: false, isBoss: true, targetable: true }))
    const root = $(h.host, '.char-unit')!
    expect(root.classList.contains('defeated')).toBe(true)
    expect(root.classList.contains('is-boss')).toBe(true)
    expect(root.classList.contains('targetable')).toBe(true)
  })
})

describe('CharacterFrame: 敵の相性チップ', () => {
  it('相性が無ければチップごと出ない', () => {
    const h = mountFrame(baseEnemy({ affinityPreview: { affinity: null, effect: null } }))
    expect($(h.host, '.affinity-chip')).toBeNull()
  })

  it('弱点は丸バッジ（pill weak）で ▲弱点', () => {
    const h = mountFrame(baseEnemy({ affinityPreview: { affinity: 'weak', effect: null } }))
    const tag = $(h.host, '.affinity-chip .affinity-row .affinity-tag')!
    expect(tag.classList.contains('pill')).toBe(true)
    expect(tag.classList.contains('weak')).toBe(true)
    expect(textOf(tag)).toBe('▲弱点')
    // GlossaryTerm 経由なので button でもある
    expect(tag.classList.contains('glossary-term')).toBe(true)
  })

  it('耐性は ▼耐性', () => {
    const h = mountFrame(baseEnemy({ affinityPreview: { affinity: 'resist', effect: null } }))
    const tag = $(h.host, '.affinity-tag')!
    expect(tag.classList.contains('resist')).toBe(true)
    expect(textOf(tag)).toBe('▼耐性')
  })

  it('抜群・微妙は菱形バッジ（diamond）で、文字は内側の span に入る', () => {
    const superH = mountFrame(baseEnemy({ affinityPreview: { affinity: null, effect: 'super' } }))
    const superTag = $(superH.host, '.affinity-tag')!
    expect(superTag.classList.contains('diamond')).toBe(true)
    expect(superTag.classList.contains('super')).toBe(true)
    expect(textOf(superTag.querySelector('span'))).toBe('◆抜群')
    superH.app.unmount(); superH.host.remove(); current = null

    const poorH = mountFrame(baseEnemy({ affinityPreview: { affinity: null, effect: 'poor' } }))
    const poorTag = $(poorH.host, '.affinity-tag')!
    expect(poorTag.classList.contains('poor')).toBe(true)
    expect(textOf(poorTag.querySelector('span'))).toBe('◇微妙')
  })

  it('弱点と抜群が同時なら行を分けて2段になる', () => {
    const h = mountFrame(baseEnemy({ affinityPreview: { affinity: 'weak', effect: 'super' } }))
    expect($$(h.host, '.affinity-chip .affinity-row')).toHaveLength(2)
    expect($$(h.host, '.affinity-tag')).toHaveLength(2)
  })
})

describe('CharacterFrame: 敵のNEXT予告', () => {
  it('技名と被害見込みが NEXT の見出しとともに出る', () => {
    const h = mountFrame(baseEnemy({
      nextSkillLabel: '体当たり', nextDamageLabel: '軽傷', nextMarkColor: 'rgb(0, 128, 255)',
    }))
    const chip = $(h.host, '.head-stack .next-chip')!
    expect(textOf(chip.querySelector('.next-head'))).toBe('NEXT')
    expect(textOf(chip.querySelector('.next-skill'))).toBe('体当たり')
    expect((chip.querySelector('.next-mark') as HTMLElement).style.background).toBe('rgb(0, 128, 255)')
    expect(textOf(chip.querySelector('.next-damage'))).toBe('軽傷')
  })

  it('技名が無いときは「様子を見る」を出し、被害見込みの行は消える', () => {
    const h = mountFrame(baseEnemy({ nextSkillLabel: null, nextDamageLabel: null }))
    expect(textOf($(h.host, '.next-skill'))).toBe('様子を見る')
    expect($(h.host, '.next-damage')).toBeNull()
  })
})

describe('CharacterFrame: 敵の頭上表示のガード条件', () => {
  it('倒れた敵は頭上（相性・NEXT）もHPも状態異常も消える', () => {
    const h = mountFrame(baseEnemy({
      alive: false,
      affinityPreview: { affinity: 'weak', effect: 'super' },
      nextSkillLabel: '体当たり',
      statusEffects: [{ label: 'DEF低下', isBuff: false, scopeLabel: '(2T)' }],
    }))
    expect($(h.host, '.head-stack')).toBeNull()
    expect($(h.host, '.hp-pill')).toBeNull()
    expect($(h.host, '.status-row')).toBeNull()
    // 本体（ドット絵）は残る
    expect($(h.host, '.sprite-stage')).not.toBeNull()
  })

  it('プレイヤー側は生きていても頭上を出さない（相性・NEXTを渡しても無視される）', () => {
    const h = mountFrame(basePlayer({
      affinityPreview: { affinity: 'weak', effect: 'super' },
      nextSkillLabel: '体当たり',
    }))
    expect($(h.host, '.head-stack')).toBeNull()
    expect($(h.host, '.affinity-chip')).toBeNull()
    expect($(h.host, '.next-chip')).toBeNull()
  })
})

describe('CharacterFrame: 状態異常チップ', () => {
  it('バフは ▲、デバフは ▼ を前置し、範囲ラベルを内側の span に添える', () => {
    const h = mountFrame(baseEnemy({
      statusEffects: [
        { label: '攻撃上昇', isBuff: true, scopeLabel: '(3T)' },
        { label: 'DEF低下', isBuff: false, scopeLabel: '(2T)' },
      ],
    }))
    const chips = $$(h.host, '.status-row .status-chip')
    expect(chips).toHaveLength(2)
    expect(chips[0].classList.contains('buff')).toBe(true)
    expect(chips[0].classList.contains('debuff')).toBe(false)
    expect(textOf(chips[0])).toBe('▲攻撃上昇(3T)')
    expect(textOf(chips[0].querySelector('.status-scope'))).toBe('(3T)')
    expect(chips[1].classList.contains('debuff')).toBe(true)
    expect(textOf(chips[1])).toBe('▼DEF低下(2T)')
  })

  it('空なら行ごと出ない', () => {
    expect($(mountFrame(baseEnemy({ statusEffects: [] })).host, '.status-row')).toBeNull()
  })

  /**
   * status-row の v-if は alive しか見ておらず side を見ていない。
   * プレイヤーのバフは BuffStrip に集約する方針（props のコメント）と食い違うが、
   * 現状の描画としてはプレイヤー側でも出るので、そのまま固定する。
   */
  it('プレイヤーに渡した場合も現状は表示される', () => {
    const h = mountFrame(basePlayer({
      statusEffects: [{ label: '守勢', isBuff: true, scopeLabel: '(1T)' }],
    }))
    expect($(h.host, '.status-row .status-chip')).not.toBeNull()
  })
})

describe('CharacterFrame: HPとシールド', () => {
  it('HP数値は現在値・最大値とも切り捨てで出す', () => {
    const h = mountFrame(basePlayer({ hp: 12.9, maxHp: 40.7 }))
    expect(textOf($(h.host, '.hp-pill .hp-num'))).toBe('12/40')
  })

  it('HPが負になっても 0 で下げ止まる', () => {
    const h = mountFrame(basePlayer({ hp: -5, maxHp: 40 }))
    expect(textOf($(h.host, '.hp-num'))).toBe('0/40')
  })

  it('HPバーの幅は割合、名前は hp-name に出る', () => {
    const h = mountFrame(baseEnemy({ hp: 10, maxHp: 40, label: 'スライム' }))
    expect(textOf($(h.host, '.hp-name'))).toBe('スライム')
    expect(($(h.host, '.hp-fill') as HTMLElement).style.width).toBe('25%')
  })

  it('シールドが無いときは shield-fill も +表記も出ない', () => {
    const h = mountFrame(baseEnemy({ shield: 0 }))
    expect($(h.host, '.shield-fill')).toBeNull()
    expect($(h.host, '.hp-shield-num')).toBeNull()
  })

  it('シールドがあると hp-track に shield-fill が重なり、+値が添えられる', () => {
    const h = mountFrame(baseEnemy({ hp: 40, maxHp: 40, shield: 10.6 }))
    const fill = $(h.host, '.hp-track .shield-fill') as HTMLElement
    expect(fill).not.toBeNull()
    expect(fill.style.width).toBe('26.5%')
    expect(textOf($(h.host, '.hp-shield-num'))).toBe('+10')
  })

  it('シールドが最大HPを超えても幅は100%で頭打ちになる', () => {
    const h = mountFrame(baseEnemy({ hp: 40, maxHp: 40, shield: 999 }))
    expect(($(h.host, '.shield-fill') as HTMLElement).style.width).toBe('100%')
  })
})
