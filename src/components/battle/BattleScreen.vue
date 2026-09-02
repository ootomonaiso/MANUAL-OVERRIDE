<script setup lang="ts">
/**
 * components/battle/BattleScreen.vue
 * rpg ジャンル（ローグライク戦闘）の画面全体レイアウト（docs/genre/rpg/08-ui.md）。
 *
 * 画面の主役はキャラクターで、情報はその身体に重ねる。
 * 行動の選択は右側のコマンド（COMMAND → BATTLE → 技）へ集約し、
 * 戦場そのものには常設のパネルを置かない。
 */
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import type { useBattleState, CombatantView } from '../../composables/useBattleState'
import { useBattlePresentation } from '../../composables/useBattlePresentation'
import StatusPanel from './StatusPanel.vue'
import type { StatRowView } from './StatusPanel.vue'
import SkillListPanel from './SkillListPanel.vue'
import type { SkillListItemView } from './SkillListPanel.vue'
import CommandMenu from './CommandMenu.vue'
import type { CommandEntry } from './CommandMenu.vue'
import SkillCommandPanel from './SkillCommandPanel.vue'
import type { SkillCommandEntry } from './SkillCommandPanel.vue'
import TurnBadge from './TurnBadge.vue'
import TacticsBanner from './TacticsBanner.vue'
import BuffStrip from './BuffStrip.vue'
import type { BuffEntry } from './BuffStrip.vue'
import CharacterFrame from './CharacterFrame.vue'
import CharacterDetail from './CharacterDetail.vue'
import type { DetailStatRow, DetailSkillRow } from './CharacterDetail.vue'
import SkillDraftPanel from './SkillDraftPanel.vue'
import type { DraftCardView, SwapSlotView } from './SkillDraftPanel.vue'
import BattleBackdrop from './BattleBackdrop.vue'
import SkillCastBanner from './SkillCastBanner.vue'
import type { StatKey, PlayerAction, SkillDef, Element } from '../../domain/battle/types'
import { STAT_KEYS } from '../../domain/battle/types'
import { STAT_LABEL, CATEGORY_LABEL, buildSkillText } from '../../domain/battle/skillText'
import { STACKS_REQUIRED } from '../../domain/battle/skillDraft'
import { damageMagnitude, MAGNITUDE_LABEL } from '../../domain/battle/damagePreview'
import { BATTLE_CONTENT } from '../../data/battleContent'
import { findBattleBackground } from '../../data/battleBackgrounds'
import { BATTLE } from '../../data/tunables'
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

/** 背景写真と手前の床の境目。キャラクターの立ち位置もここに合わせる */
const FLOOR_TOP = 0.62
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

const playerSpriteHeight = computed(() => Math.round(viewportHeight.value * 0.4))
function enemySpriteHeight(isBoss: boolean): number {
  return Math.round(viewportHeight.value * (isBoss ? 0.4 : 0.32))
}

const PERCENT_STATS = new Set<StatKey>(['hitRate', 'evadeRate', 'critRate', 'critDamageMultiplier'])

function statRows(c: CombatantView): StatRowView[] {
  const eff = battle.effectiveOf(c)
  return STAT_KEYS.map(k => ({
    key: k, label: STAT_LABEL[k], base: c.baseStats[k], effective: eff[k], isPercent: PERCENT_STATS.has(k),
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
type MenuMode = 'root' | 'battle' | 'focus' | 'info'
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

const GUARD_DESCRIPTION = `このターンに受けるダメージを${Math.round(BATTLE.guard.cutRate * 100)}%軽減する`
const DODGE_DESCRIPTION = `このターンの回避率を${Math.round(BATTLE.dodge.evadeBonus * 100)}%上げる`

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
      cooldown: owned.cooldown,
      disabled: owned.cooldown > 0,
      note: `Lv${owned.level}`,
      effectTokens: buildSkillText(def, owned.level),
    })
  }
  const builtin = battle.guardOrDodge.value
  const builtinCooldown = player.builtinCooldowns[builtin]
  entries.push({
    id: `builtin:${builtin}`,
    label: builtin === 'dodge' ? '避ける' : '守る',
    markColor: 'var(--battle-category-guard)',
    cooldown: builtinCooldown,
    disabled: builtinCooldown > 0,
    description: builtin === 'dodge' ? DODGE_DESCRIPTION : GUARD_DESCRIPTION,
  })
  entries.push({
    id: 'builtin:pass',
    label: '何もしない',
    markColor: 'var(--battle-diff-muted)',
    cooldown: 0,
    disabled: false,
    description: 'この手番は何もせず、次の手番へ送る',
  })
  return entries
})

