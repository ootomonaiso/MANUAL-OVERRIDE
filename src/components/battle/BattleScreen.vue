<script setup lang="ts">
/**
 * components/battle/BattleScreen.vue
 * rpg ジャンル（ローグライク戦闘）の画面全体レイアウト（docs/genre/rpg/08-ui.md）。
 */
import { computed, ref } from 'vue'
import type { useBattleState, CombatantView } from '../../composables/useBattleState'
import StatusPanel from './StatusPanel.vue'
import type { StatRowView } from './StatusPanel.vue'
import SkillListPanel from './SkillListPanel.vue'
import type { SkillListItemView } from './SkillListPanel.vue'
import ActiveSkillBar from './ActiveSkillBar.vue'
import type { ActiveSlotView } from './ActiveSkillBar.vue'
import FocusSelector from './FocusSelector.vue'
import type { FocusEnemyView } from './FocusSelector.vue'
import TurnQueueBar from './TurnQueueBar.vue'
import type { TurnQueueEntryView, EnemyNextSkillView } from './TurnQueueBar.vue'
import CharacterFrame from './CharacterFrame.vue'
import CharacterDetail from './CharacterDetail.vue'
import type { DetailStatRow, DetailSkillRow } from './CharacterDetail.vue'
import SkillDraftPanel from './SkillDraftPanel.vue'
import type { DraftCardView, SwapSlotView } from './SkillDraftPanel.vue'
import BattleEffectLayer from './BattleEffectLayer.vue'
import type { StatKey, PlayerAction, SkillDef } from '../../domain/battle/types'
import { STAT_KEYS } from '../../domain/battle/types'
import { STAT_LABEL, CATEGORY_LABEL, buildSkillText } from '../../domain/battle/skillText'
import { STACKS_REQUIRED } from '../../domain/battle/skillDraft'
import { BATTLE_CONTENT } from '../../data/battleContent'

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

const PERCENT_STATS = new Set<StatKey>(['hitRate', 'evadeRate', 'critRate', 'critDamageMultiplier'])

function statRows(c: CombatantView): StatRowView[] {
  const eff = battle.effectiveOf(c)
  return STAT_KEYS.map(k => ({
    key: k, label: STAT_LABEL[k], base: c.baseStats[k], effective: eff[k], isPercent: PERCENT_STATS.has(k),
  }))
}

const playerStatRows = computed(() => statRows(battle.state.player))
const playerMaxHp = computed(() => battle.effectiveOf(battle.state.player).hp)

// ── アクティブスキルバー ─────────────────────────────────────
const activeSlots = computed<(ActiveSlotView | null)[]>(() => {
  const slots: (ActiveSlotView | null)[] = [null, null, null, null]
  for (const a of battle.state.player.actives) {
    if (a.slotIndex === null) continue
    const def = content.skills.get(a.id)
    slots[a.slotIndex] = {
      id: a.id,
      label: def?.label ?? a.id,
      level: a.level,
      stacks: a.stacks,
      stacksRequired: STACKS_REQUIRED[Math.min(a.level, 3)] ?? 0,
      cooldown: a.cooldown,
    }
  }
  return slots
})

// ── 行動選択 → フォーカス要否判定 ────────────────────────────
const pendingAction = ref<PlayerAction | null>(null)

const focusEnemies = computed<FocusEnemyView[]>(() =>
  battle.state.enemies.map((e, i) => ({ index: i, label: e.label, alive: e.alive })),
)

function onSelectActive(slotIndex: number): void {
  const owned = battle.state.player.actives.find(a => a.slotIndex === slotIndex)
  if (!owned) return
  const def = content.skills.get(owned.id)
  if (!def || def.kind !== 'active') return
  const aliveCount = battle.state.enemies.filter(e => e.alive).length
  if (def.defaultFocus === 'enemy' && def.focusRange === 'single' && aliveCount > 1) {
    pendingAction.value = { kind: 'active', slotIndex }
  } else {
    battle.selectAction({ kind: 'active', slotIndex }, null)
  }
}
function onFocusSelect(enemyIndex: number): void {
  if (!pendingAction.value) return
  battle.selectAction(pendingAction.value, enemyIndex)
  pendingAction.value = null
}
function onFocusCancel(): void {
  pendingAction.value = null
}
function onSelectBuiltin(action: 'guard' | 'pass' | 'dodge'): void {
  battle.selectAction({ kind: 'builtin', action })
}

