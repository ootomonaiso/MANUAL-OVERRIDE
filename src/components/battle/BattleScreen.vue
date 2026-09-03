<script setup lang="ts">
/**
 * components/battle/BattleScreen.vue
 * rpg ジャンル（ローグライク戦闘）の画面全体レイアウト（docs/genre/rpg/08-ui.md）。
 *
 * 画面の主役はキャラクターで、HP・予告は身体の外（頭上・足元）に置く。
 * ステータス・スキル一覧は左上に常時表示し、行動の選択はプレイヤー側へ寄せた
 * コマンド（COMMAND → BATTLE → 技）に集約する。
 */
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import type { useBattleState, CombatantView } from '../../composables/useBattleState'
import { useBattlePresentation } from '../../composables/useBattlePresentation'
import StatusPanel from './StatusPanel.vue'
import type { StatRowView } from './StatusPanel.vue'
import SkillListPanel from './SkillListPanel.vue'
import type { SkillListItemView } from './SkillListPanel.vue'
import CategoryListPanel from './CategoryListPanel.vue'
import type { CategoryRowView } from './CategoryListPanel.vue'
import CommandMenu from './CommandMenu.vue'
import type { CommandEntry } from './CommandMenu.vue'
import SkillCommandPanel from './SkillCommandPanel.vue'
import type { SkillCommandEntry } from './SkillCommandPanel.vue'
import type { AffinityPreview } from './CharacterFrame.vue'
import TurnBadge from './TurnBadge.vue'
import BuffStrip from './BuffStrip.vue'
import type { BuffEntry } from './BuffStrip.vue'
import CharacterFrame from './CharacterFrame.vue'
import InfoPanel from './InfoPanel.vue'
import type { InfoSkillRow, InfoCharacterView } from './InfoPanel.vue'
import SkillDraftPanel from './SkillDraftPanel.vue'
import type { DraftCardView, SwapSlotView } from './SkillDraftPanel.vue'
import BattleBackdrop from './BattleBackdrop.vue'
import SkillCastBanner from './SkillCastBanner.vue'
import HelpGuide from './HelpGuide.vue'
import { useGlossaryPanel } from '../../composables/useGlossaryPanel'
import type { PlayerAction, SkillDef, Element } from '../../domain/battle/types'
import { STAT_KEYS, CATEGORY_IDS } from '../../domain/battle/types'
import {
  STAT_LABEL, CATEGORY_LABEL, CATEGORY_COLOR, buildSkillText, describeTemporaryModifier,
  PERCENT_STAT_KEYS,
} from '../../domain/battle/skillText'
import { STACKS_REQUIRED, nextCategoryThreshold } from '../../domain/battle/skillDraft'
import { damageMagnitude, MAGNITUDE_LABEL } from '../../domain/battle/damagePreview'
import { computeAffinityStage, effectivenessHint } from '../../domain/battle/damageCalc'
import { BATTLE_CONTENT } from '../../data/rpg/battleContent'
import { findBattleBackground } from '../../data/rpg/battleBackgrounds'
import { soundManager } from '../../plugins/SoundManager'

/**
 * useBattleState() は App.vue で1度だけ呼び出し、ここへ props として渡す。
 * ライフサイクル（initRun/reset）は App.vue が lockedGenre の watch で管理する
 * （01-architecture.md「エッジケース」。この画面自身は初期化を行わない）。
 */
const props = defineProps<{
  battle: ReturnType<typeof useBattleState>
}>()

const battle = props.battle
const content = BATTLE_CONTENT
const fx = useBattlePresentation(battle)

/**
 * 背景写真と手前の床の境目。キャラクターの立ち位置もここに合わせる。
 * 敵の頭上チップ〜HPプレートまでの縦の占有量と、自キャラの頭〜HPプレートまでの占有量を
 * 足すと画面の大半を使うため、0.62 のままだと敵の下半身・HPプレートが自キャラの頭に
 * 隠れて見えなくなっていた（実機の getBoundingClientRect で確認）。床を上へ動かして
 * 敵の立ち位置を自キャラから引き離す。
 * 0.47 → 0.485: 相性プレビュー（弱点/耐性・抜群/微妙）チップを敵の頭上に追加した際、
 * 画面上端との隙間が足りず見切れていたため、敵をわずかに自キャラ側へ寄せて頭上の
 * 余白を確保した（自キャラとの間隔はまだ十分空いている）。
 */
const FLOOR_TOP = 0.485
const ELEMENT_COLOR: Record<Element, string> = {
  physical: 'var(--battle-element-physical)',
  magical: 'var(--battle-element-magical)',
  special: 'var(--battle-element-special)',
}

// ── 画面サイズに追従するドット絵の大きさ ─────────────────────
const viewportHeight = ref(typeof window === 'undefined' ? 800 : window.innerHeight)
function onResize(): void { viewportHeight.value = window.innerHeight }
onMounted(() => window.addEventListener('resize', onResize))
onUnmounted(() => window.removeEventListener('resize', onResize))

