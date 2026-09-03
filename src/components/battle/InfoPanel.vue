<script setup lang="ts">
/**
 * COMMAND → INFO、またはキャラクターをクリックした時に開く詳細パネル。
 * 以前は「押したキャラ1体ぶんのステータス・スキル」だけを表示するモーダルだったが、
 * 「もっと大きなパネルで、プレイヤー・敵・アクティブ/パッシブ/特性をまとめて見たい」
 * というフィードバックを受け、InfoPanelShell（左セクション一覧・右詳細）の上に
 * 戦闘全体の情報をまとめる形へ作り直した。
 *
 * 敵をクリックした時は該当の敵セクションへ、それ以外（COMMAND→INFOや自キャラクリック）は
 * プレイヤーのステータスへ、それぞれ開いた瞬間から飛べるよう initialSectionId で受け取る。
 */
import { computed, ref } from 'vue'
import PixelSprite from './PixelSprite.vue'
import SkillText from './SkillText.vue'
import GlossaryTerm from './GlossaryTerm.vue'
import InfoPanelShell from './InfoPanelShell.vue'
import type { InfoNavSection } from './InfoPanelShell.vue'
import type { SkillTextToken } from '../../domain/battle/skillText'

export interface InfoStatRow {
  key: string
  label: string
  base: number
  effective: number
  isPercent: boolean
}

export interface InfoSkillRow {
  id: string
  label: string
  level?: number
  flavorText: string
  effectTokens: SkillTextToken[]
}

export interface InfoCharacterView {
  id: string
  label: string
  spriteId: string
  hp: number
  maxHp: number
  isBoss?: boolean
  stats: InfoStatRow[]
  /** 敵のみ持つ。プレイヤーのアクティブ/パッシブ/特性は別グループで表示するため省略する */
  skills?: {
    actives: InfoSkillRow[]
    passives: InfoSkillRow[]
    traits: InfoSkillRow[]
  }
}

export interface InfoEffectRow {
  label: string
  isBuff: boolean
  scopeLabel: string
}

const props = defineProps<{
  player: InfoCharacterView
  /** プレイヤーに今かかっている一時的なバフ/デバフ（呪詛弾のDEF低下など）。永続の特性は traits 側で表示するため含まない */
  playerEffects: InfoEffectRow[]
  enemies: InfoCharacterView[]
  actives: InfoSkillRow[]
  passives: InfoSkillRow[]
  traits: InfoSkillRow[]
  initialSectionId: string | null
}>()

const emit = defineEmits<{
  (e: 'close'): void
}>()

const activeId = ref(props.initialSectionId ?? 'player')

const sections = computed<InfoNavSection[]>(() => {
  const out: InfoNavSection[] = [{ id: 'player', label: 'プレイヤーステータス' }]
  if (props.enemies.length > 0) {
    out.push({
      id: 'group-enemies', label: '敵情報', isGroup: true,
      children: props.enemies.map(e => ({ id: `enemy:${e.id}`, label: e.label })),
    })
  }
  if (props.actives.length > 0) {
    out.push({
      id: 'group-actives', label: 'アクティブスキル', isGroup: true,
      children: props.actives.map(a => ({ id: `active:${a.id}`, label: a.label })),
    })
  }
  if (props.passives.length > 0) {
    out.push({
      id: 'group-passives', label: 'パッシブ', isGroup: true,
      children: props.passives.map(p => ({ id: `passive:${p.id}`, label: p.label })),
    })
  }
  if (props.traits.length > 0) {
    out.push({
      id: 'group-traits', label: '特性', isGroup: true,
      children: props.traits.map(t => ({ id: `trait:${t.id}`, label: t.label })),
    })
  }
  return out
})

const currentEnemy = computed(() => {
  if (!activeId.value.startsWith('enemy:')) return null
  const id = activeId.value.slice('enemy:'.length)
  return props.enemies.find(e => e.id === id) ?? null
})

