<script setup lang="ts">
export interface TurnQueueEntryView {
  id: string
  label: string
  isPlayer: boolean
  isCurrent: boolean
}

export interface EnemyNextSkillView {
  enemyLabel: string
  skillLabel: string | null
}

defineProps<{
  entries: TurnQueueEntryView[]
  enemyNextSkills: EnemyNextSkillView[]
}>()
</script>

<template>
  <div class="turn-queue-bar">
    <div class="queue-row">
      <span
        v-for="e in entries"
        :key="e.id"
        class="queue-chip"
        :class="{ current: e.isCurrent, player: e.isPlayer }"
      >{{ e.label }}</span>
    </div>
    <div v-if="enemyNextSkills.length > 0" class="next-skills-row">
      <span v-for="(n, i) in enemyNextSkills" :key="i" class="next-skill-chip">
        {{ n.enemyLabel }}: {{ n.skillLabel ?? '（様子見）' }}
      </span>
    </div>
  </div>
</template>

<style scoped>
.turn-queue-bar {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px 10px;
  font-size: 10px;
  color: var(--genre-text, var(--text));
}
.queue-row, .next-skills-row {
  display: flex;
  gap: 6px;
  flex-wrap: wrap;
}
.queue-chip {
  padding: 2px 8px;
  border: 1px solid var(--genre-border, var(--green-dim));
  border-radius: 999px;
  opacity: 0.6;
}
.queue-chip.current {
  opacity: 1;
  border-color: var(--genre-accent, var(--green));
  color: var(--genre-accent, var(--green));
  font-weight: 700;
}
.next-skill-chip {
  opacity: 0.7;
}
</style>
