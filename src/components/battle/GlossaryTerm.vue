<script setup lang="ts">
/**
 * 用語をクリック可能にする薄いラッパー。押すと右上のヘルプアイコン（HelpGuide.vue）が
 * 用語解説の帯に変わる。定義自体は持たず、termId で src/data/battle-guide.json を指すだけ。
 */
import { useGlossaryPanel } from '../../composables/useGlossaryPanel'

defineProps<{
  termId: string
}>()

const { openTerm } = useGlossaryPanel()
</script>

<template>
  <button type="button" class="glossary-term" @click.stop="openTerm(termId)">
    <slot />
  </button>
</template>

<style scoped>
.glossary-term {
  display: inline;
  background: none;
  border: none;
  padding: 0;
  margin: 0;
  font: inherit;
  color: inherit;
  cursor: help;
  text-decoration: underline dotted;
  text-underline-offset: 3px;
  text-decoration-color: color-mix(in srgb, currentColor 55%, transparent);
}
.glossary-term:hover {
  text-decoration-style: solid;
}
</style>