// 頭上の予告・足元のHPプレートを身体の外に出したぶん、全身+プレートが画面に収まるよう
// 比率を少し抑える（以前は自キャラを画面下端で見切れさせていたが、HPプレートが画面外に
// はみ出してしまうため、全身を収める配置へ変更した）。
const playerSpriteHeight = computed(() => Math.round(viewportHeight.value * 0.34))
function enemySpriteHeight(isBoss: boolean): number {
  return Math.round(viewportHeight.value * (isBoss ? 0.36 : 0.27))
}

function statRows(c: CombatantView): StatRowView[] {
  const eff = battle.effectiveOf(c)
  return STAT_KEYS.map(k => ({
    key: k, label: STAT_LABEL[k], base: c.baseStats[k], effective: eff[k], isPercent: PERCENT_STAT_KEYS.has(k),
  }))
}

const playerStatRows = computed(() => statRows(battle.state.player))
const playerMaxHp = computed(() => battle.effectiveOf(battle.state.player).hp)

// ── 背景 ──────────────────────────────────────────────────────
const background = computed(() => findBattleBackground(battle.state.backgroundId))
const themeVars = computed(() => {
  const bg = background.value
  if (!bg) return {}
  return { '--battle-accent': bg.accent, '--battle-panel': bg.panel ?? '#15131e' }
})

// ── コマンド ──────────────────────────────────────────────────
type MenuMode = 'root' | 'battle' | 'focus'
const menu = ref<MenuMode>('root')
const pendingAction = ref<PlayerAction | null>(null)
const hoveredCommand = ref<string | null>(null)

const awaitingInput = computed(() => battle.isPlayerTurn.value && battle.state.status === 'battle')

watch(awaitingInput, (ready) => {
  if (ready) { menu.value = 'root'; pendingAction.value = null }
})

const commandEntries = computed<CommandEntry[]>(() => [
  { id: 'battle', label: 'BATTLE' },
  { id: 'info', label: 'INFO' },
])

/** 「守る」「避ける」「様子を見る」は特別扱いせず、他のスキルと同じくJSONで定義する
 *  （src/data/rpg/skills/skill_stance_*.json）。ただし常設の行動でありドラフトには出さないため、
 *  draftable: false を付けている（skillDraft.ts の buildCandidatePool 参照）。 */
const BUILTIN_SKILL_ID: Record<'guard' | 'dodge' | 'pass', string> = {
  guard: 'skill_stance_guard', dodge: 'skill_stance_watch', pass: 'skill_stance_idle',
}

const skillEntries = computed<SkillCommandEntry[]>(() => {
  const player = battle.state.player
  const entries: SkillCommandEntry[] = []
  for (let slot = 0; slot < 4; slot++) {
    const owned = player.actives.find(a => a.slotIndex === slot)
    if (!owned) continue
    const def = content.skills.get(owned.id)
    if (!def || def.kind !== 'active') continue
    entries.push({
      id: `active:${slot}`,
      label: def.label,
      markColor: ELEMENT_COLOR[def.element],
      element: def.element,
      cooldown: owned.cooldown,
      disabled: owned.cooldown > 0,
      note: `Lv${owned.level}`,
      effectTokens: buildSkillText(def, owned.level),
    })
  }
  const builtin = battle.guardOrDodge.value
  const builtinCooldown = player.builtinCooldowns[builtin]
  const builtinDef = content.skills.get(BUILTIN_SKILL_ID[builtin])
  if (builtinDef && builtinDef.kind === 'active') {
    entries.push({
      id: `builtin:${builtin}`,
      label: builtinDef.label,
      markColor: CATEGORY_COLOR[builtinDef.mainCategory],
      cooldown: builtinCooldown,
      disabled: builtinCooldown > 0,
      effectTokens: buildSkillText(builtinDef, 1),
    })
  }
  const passDef = content.skills.get(BUILTIN_SKILL_ID.pass)
  if (passDef && passDef.kind === 'active') {
    entries.push({
      id: 'builtin:pass',
      label: passDef.label,
      markColor: CATEGORY_COLOR[passDef.mainCategory],
      cooldown: 0,
      disabled: false,
      effectTokens: buildSkillText(passDef, 1),
    })
  }
  return entries
})

function onCommandSelect(id: string): void {
  soundManager.playSfx('battle_skill_select')
  if (id === 'battle') menu.value = 'battle'
  // INFO は常設のステータス/スキル一覧（要点だけ）とは別に、大きく詳しい表示を
  // 求める操作。既存の詳細モーダル（openDetail）をそのまま流用する。
  else if (id === 'info') openDetail(battle.state.player)
}