function onCommandSelect(id: string): void {
  soundManager.playSfx('battle_skill_select')
  if (id === 'battle') menu.value = 'battle'
  else if (id === 'info') menu.value = 'info'
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

// ── 敵の予告 ──────────────────────────────────────────────────
interface NextPreview { label: string | null; damage: string | null }

function nextPreviewOf(e: CombatantView): NextPreview {
  const skillId = battle.nextEnemySkillPreview(e)
  const def = skillId ? content.skills.get(skillId) : undefined
  if (!def) return { label: null, damage: null }
  const owned = e.actives.find(a => a.id === skillId)
  const damage = battle.estimateDamageToPlayer(e, skillId as string, owned?.level ?? 1)
  const magnitude = damageMagnitude(damage, playerMaxHp.value)
  return { label: def.label, damage: magnitude === 'none' ? null : MAGNITUDE_LABEL[magnitude] }
}

/** テンプレートから2回呼ばないよう、敵ごとの予告をまとめて作る */
const enemyPreviews = computed<Record<string, NextPreview>>(() => {
  const out: Record<string, NextPreview> = {}
  for (const e of battle.state.enemies) out[e.id] = nextPreviewOf(e)
  return out
})

// ── キャラクター詳細 ──────────────────────────────────────────
const detailTarget = ref<CombatantView | null>(null)

function skillRowsFrom(
  refs: readonly { id: string; level: number }[], lookup: (id: string) => SkillDef | undefined,
): DetailSkillRow[] {
  const rows: DetailSkillRow[] = []
  for (const r of refs) {
    const def = lookup(r.id)
    if (!def) continue
    rows.push({ id: r.id, label: def.label, level: r.level, flavorText: def.flavorText, effectTokens: buildSkillText(def, r.level) })
  }
  return rows
}

function openDetail(c: CombatantView): void {
  battle.markSeen([
    ...c.traits.map(t => t.id),
    ...c.passives.map(p => p.id),
    ...c.actives.map(a => a.id),
  ])
  detailTarget.value = c
}
function closeDetail(): void { detailTarget.value = null }

const detailView = computed(() => {
  const c = detailTarget.value
  if (!c) return null
  const stats: DetailStatRow[] = statRows(c)
  return {
    title: c.label,
    stats,
    traits: skillRowsFrom(c.traits.map(t => ({ id: t.id, level: 1 })), id => content.traits.get(id)),
    passives: skillRowsFrom(c.passives, id => content.skills.get(id)),
    actives: skillRowsFrom(c.actives.filter(a => a.slotIndex !== null), id => content.skills.get(id)),
  }
})

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
      stored: a.slotIndex === null,
      flavorText: def?.flavorText, effectTokens: def ? buildSkillText(def, a.level) : undefined,
    }
  })
  const ownedPassives: SkillListItemView[] = player.passives.map(p => {
    const def = content.skills.get(p.id)
    return {
      id: p.id, kind: 'passive', label: def?.label ?? p.id, visibility: 'owned',
      level: p.level, stacks: p.stacks, stacksRequired: STACKS_REQUIRED[Math.min(p.level, 3)] ?? 0,
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
    const isOwned = def.kind === 'active' ? ownedActiveIds.has(def.id) : ownedPassiveIds.has(def.id)
    if (isOwned) continue
    const vis = visibilityOf(def.id, false)
    const item: SkillListItemView = {
      id: def.id, kind: def.kind, label: def.label, visibility: vis,
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

// ── いま効いているもの ────────────────────────────────────────
const buffEntries = computed<BuffEntry[]>(() => {
  const player = battle.state.player
  const out: BuffEntry[] = []
  for (const t of player.traits) {
    const def = content.traits.get(t.id)
    out.push({ id: `trait:${t.id}`, label: def?.label ?? t.id, permanent: true, color: 'var(--battle-accent)' })
  }
  for (const m of player.temporary) {
    const label = m.sourceId === 'guard' ? '防御態勢'
      : m.sourceId === 'dodge' ? '回避態勢'
        : m.stat === 'cutRate' ? 'ダメージ軽減'
          : `${STAT_LABEL[m.stat]}変化`
    out.push({
      id: `tmp:${m.sourceId}:${m.stat}`,
      label,
      permanent: false,
      color: (m.flat ?? m.rate ?? 0) < 0 ? 'var(--battle-diff-minus)' : 'var(--battle-diff-plus)',
    })
  }
  return out
})

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
    return {
      index, kind: opt.kind, label: meta?.label ?? opt.id, flavorText: meta?.flavorText ?? '',
      effectTokens: def ? buildSkillText(def, opt.currentLevel ? opt.currentLevel + 1 : 1) : [],
      categoryLabel: def && 'mainCategory' in def && def.mainCategory ? CATEGORY_LABEL[def.mainCategory] : '―',
      levelTransition: opt.currentLevel ? `Lv${opt.currentLevel} → Lv${Math.min(4, opt.currentLevel + 1)}` : undefined,
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

const currentActorLabel = computed(() => {
  if (battle.state.status !== 'battle') return '―'
  if (battle.isPlayerTurn.value) return 'あなたの手番'
  const id = battle.presentation.actorId ?? battle.state.turnQueue[battle.state.turnIndex]?.combatantId
  const label = labelForCombatant(id)
  return label ? `${label}の手番` : '―'
})

const bannerActorLabel = computed(() => labelForCombatant(battle.presentation.actorId))
</script>

<template>
  <div class="battle-screen" :style="themeVars">
    <BattleBackdrop :background="background" :floor-top="FLOOR_TOP" />

    <TurnBadge
      :turn-number="battle.turnNumber.value"
      :battle-number="battle.battleNumber.value"
      :actor-label="currentActorLabel"
    />
    <TacticsBanner :visible="awaitingInput" text="Decide on tactics!" />

    <div class="battle-field" :class="{ shaking: fx.screenShake.value > 0 }">
      <div class="enemy-line" :style="{ bottom: `${(1 - FLOOR_TOP) * 100}%` }">
        <CharacterFrame
          v-for="(e, i) in battle.state.enemies"
          :key="e.id"
          side="enemy"
          :label="e.label"
          :hp="e.hp"
          :max-hp="battle.effectiveOf(e).hp"
          :shield="e.shield"
          :alive="e.alive"
          :is-boss="e.isBoss"
          :sprite-id="e.spriteId"
          :sprite-height="enemySpriteHeight(e.isBoss)"
          :attacking="battle.presentation.posingId === e.id"
          :flash="fx.flashOf(e.id)"
          :popups="fx.popupsOf(e.id)"
          :next-skill-label="enemyPreviews[e.id]?.label ?? null"
          :next-damage-label="enemyPreviews[e.id]?.damage ?? null"
          :targetable="menu === 'focus' && e.alive"
          @open-detail="onUnitSelect(e, i)"
        />
      </div>

      <div class="player-slot">
        <CharacterFrame
          side="player"
          :label="battle.state.player.label"
          :hp="battle.state.player.hp"
          :max-hp="playerMaxHp"
          :shield="battle.state.player.shield"
          :alive="battle.state.player.alive"
          :sprite-id="battle.state.player.spriteId"
          :sprite-height="playerSpriteHeight"
          :attacking="battle.presentation.posingId === battle.state.player.id"
          :flash="fx.flashOf(battle.state.player.id)"
          :popups="fx.popupsOf(battle.state.player.id)"
          @open-detail="onUnitSelect(battle.state.player, null)"
        />
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

    <BuffStrip :entries="buffEntries" />

    <div v-if="awaitingInput" class="command-area">
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
        @select="onSkillSelect"
        @cancel="onCancel"
      />
      <div v-else-if="menu === 'focus'" class="focus-hint">
        <div class="focus-title">対象を選ぶ</div>
        <div class="focus-body">敵をクリックしてください</div>
        <button type="button" class="focus-cancel" @click="onCancel">もどる</button>
      </div>
    </div>

    <div v-if="menu === 'info'" class="info-overlay">
      <StatusPanel
        :collapsed="false"
        :mode="battle.state.ui.statusPanelMode"
        :show-diff="battle.state.ui.showBuffDiff"
        :stats="playerStatRows"
        @toggle-collapsed="onCancel"
        @toggle-mode="battle.toggleStatusMode()"
        @toggle-diff="battle.toggleBuffDiff()"
      />
      <SkillListPanel
        :collapsed="false"
        v-bind="skillListView"
        @toggle-collapsed="onCancel"
      />
    </div>

    <SkillDraftPanel
      v-if="battle.state.status === 'drafting' || battle.state.status === 'swapping'"
      :options="draftCards"
      :swapping="battle.state.status === 'swapping'"
      :swap-slots="swapSlotsView"
      @select="battle.selectDraft"
      @confirm-swap="battle.confirmSwap"
      @cancel-swap="battle.cancelSwap"
    />

    <CharacterDetail
      v-if="detailView"
      v-bind="detailView"
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

  /* 背景JSONが上書きする（未設定時のフォールバック） */
  --battle-accent: #e0c46a;
  --battle-panel: #15131e;
  --battle-text: #f2ecdd;
  --battle-boss: #ff8f6a;
  --battle-frame-border: rgba(255, 255, 255, 0.22);
}

.battle-field {
  position: absolute;
  inset: 0;
  z-index: 2;
}
.battle-field.shaking {
  animation: field-shake 220ms ease-in-out;
}
@keyframes field-shake {
  0% { transform: translate(0, 0); }
  25% { transform: translate(-7px, 3px); }
  50% { transform: translate(6px, -4px); }
  75% { transform: translate(-4px, 2px); }
  100% { transform: translate(0, 0); }
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
/* 自キャラは画面下端で見切れるくらい手前に置く */
.player-slot {
  position: absolute;
  left: 50%;
  bottom: -3%;
  transform: translateX(-50%);
}

.command-area {
  position: absolute;
  right: 26px;
  top: 28%;
  z-index: 16;
}
.focus-hint {
  width: 210px;
  padding: 12px 14px;
  background: #f6e3cf;
  border: 3px solid #d9564b;
  color: #4a2a1e;
  text-align: center;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
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

.info-overlay {
  position: absolute;
  left: 16px;
  top: 10%;
  z-index: 22;
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 260px;
  max-height: 78vh;
  overflow-y: auto;
}
</style>