// ── 行動順・敵の次スキル ──────────────────────────────────────
const turnQueueView = computed<TurnQueueEntryView[]>(() =>
  battle.state.turnQueue.map((entry, i) => {
    const isPlayer = entry.combatantId === battle.state.player.id
    const enemy = battle.state.enemies.find(e => e.id === entry.combatantId)
    return {
      id: entry.combatantId,
      label: isPlayer ? 'あなた' : (enemy?.label ?? '?'),
      isPlayer,
      isCurrent: i === battle.state.turnIndex,
    }
  }),
)
const enemyNextSkills = computed<EnemyNextSkillView[]>(() =>
  battle.state.enemies.filter(e => e.alive).map(e => {
    const skillId = battle.nextEnemySkillPreview(e)
    const def = skillId ? content.skills.get(skillId) : undefined
    return { enemyLabel: e.label, skillLabel: def?.label ?? null }
  }),
)

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

// ── スキル一覧パネル ──────────────────────────────────────────
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

const swapSlotsView = computed<SwapSlotView[]>(() =>
  activeSlots.value.map((s, i) => ({ index: i, label: s ? s.label : '空き' })),
)

function labelForCombatant(id: string | undefined): string {
  if (!id) return ''
  if (id === battle.state.player.id) return 'あなた'
  return battle.state.enemies.find(e => e.id === id)?.label ?? ''
}
</script>

<template>
  <div class="battle-screen">
    <TurnQueueBar :entries="turnQueueView" :enemy-next-skills="enemyNextSkills" />

    <div class="battle-main">
      <div class="side-panels">
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
      </div>

      <div class="battle-field">
        <div class="enemy-row">
          <CharacterFrame
            v-for="e in battle.state.enemies"
            :key="e.id"
            :label="e.label"
            :hp="e.hp"
            :max-hp="battle.effectiveOf(e).hp"
            :shield="e.shield"
            :alive="e.alive"
            :is-boss="e.isBoss"
            @open-detail="openDetail(e)"
          />
        </div>

        <div v-if="pendingAction" class="focus-overlay">
          <FocusSelector :enemies="focusEnemies" range-label="対象を1体選択" @select="onFocusSelect" @cancel="onFocusCancel" />
        </div>

        <div class="player-row">
          <CharacterFrame
            :label="battle.state.player.label"
            :hp="battle.state.player.hp"
            :max-hp="playerMaxHp"
            :shield="battle.state.player.shield"
            :alive="battle.state.player.alive"
            @open-detail="openDetail(battle.state.player)"
          />
        </div>

        <ActiveSkillBar
          :slots="activeSlots"
          :guard-or-dodge="battle.guardOrDodge.value"
          :guard-cooldown="battle.state.player.builtinCooldowns[battle.guardOrDodge.value]"
          :disabled="!battle.isPlayerTurn.value || pendingAction !== null"
          @select-active="onSelectActive"
          @select-builtin="onSelectBuiltin"
        />
      </div>
    </div>

    <BattleEffectLayer
      :queue-length="battle.effectQueue.value.length"
      :consume="battle.consumeEffect"
      :label-for="labelForCombatant"
    />

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
  display: flex;
  flex-direction: column;
  background: var(--genre-bg, var(--bg));
  color: var(--genre-text, var(--text));
  font-family: var(--genre-font, var(--font-main));
  overflow: hidden;

  /* ── バトル専用のCSSカスタムプロパティ。子コンポーネント（別スコープ）へも継承される ── */
  --battle-element-physical: #c0392b;
  --battle-element-magical: #2e6fbb;
  --battle-element-special: #a04fd6;
  --battle-stat: var(--genre-accent, #c4960a);
  --battle-number: #e0c060;
  --battle-diff-plus: #4caf50;
  --battle-diff-minus: #d94b4b;
  --battle-diff-muted: #999999;
  --battle-category-heal: #4caf50;
  --battle-category-aegis: #4fa3d6;
  --battle-category-guard: #8b6100;
  --battle-category-curse: #7a4fd6;
}

.battle-main {
  flex: 1;
  display: flex;
  gap: 12px;
  padding: 8px 12px;
  /* 画面下部中央の「説明書を投げてゲームを終わらせる」ボタン（App.vue .giveup-area,
     bottom:16px 付近, z-index:15）と重ならないよう余白を確保する */
  padding-bottom: 76px;
  overflow: hidden;
}
.side-panels {
  display: flex;
  flex-direction: column;
  gap: 8px;
  width: 200px;
  flex-shrink: 0;
  overflow-y: auto;
}
.battle-field {
  flex: 1;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  position: relative;
}
.enemy-row {
  display: flex;
  justify-content: center;
  gap: 24px;
  padding-top: 12px;
}
.player-row {
  display: flex;
  justify-content: center;
  padding-bottom: 8px;
}
.focus-overlay {
  display: flex;
  justify-content: center;
  padding: 8px 0;
}
</style>