function onSkillSelect(id: string): void {
  const [kind, value] = id.split(':')
  soundManager.playSfx('battle_skill_select')
  if (kind === 'builtin') {
    battle.selectAction({ kind: 'builtin', action: value as 'guard' | 'dodge' | 'pass' })
    menu.value = 'root'
    return
  }
  const slotIndex = Number(value)
  const owned = battle.state.player.actives.find(a => a.slotIndex === slotIndex)
  if (!owned) return
  const def = content.skills.get(owned.id)
  if (!def || def.kind !== 'active') return

  const aliveCount = battle.state.enemies.filter(e => e.alive).length
  if (def.defaultFocus === 'enemy' && def.focusRange === 'single' && aliveCount > 1) {
    pendingAction.value = { kind: 'active', slotIndex }
    menu.value = 'focus'
    return
  }
  battle.selectAction({ kind: 'active', slotIndex }, null)
  menu.value = 'root'
}

function onUnitSelect(c: CombatantView, enemyIndex: number | null): void {
  if (menu.value === 'focus' && pendingAction.value && enemyIndex !== null && c.alive) {
    battle.selectAction(pendingAction.value, enemyIndex)
    pendingAction.value = null
    menu.value = 'root'
    return
  }
  openDetail(c)
}

function onCancel(): void {
  pendingAction.value = null
  menu.value = 'root'
}

// ── 相性プレビュー（COMMANDで技をホバー/固定中の弱点・耐性・抜群・微妙） ──────
const previewedSkill = ref<SkillCommandEntry | null>(null)
function onSkillPreview(entry: SkillCommandEntry | null): void {
  previewedSkill.value = entry
}
watch(menu, (m) => { if (m !== 'battle') previewedSkill.value = null })

function affinityPreviewOf(e: CombatantView): AffinityPreview | null {
  const element = previewedSkill.value?.element
  if (!element || !e.alive) return null
  const stage = computeAffinityStage(element, e.traits, content.traits)
  const affinity = stage > 0 ? 'weak' : stage < 0 ? 'resist' : null
  const effect = effectivenessHint(element, battle.effectiveOf(e))
  if (!affinity && !effect) return null
  return { affinity, effect }
}

// ── 敵の予告 ──────────────────────────────────────────────────
interface NextPreview { label: string | null; damage: string | null; markColor: string }

function nextPreviewOf(e: CombatantView): NextPreview {
  const skillId = battle.nextEnemySkillPreview(e)
  const def = skillId ? content.skills.get(skillId) : undefined
  if (!def || def.kind !== 'active') return { label: null, damage: null, markColor: 'var(--battle-diff-muted)' }
  const owned = e.actives.find(a => a.id === skillId)
  const damage = battle.estimateDamageToPlayer(e, skillId as string, owned?.level ?? 1)
  const magnitude = damageMagnitude(damage, playerMaxHp.value)
  return {
    label: def.label,
    damage: magnitude === 'none' ? null : MAGNITUDE_LABEL[magnitude],
    markColor: ELEMENT_COLOR[def.element],
  }
}

/** テンプレートから2回呼ばないよう、敵ごとの予告をまとめて作る */
const enemyPreviews = computed<Record<string, NextPreview>>(() => {
  const out: Record<string, NextPreview> = {}
  for (const e of battle.state.enemies) out[e.id] = nextPreviewOf(e)
  return out
})

// ── INFO パネル（プレイヤー・敵・スキル詳細をまとめた2ペインパネル） ───────
const infoOpen = ref(false)
const infoInitialId = ref<string | null>(null)

/** 用語ポップアップの「詳細」でヘルプ本体へ飛ぶ時は、INFOパネルが裏に
 *  残ってパネルが重なって見えないよう、先に閉じておく。 */
const { jumpToHelpSignal } = useGlossaryPanel()
watch(jumpToHelpSignal, () => { infoOpen.value = false })

function skillRowsFrom(
  refs: readonly { id: string; level: number }[], lookup: (id: string) => SkillDef | undefined,
): InfoSkillRow[] {
  const rows: InfoSkillRow[] = []
  for (const r of refs) {
    const def = lookup(r.id)
    if (!def) continue
    rows.push({ id: r.id, label: def.label, level: r.level, flavorText: def.flavorText, effectTokens: buildSkillText(def, r.level) })
  }
  return rows
}

/** 敵のみ自身のアクティブ/パッシブ/特性を内包する（プレイヤーの分は別グループの
 *  トップレベルナビとして表示するため、ここでは持たせない） */
function characterViewOf(c: CombatantView): InfoCharacterView {
  const isEnemyC = c.id !== battle.state.player.id
  return {
    id: c.id, label: c.label, spriteId: c.spriteId,
    hp: c.hp, maxHp: battle.effectiveOf(c).hp, isBoss: c.isBoss,
    stats: statRows(c),
    skills: isEnemyC ? {
      actives: skillRowsFrom(c.actives.filter(a => a.slotIndex !== null), id => content.skills.get(id)),
      passives: skillRowsFrom(c.passives, id => content.skills.get(id)),
      traits: skillRowsFrom(c.traits.map(t => ({ id: t.id, level: 1 })), id => content.traits.get(id)),
    } : undefined,
  }
}

