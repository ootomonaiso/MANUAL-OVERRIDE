<script setup lang="ts">
/**
 * 用語をクリック可能にする薄いラッパー。押すとクリック位置の近くに簡易説明の
 * ポップアップ（GlossaryTermPopup、HelpGuide.vue が保持）が出る。定義自体は
 * 持たず、termId で src/data/rpg/battle-guide.json を指すだけ。
 */
import { useGlossaryPanel } from '../../composables/useGlossaryPanel'

const props = defineProps<{
  termId: string
}>()

const { openTermPopup } = useGlossaryPanel()

function onClick(e: MouseEvent): void {
  const rect = (e.currentTarget as HTMLElement).getBoundingClientRect()
  openTermPopup(props.termId, { x: rect.left + rect.width / 2, y: rect.bottom })
}
</script>

<template>
  <button type="button" class="glossary-term" @click.stop="onClick">
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