function findSkill(prefix: string, list: InfoSkillRow[]): InfoSkillRow | null {
  if (!activeId.value.startsWith(prefix)) return null
  const id = activeId.value.slice(prefix.length)
  return list.find(s => s.id === id) ?? null
}
const currentSkill = computed<InfoSkillRow | null>(() =>
  findSkill('active:', props.actives) ?? findSkill('passive:', props.passives) ?? findSkill('trait:', props.traits),
)

function fmt(v: number, isPercent: boolean): string {
  return isPercent ? `${Math.round(v * 1000) / 10}%` : `${Math.round(v)}`
}
function hpPct(c: InfoCharacterView): number {
  return c.maxHp > 0 ? Math.max(0, Math.min(1, c.hp / c.maxHp)) * 100 : 0
}
</script>

<template>
  <InfoPanelShell
    title="INFO"
    :sections="sections"
    :active-id="activeId"
    @update:active-id="activeId = $event"
    @close="emit('close')"
  >
    <div v-if="activeId === 'player'" class="info-char-pane">
      <div class="info-char-head">
        <PixelSprite :sprite-id="player.spriteId" :target-height="96" />
        <div class="info-hp-bar">
          <div class="info-hp-track"><div class="info-hp-fill" :style="{ width: `${hpPct(player)}%` }" /></div>
          <span class="info-hp-num">{{ Math.max(0, Math.floor(player.hp)) }}/{{ Math.floor(player.maxHp) }}</span>
        </div>
      </div>
      <div class="stat-grid">
        <div v-for="s in player.stats" :key="s.key" class="stat-cell">
          <span class="stat-name"><GlossaryTerm :term-id="s.key">{{ s.label }}</GlossaryTerm></span>
          <span class="stat-values">実効 {{ fmt(s.effective, s.isPercent) }} / 基礎 {{ fmt(s.base, s.isPercent) }}</span>
        </div>
      </div>

      <div v-if="playerEffects.length > 0" class="info-skill-group">
        <div class="info-skill-group-title">現在の効果</div>
        <div class="effect-chip-row">
          <span
            v-for="e in playerEffects"
            :key="e.label"
            class="effect-chip"
            :class="{ buff: e.isBuff, debuff: !e.isBuff }"
          >{{ e.isBuff ? '▲' : '▼' }}{{ e.label }}<span class="effect-scope">{{ e.scopeLabel }}</span></span>
        </div>
      </div>

      <div v-if="passives.length > 0" class="info-skill-group">
        <div class="info-skill-group-title"><GlossaryTerm term-id="passive">パッシブ</GlossaryTerm></div>
        <div v-for="p in passives" :key="p.id" class="skill-row">
          <div class="skill-row-head">{{ p.label }} <span v-if="p.level">Lv{{ p.level }}</span></div>
          <SkillText :tokens="p.effectTokens" />
        </div>
      </div>

      <div v-if="traits.length > 0" class="info-skill-group">
        <div class="info-skill-group-title"><GlossaryTerm term-id="trait">特性</GlossaryTerm></div>
        <div v-for="t in traits" :key="t.id" class="skill-row">
          <div class="skill-row-head">{{ t.label }}</div>
          <SkillText :tokens="t.effectTokens" />
        </div>
      </div>
    </div>

    <div v-else-if="currentEnemy" class="info-char-pane">
      <div class="info-char-head">
        <PixelSprite :sprite-id="currentEnemy.spriteId" :target-height="96" />
        <div class="info-hp-bar">
          <div class="info-hp-track"><div class="info-hp-fill" :style="{ width: `${hpPct(currentEnemy)}%` }" /></div>
          <span class="info-hp-num">{{ Math.max(0, Math.floor(currentEnemy.hp)) }}/{{ Math.floor(currentEnemy.maxHp) }}</span>
        </div>
      </div>
      <div class="stat-grid">
        <div v-for="s in currentEnemy.stats" :key="s.key" class="stat-cell">
          <span class="stat-name"><GlossaryTerm :term-id="s.key">{{ s.label }}</GlossaryTerm></span>
          <span class="stat-values">実効 {{ fmt(s.effective, s.isPercent) }} / 基礎 {{ fmt(s.base, s.isPercent) }}</span>
        </div>
      </div>

      <template v-if="currentEnemy.skills">
        <div v-if="currentEnemy.skills.actives.length > 0" class="info-skill-group">
          <div class="info-skill-group-title"><GlossaryTerm term-id="active">アクティブスキル</GlossaryTerm></div>
          <div v-for="a in currentEnemy.skills.actives" :key="a.id" class="skill-row">
            <div class="skill-row-head">{{ a.label }} <span v-if="a.level">Lv{{ a.level }}</span></div>
            <SkillText :tokens="a.effectTokens" />
            <div class="skill-flavor">「{{ a.flavorText }}」</div>
          </div>
        </div>
        <div v-if="currentEnemy.skills.passives.length > 0" class="info-skill-group">
          <div class="info-skill-group-title"><GlossaryTerm term-id="passive">パッシブ</GlossaryTerm></div>
          <div v-for="p in currentEnemy.skills.passives" :key="p.id" class="skill-row">
            <div class="skill-row-head">{{ p.label }} <span v-if="p.level">Lv{{ p.level }}</span></div>
            <SkillText :tokens="p.effectTokens" />
            <div class="skill-flavor">「{{ p.flavorText }}」</div>
          </div>
        </div>
        <div v-if="currentEnemy.skills.traits.length > 0" class="info-skill-group">
          <div class="info-skill-group-title"><GlossaryTerm term-id="trait">特性</GlossaryTerm></div>
          <div v-for="t in currentEnemy.skills.traits" :key="t.id" class="skill-row">
            <div class="skill-row-head">{{ t.label }}</div>
            <SkillText :tokens="t.effectTokens" />
            <div class="skill-flavor">「{{ t.flavorText }}」</div>
          </div>
        </div>
      </template>
    </div>

    <div v-else-if="currentSkill" class="skill-row detail">
      <div class="skill-row-head">{{ currentSkill.label }} <span v-if="currentSkill.level">Lv{{ currentSkill.level }}</span></div>
      <SkillText :tokens="currentSkill.effectTokens" />
      <div class="skill-flavor">「{{ currentSkill.flavorText }}」</div>
    </div>
  </InfoPanelShell>