function openDetail(c: CombatantView): void {
  const isPlayerC = c.id === battle.state.player.id
  battle.markSeen([
    ...c.traits.map(t => t.id),
    ...c.passives.map(p => p.id),
    ...c.actives.map(a => a.id),
  ])
  infoInitialId.value = isPlayerC ? 'player' : `enemy:${c.id}`
  infoOpen.value = true
}
function closeDetail(): void { infoOpen.value = false }

const infoPlayerView = computed<InfoCharacterView>(() => characterViewOf(battle.state.player))
const infoEnemyViews = computed<InfoCharacterView[]>(() => battle.state.enemies.map(characterViewOf))
const infoActives = computed<InfoSkillRow[]>(() =>
  skillRowsFrom(battle.state.player.actives.filter(a => a.slotIndex !== null), id => content.skills.get(id)))
const infoPassives = computed<InfoSkillRow[]>(() =>
  skillRowsFrom(battle.state.player.passives, id => content.skills.get(id)))
const infoTraits = computed<InfoSkillRow[]>(() =>
  skillRowsFrom(battle.state.player.traits.map(t => ({ id: t.id, level: 1 })), id => content.traits.get(id)))

// ── スキル一覧（INFO の中身） ─────────────────────────────────
function visibilityOf(id: string, owned: boolean): 'unseen' | 'seen' | 'owned' {
  if (owned) return 'owned'
  return battle.state.seenIds.has(id) ? 'seen' : 'unseen'
}

const skillListView = computed(() => {
  const player = battle.state.player
  const ownedActiveIds = new Set(player.actives.map(a => a.id))
  const ownedPassiveIds = new Set(player.passives.map(p => p.id))
  const ownedTraitIds = new Set(player.traits.map(t => t.id))

  const ownedActives: SkillListItemView[] = player.actives.map(a => {
    const def = content.skills.get(a.id)
    return {
      id: a.id, kind: 'active', label: def?.label ?? a.id, visibility: 'owned',
      level: a.level, stacks: a.stacks, stacksRequired: STACKS_REQUIRED[Math.min(a.level, 3)] ?? 0,
      stored: a.slotIndex === null, cooldown: a.cooldown,
      categoryLabel: def ? CATEGORY_LABEL[def.mainCategory] : undefined,
      categoryColor: def ? CATEGORY_COLOR[def.mainCategory] : undefined,
      flavorText: def?.flavorText, effectTokens: def ? buildSkillText(def, a.level) : undefined,
    }
  })
  const ownedPassives: SkillListItemView[] = player.passives.map(p => {
    const def = content.skills.get(p.id)
    return {
      id: p.id, kind: 'passive', label: def?.label ?? p.id, visibility: 'owned',
      level: p.level, stacks: p.stacks, stacksRequired: STACKS_REQUIRED[Math.min(p.level, 3)] ?? 0,
      categoryLabel: def ? CATEGORY_LABEL[def.mainCategory] : undefined,
      categoryColor: def ? CATEGORY_COLOR[def.mainCategory] : undefined,
      flavorText: def?.flavorText, effectTokens: def ? buildSkillText(def, p.level) : undefined,
    }
  })
  const ownedTraits: SkillListItemView[] = player.traits.map(t => {
    const def = content.traits.get(t.id)
    return {
      id: t.id, kind: 'trait', label: def?.label ?? t.id, visibility: 'owned',
      flavorText: def?.flavorText, effectTokens: def ? buildSkillText(def, 1) : undefined,
    }
  })

  const unownedActives: SkillListItemView[] = []
  const unownedPassives: SkillListItemView[] = []
  for (const def of content.skills.values()) {
    if (def.draftable === false) continue
    const isOwned = def.kind === 'active' ? ownedActiveIds.has(def.id) : ownedPassiveIds.has(def.id)
    if (isOwned) continue
    const vis = visibilityOf(def.id, false)
    const item: SkillListItemView = {
      id: def.id, kind: def.kind, label: def.label, visibility: vis,
      categoryLabel: vis !== 'unseen' ? CATEGORY_LABEL[def.mainCategory] : undefined,
      categoryColor: vis !== 'unseen' ? CATEGORY_COLOR[def.mainCategory] : undefined,
      flavorText: vis !== 'unseen' ? def.flavorText : undefined,
      effectTokens: vis !== 'unseen' ? buildSkillText(def, 1) : undefined,
    }
    if (def.kind === 'active') unownedActives.push(item); else unownedPassives.push(item)
  }
  const unownedTraits: SkillListItemView[] = []
  for (const def of content.traits.values()) {
    if (ownedTraitIds.has(def.id)) continue
    if (def.draftable === false) continue
    const vis = visibilityOf(def.id, false)
    unownedTraits.push({
      id: def.id, kind: 'trait', label: def.label, visibility: vis,
      flavorText: vis !== 'unseen' ? def.flavorText : undefined,
      effectTokens: vis !== 'unseen' ? buildSkillText(def, 1) : undefined,
    })
  }

  return { ownedActives, ownedPassives, ownedTraits, unownedActives, unownedPassives, unownedTraits }
})

