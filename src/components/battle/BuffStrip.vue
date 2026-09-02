<script setup lang="ts">
/**
 * 画面左下に積む、いま効いているもの（特性・一時強化）の一覧。
 * 戦闘中は数字より「何が効いているか」の方を早く読みたいので、名前だけを並べる。
 */
export interface BuffEntry {
  id: string
  label: string
  /** 特性のように戦闘中は外せないもの */
  permanent: boolean
  color: string
}

defineProps<{
  entries: BuffEntry[]
}>()
</script>

<template>
  <div v-if="entries.length > 0" class="buff-strip">
    <div v-for="e in entries" :key="e.id" class="buff-item">
      <span class="buff-mark" :style="{ background: e.color }" />
      <span class="buff-label">{{ e.label }}</span>
      <span v-if="e.permanent" class="buff-lock">🔒</span>
    </div>
  </div>
</template>

<style scoped>
.buff-strip {
  position: absolute;
  left: 12px;
  bottom: 14px;
  z-index: 14;
  display: flex;
  flex-direction: column;
  gap: 3px;
  pointer-events: none;
}
.buff-item {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 13px;
  color: #f2ecdd;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.9);
}
.buff-mark {
  width: 12px;
  height: 12px;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.6);
}
.buff-lock {
  font-size: 10px;
  opacity: 0.7;
}
</style>