</template>

<style scoped>
.info-char-pane {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.info-char-head {
  display: flex;
  align-items: center;
  gap: 16px;
}
.info-hp-bar {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 8px;
}
.info-hp-track {
  position: relative;
  flex: 1;
  height: 10px;
  background: rgba(0, 0, 0, 0.4);
  border-radius: 5px;
  overflow: hidden;
}
.info-hp-fill {
  height: 100%;
  background: linear-gradient(180deg, #ffd07a 0%, #e88a2a 55%, #b4550f 100%);
}
.info-hp-num {
  font-size: 13px;
  white-space: nowrap;
}
.stat-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 6px 16px;
}
.stat-cell {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
}
.stat-name { opacity: 0.85; }
.stat-values { font-size: 12px; opacity: 0.9; }
.info-skill-group {
  border-top: 1px solid var(--battle-frame-border);
  padding-top: 10px;
}
.effect-chip-row {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}
.effect-chip {
  display: flex;
  align-items: baseline;
  gap: 3px;
  padding: 2px 8px;
  font-size: 12px;
  font-weight: 700;
  border-radius: 999px;
  color: #fff;
}
.effect-chip.buff { background: color-mix(in srgb, var(--battle-diff-plus) 55%, transparent); }
.effect-chip.debuff { background: color-mix(in srgb, var(--battle-diff-minus) 55%, transparent); }
.effect-scope {
  font-size: 10px;
  font-weight: 400;
  opacity: 0.85;
}
.info-skill-group-title {
  font-size: 11px;
  opacity: 0.65;
  margin-bottom: 6px;
}
.skill-row {
  margin-bottom: 12px;
  font-size: 13px;
}
.skill-row.detail {
  margin-bottom: 0;
}
.skill-row-head {
  font-weight: 700;
  font-size: 15px;
  margin-bottom: 4px;
}
.skill-flavor {
  opacity: 0.6;
  font-style: italic;
  font-size: 12px;
  margin-top: 4px;
}
</style>