// ── カテゴリ一覧（スキル一覧パネルの下） ─────────────────────
const categoryListCollapsed = ref(false)
const categoryRows = computed<CategoryRowView[]>(() => {
  const player = battle.state.player
  const points = battle.categoryPointsOf(player)
  return CATEGORY_IDS.map(id => {
    const current = points[id]
    const threshold = nextCategoryThreshold(current)
    return {
      id, label: CATEGORY_LABEL[id], color: CATEGORY_COLOR[id],
      current, threshold, maxed: current >= threshold,
      contributions: battle.categoryContributions(player, id),
    }
  })
})

// ── いま効いているもの ────────────────────────────────────────
const buffEntries = computed<BuffEntry[]>(() => {
  const player = battle.state.player
  const out: BuffEntry[] = []
  for (const t of player.traits) {
    const def = content.traits.get(t.id)
    out.push({ id: `trait:${t.id}`, label: def?.label ?? t.id, permanent: true, color: 'var(--battle-accent)' })
  }
  for (const m of player.temporary) {
    const view = describeTemporaryModifier(m)
    out.push({
      id: `tmp:${m.sourceId}:${m.stat}`,
      label: view.label,
      permanent: false,
      isBuff: view.isBuff,
      scopeLabel: view.scopeLabel,
      color: view.isBuff ? 'var(--battle-diff-plus)' : 'var(--battle-diff-minus)',
    })
  }
  return out
})

/** 敵にかかっているバフ/デバフ（呪詛弾のDEF低下など）。頭上のバッジで見える化する */
function statusEffectsOf(c: CombatantView): { label: string; isBuff: boolean; scopeLabel: string }[] {
  return c.temporary.map(describeTemporaryModifier)
}

function onRerollDraft(): void {
  soundManager.playSfx('battle_draft_reroll')
  battle.rerollDraft()
}

// ── ドラフト ──────────────────────────────────────────────────
const draftCards = computed<DraftCardView[]>(() => {
  if (!battle.state.draftOptions) return []
  return battle.state.draftOptions.map((opt, index) => {
    const meta = battle.draftOptionLabel(opt)
    if (opt.isFallback && opt.fallbackStat) {
      return {
        index, kind: 'passive' as const, label: `${STAT_LABEL[opt.fallbackStat]}強化`,
        flavorText: '特別なことは起きなかったが、少しだけ強くなった。',
        effectTokens: [{ type: 'stat' as const, text: STAT_LABEL[opt.fallbackStat] }, { type: 'plain' as const, text: 'が微増する' }],
        categoryLabel: '―',
      }
    }
    const def = opt.kind === 'trait' ? content.traits.get(opt.id) : content.skills.get(opt.id)
    const category = def && 'mainCategory' in def ? def.mainCategory : null

    // 所持済み(currentLevel あり)を選び直した時、実際にレベルが上がるのは
    // 必要スタック数に届く時だけ（skillDraft.ts の addStack 参照）。届かない場合に
    // 「次レベルの効果・Lv遷移」を無条件表示すると、選べば即レベルアップするように
    // 誤認させてしまうため、届くかどうかで表示を分ける。
    const currentLevel = opt.currentLevel ?? 0
    const currentStacks = opt.currentStacks ?? 0
    const required = currentLevel > 0 && currentLevel < 4 ? STACKS_REQUIRED[currentLevel] : 0
    const willLevelUp = required > 0 && currentStacks + 1 >= required
    const displayLevel = currentLevel === 0 ? 1 : willLevelUp ? currentLevel + 1 : currentLevel

    return {
      index, kind: opt.kind, label: meta?.label ?? opt.id, flavorText: meta?.flavorText ?? '',
      effectTokens: def ? buildSkillText(def, displayLevel) : [],
      categoryLabel: category ? CATEGORY_LABEL[category] : '―',
      categoryColor: category ? CATEGORY_COLOR[category] : undefined,
      categoryId: category ?? undefined,
      levelTransition: currentLevel === 0
        ? undefined
        : willLevelUp
          ? `Lv${currentLevel} → Lv${currentLevel + 1}`
          : `スタック ${currentStacks + 1}/${required}（今回はレベル据え置き）`,
      levelTransitionMuted: currentLevel !== 0 && !willLevelUp,
      isUnlocked: opt.isUnlocked,
    }
  })
})

const swapSlotsView = computed<SwapSlotView[]>(() => {
  const slots: SwapSlotView[] = []
  for (let i = 0; i < 4; i++) {
    const owned = battle.state.player.actives.find(a => a.slotIndex === i)
    const def = owned ? content.skills.get(owned.id) : undefined
    slots.push({ index: i, label: def?.label ?? '空き' })
  }
  return slots
})

