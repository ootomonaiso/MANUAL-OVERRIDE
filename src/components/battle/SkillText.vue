<script setup lang="ts">
import type { SkillTextToken } from '../../domain/battle/skillText'

defineProps<{
  tokens: readonly SkillTextToken[]
}>()
</script>

<template>
  <span class="skill-text">
    <span
      v-for="(tok, i) in tokens"
      :key="i"
      :class="[`tok-${tok.type}`, tok.element ? `tok-element-${tok.element}` : '']"
    >{{ tok.text }}</span>
  </span>
</template>

<style scoped>
.skill-text {
  line-height: 1.6;
}
.tok-stat {
  color: var(--battle-stat);
  font-weight: 700;
}
.tok-element-physical {
  color: var(--battle-element-physical);
  font-weight: 700;
}
.tok-element-magical {
  color: var(--battle-element-magical);
  font-weight: 700;
}
.tok-element-special {
  color: var(--battle-element-special);
  font-weight: 700;
}
.tok-number {
  color: var(--battle-number);
  font-weight: 700;
}
.tok-plain {
  color: inherit;
}
</style>