function labelForCombatant(id: string | null | undefined): string {
  if (!id) return ''
  if (id === battle.state.player.id) return 'あなた'
  return battle.state.enemies.find(e => e.id === id)?.label ?? ''
}

/**
 * TURN の帯に添える「今動いている人」の名前だけを返す（「〜の手番です」という
 * 文には寄せない。TURN という見出し語がすでに文脈を示しているため、繰り返さない）。
 */
const currentActorLabel = computed(() => {
  if (battle.state.status !== 'battle') return ''
  if (battle.isPlayerTurn.value) return 'あなた'
  const id = battle.presentation.actorId ?? battle.state.turnQueue[battle.state.turnIndex]?.combatantId
  return labelForCombatant(id)
})

const bannerActorLabel = computed(() => labelForCombatant(battle.presentation.actorId))
</script>

<template>
  <div class="battle-screen" :style="themeVars">
    <BattleBackdrop :background="background" :floor-top="FLOOR_TOP" />
    <HelpGuide />

    <TurnBadge
      v-if="battle.state.status === 'battle'"
      :turn-number="battle.turnNumber.value"
      :battle-number="battle.battleNumber.value"
      :actor-label="currentActorLabel"
    />

    <div class="hud-left">
      <StatusPanel
        :collapsed="battle.state.ui.statusPanelCollapsed"
        :mode="battle.state.ui.statusPanelMode"
        :show-diff="battle.state.ui.showBuffDiff"
        :stats="playerStatRows"
        @toggle-collapsed="battle.toggleStatusCollapsed()"
        @toggle-mode="battle.toggleStatusMode()"
        @toggle-diff="battle.toggleBuffDiff()"
      />
      <SkillListPanel
        :collapsed="battle.state.ui.skillListCollapsed"
        v-bind="skillListView"
        @toggle-collapsed="battle.toggleSkillListCollapsed()"
      />
      <CategoryListPanel
        :collapsed="categoryListCollapsed"
        :rows="categoryRows"
        @toggle-collapsed="categoryListCollapsed = !categoryListCollapsed"
      />
    </div>

    <div
      class="battle-field"
      :class="{ shaking: fx.screenShake.value > 0 }"
      :style="{ '--shake-mag': fx.screenShake.value || 1 }"
    >
      <div v-if="fx.screenCriticalFlash.value" class="critical-screen-flash" />
      <div class="enemy-line" :style="{ bottom: `${(1 - FLOOR_TOP) * 100}%` }">
        <CharacterFrame
          v-for="(e, i) in battle.state.enemies"
          :key="e.id"
          side="enemy"
          :label="e.label"
          :hp="fx.displayedHpOf(e.id)"
          :max-hp="battle.effectiveOf(e).hp"
          :shield="e.shield"
          :alive="fx.displayedAliveOf(e.id)"
          :is-boss="e.isBoss"
          :sprite-id="e.spriteId"
          :sprite-height="enemySpriteHeight(e.isBoss)"
          :attacking="battle.presentation.posingId === e.id"
          :flash="fx.flashOf(e.id)"
          :critical="fx.criticalOf(e.id)"
          :popups="fx.popupsOf(e.id)"
          :next-skill-label="enemyPreviews[e.id]?.label ?? null"
          :next-damage-label="enemyPreviews[e.id]?.damage ?? null"
          :next-mark-color="enemyPreviews[e.id]?.markColor"
          :affinity-preview="affinityPreviewOf(e)"
          :status-effects="statusEffectsOf(e)"
          :targetable="menu === 'focus' && e.alive"
          :idle-seed="i"
          @open-detail="onUnitSelect(e, i)"
        />
      </div>

      <div class="player-slot">
        <CharacterFrame
          side="player"
          :label="battle.state.player.label"
          :hp="fx.displayedHpOf(battle.state.player.id)"
          :max-hp="playerMaxHp"
          :shield="battle.state.player.shield"
          :alive="fx.displayedAliveOf(battle.state.player.id)"
          :sprite-id="battle.state.player.spriteId"
          :sprite-height="playerSpriteHeight"
          :attacking="battle.presentation.posingId === battle.state.player.id"
          :flash="fx.flashOf(battle.state.player.id)"
          :critical="fx.criticalOf(battle.state.player.id)"
          :popups="fx.popupsOf(battle.state.player.id)"
          @open-detail="onUnitSelect(battle.state.player, null)"
        />
        <!--
          以前は .battle-field 左下の隅（プレイヤーの見た目と無関係な位置）に固定していたが、
          「位置が分かりづらい」というフィードバックを受け、敵の頭上/足元バッジと同じ発想で
          プレイヤー自身の足元（HPプレートの真下）に寄せた。.player-slot は position: absolute
          かつ bottom 基準のため、通常のフローに乗せると .status-row と同じ理由（このファイル内
          CharacterFrame.vue 参照）でプレイヤー本体が押し上げられてしまう。BuffStrip 側を
          .player-slot 基準の絶対配置にすることでそれを避けている。
        -->
        <BuffStrip :entries="buffEntries" />
      </div>

      <SkillCastBanner
        :visible="battle.presentation.phase !== 'idle'"
        :seq="battle.presentation.seq"
        :actor-label="bannerActorLabel"
        :skill-label="battle.presentation.skillLabel"
        :element="battle.presentation.element"
        :is-player="battle.presentation.actorIsPlayer"
      />
    </div>

    <div v-if="awaitingInput" class="command-area" :class="{ wide: menu === 'battle' }">
      <CommandMenu
        v-if="menu === 'root'"
        :entries="commandEntries"
        :active-id="hoveredCommand"
        @select="onCommandSelect"
        @hover="hoveredCommand = $event"
      />
      <SkillCommandPanel
        v-else-if="menu === 'battle'"
        :entries="skillEntries"
        :player-hp="battle.state.player.hp"
        :player-max-hp="playerMaxHp"
        @select="onSkillSelect"
        @cancel="onCancel"
        @preview="onSkillPreview"
      />
      <div v-else-if="menu === 'focus'" class="focus-hint">
        <div class="focus-title">対象を選ぶ</div>
        <div class="focus-body">敵をクリックしてください</div>
        <button type="button" class="focus-cancel" @click="onCancel">もどる</button>
      </div>
    </div>

    <SkillDraftPanel
      v-if="battle.state.status === 'drafting' || battle.state.status === 'swapping'"
      :options="draftCards"
      :swapping="battle.state.status === 'swapping'"
      :swap-slots="swapSlotsView"
      :notices="battle.state.lastBattleEndNotices"
      :reroll-charges="battle.state.rerollCharges"
      @select="battle.selectDraft"
      @confirm-swap="battle.confirmSwap"
      @cancel-swap="battle.cancelSwap"
      @reroll="onRerollDraft"
    />

    <InfoPanel
      v-if="infoOpen"
      :player="infoPlayerView"
      :player-effects="statusEffectsOf(battle.state.player)"
      :enemies="infoEnemyViews"
      :actives="infoActives"
      :passives="infoPassives"
      :traits="infoTraits"
      :initial-section-id="infoInitialId"
      @close="closeDetail"
    />
  </div>
</template>

<style scoped>
.battle-screen {
  position: absolute;
  inset: 0;
  z-index: 5;
  overflow: hidden;
  color: var(--battle-text);
  font-family: var(--genre-font, var(--font-main));

  /* ── バトル専用のCSSカスタムプロパティ。子コンポーネント（別スコープ）へも継承される ── */
  --battle-element-physical: #ff7a5c;
  --battle-element-magical: #6fb4ff;
  --battle-element-special: #c88bff;
  --battle-stat: var(--battle-accent);
  --battle-number: #ffe9a8;
  --battle-diff-plus: #7ee08a;
  --battle-diff-minus: #ff6a6a;
  --battle-diff-muted: #a6a2b0;
  --battle-category-heal: #7ee08a;
  --battle-category-aegis: #63b8ff;
  --battle-category-guard: #e0c46a;
  --battle-category-curse: #b98bff;
  --battle-category-vitality: #8bd46a;
  --battle-category-might: #ff7a5c;
  --battle-category-wisdom: #7ac8ff;
  --battle-category-swift: #4de0c0;
  --battle-category-fatal: #ff4a6a;
  --battle-category-pierce: #ffd23a;
  --battle-category-combo: #ff9ecb;

  /* 背景JSONが上書きする（未設定時のフォールバック） */
  --battle-accent: #e0c46a;
  --battle-panel: #15131e;
  --battle-text: #f2ecdd;
  --battle-boss: #ff8f6a;
  --battle-frame-border: rgba(255, 255, 255, 0.22);
}

/* 左上・TURN表示の下に収まる高さから始める。要点だけの小さめ表示にして、
   詳しい内容は COMMAND の INFO（キャラクター詳細モーダル）に譲る */
.hud-left {
  position: absolute;
  top: 78px;
  left: 10px;
  /* ドラフト画面（.draft-overlay, z-index:35）より手前に出し、ドラフト中も
     ステータス・所持スキルを確認できるようにする */
  z-index: 36;
  display: flex;
  flex-direction: column;
  gap: 6px;
  width: 152px;
}
.hud-left :deep(.status-panel),
.hud-left :deep(.skill-list-panel),
.hud-left :deep(.category-list-panel) {
  min-width: 0;
  font-size: 10px;
}
.hud-left :deep(.skill-list-panel) {
  max-height: 32vh;
}
.hud-left :deep(.category-list-panel) {
  max-height: 26vh;
}

.battle-field {
  position: absolute;
  inset: 0;
  z-index: 2;
}
/* クリティカル演出をキャラクター単体に留めず戦場全体で一瞬光らせる（派手さの要望対応） */
.critical-screen-flash {
  position: absolute;
  inset: 0;
  z-index: 25;
  pointer-events: none;
  background: radial-gradient(
    ellipse at center,
    color-mix(in srgb, #fff6d0 85%, transparent) 0%,
    color-mix(in srgb, #ffd23a 45%, transparent) 45%,
    transparent 78%
  );
  animation: critical-flash-fade 380ms ease-out forwards;
}
@keyframes critical-flash-fade {
  0% { opacity: 0.95; }
  100% { opacity: 0; }
}
.battle-field.shaking {
  animation: field-shake 280ms cubic-bezier(0.36, 0.07, 0.19, 0.97);
}
/* 揺れ幅は emit された shake の強さ（--shake-mag）に比例させる。物理ヒットより
   クリティカルの方が大きく揺れる、といった差を出すため */
@keyframes field-shake {
  0% { transform: translate(0, 0) scale(1); }
  16% { transform: translate(calc(var(--shake-mag, 1) * -16px), calc(var(--shake-mag, 1) * 7px)) scale(1.018); }
  34% { transform: translate(calc(var(--shake-mag, 1) * 13px), calc(var(--shake-mag, 1) * -9px)) scale(1.012); }
  52% { transform: translate(calc(var(--shake-mag, 1) * -9px), calc(var(--shake-mag, 1) * 6px)) scale(1.008); }
  70% { transform: translate(calc(var(--shake-mag, 1) * 6px), calc(var(--shake-mag, 1) * -3px)) scale(1.004); }
  86% { transform: translate(calc(var(--shake-mag, 1) * -2px), calc(var(--shake-mag, 1) * 1px)) scale(1.001); }
  100% { transform: translate(0, 0) scale(1); }
}

/* 敵は床の際に立たせる。並ぶときは左右へ広がる */
.enemy-line {
  position: absolute;
  left: 0;
  right: 0;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  gap: 40px;
}
/* HPプレートが足元の外（通常のフロー）に付くぶん、画面下部の説明書投擲ボタンと
   重ならない高さまで持ち上げる */
.player-slot {
  position: absolute;
  left: 50%;
  bottom: 12%;
  transform: translateX(-50%);
}

/* プレイヤー側（画面下寄り）に寄せる。説明書パネル（右下）とは高さで避ける */
.command-area {
  position: absolute;
  right: 275px;
  top: 55%;
  z-index: 16;
}
/*
 * BATTLE で開く技の一覧（SkillCommandPanel, 320px）は COMMAND（CommandMenu, 210px）より
 * 110px 広い。同じ right:275px のままだと左端がその分プレイヤー側へ食い込んで身体と
 * 被っていた。right を狭めて左端（プレイヤー側の辺）を COMMAND の左端に揃え、
 * 広がった分は右（説明書パネル側の空き）へ逃がす。
 * right_wide = right_root + width_root - width_wide = 275 + 210 - 320 = 165
 */
.command-area.wide {
  right: 165px;
}
.focus-hint {
  width: 210px;
  padding: 12px 14px;
  background: #f6e3cf;
  border: 3px solid #d9564b;
  color: #4a2a1e;
  text-align: center;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
  transform-origin: right center;
  animation: menu-pop-in 220ms cubic-bezier(0.2, 1, 0.3, 1);
}
.focus-title {
  font-size: 17px;
  font-weight: 700;
  letter-spacing: 2px;
}
.focus-body {
  margin: 4px 0 8px;
  font-size: 12px;
}
.focus-cancel {
  padding: 3px 14px;
  background: transparent;
  border: 2px solid #c98a5a;
  font: inherit;
  font-size: 12px;
  color: #4a2a1e;
  cursor: pointer;
}

/*
 * コマンドの切り替えは Vue の <Transition> ではなく CSS の入場アニメーションだけで表現する。
 * <Transition mode="out-in"> は退場側の完了検出を getComputedStyle の transition-duration に
 * 依存しており、happy-dom（単体テスト環境）では実際のトランジションが走らないため退場が
 * 永久に終わらず、新しいメニューが DOM に現れない状態でテストが詰まる不具合が起きた。
 * CSS animation は要素が挿入された瞬間に自動再生されるため、この問題を避けられる。
 * 同名の @keyframes を CommandMenu.vue / SkillCommandPanel.vue にも定義している
 * （@keyframes は scoped の対象外でグローバルだが、コンポーネント単体で完結させるため）。
 *
 * .command-area は right 基準で配置しているため、translateX で横に滑らせると
 * パネル幅の違い（CommandMenu 210px ⇄ SkillCommandPanel 320px）で「位置がずれた」ように
 * 見えてしまっていた。right 側を固定端とみなし、scale の起点を transform-origin で
 * その固定端へ合わせることで、見た目の位置を動かさずに出現させる。
 */
@keyframes menu-pop-in {
  from { opacity: 0; transform: scale(0.94); }
  to { opacity: 1; transform: scale(1); }
}
</style>
