<script setup lang="ts">
/**
 * プレイヤー自身の足元（HPプレートの真下）に積む、いま効いているもの
 * （特性・一時的なバフ/デバフ）の一覧。敵の頭上/足元バッジと同じく、本人の
 * 見た目に紐づく位置に置くことで「誰の効果か」が一目でわかるようにしている。
 * 戦闘中は数字より「何が効いているか」の方を早く読みたいので、名前だけを並べる。
 * バフ（上昇）とデバフ（低下）は矢印と色で見分けられるようにし、一時効果には
 * いつまで効くか（このターンのみ／この戦闘中）も添える。
 */
export interface BuffEntry {
  id: string
  label: string
  /** 特性のように戦闘中は外せないもの。true なら isBuff/scopeLabel は無視する */
  permanent: boolean
  color: string
  isBuff?: boolean
  scopeLabel?: string
}

defineProps<{
  entries: BuffEntry[]
}>()
</script>

<template>
  <div v-if="entries.length > 0" class="buff-strip">
    <div
      v-for="e in entries"
      :key="e.id"
      class="buff-item"
      :class="{ buff: e.isBuff === true, debuff: e.isBuff === false }"
    >
      <span class="buff-mark" :style="{ background: e.color }" />
      <span v-if="e.isBuff === true" class="buff-arrow" aria-hidden="true">▲</span>
      <span v-else-if="e.isBuff === false" class="buff-arrow down" aria-hidden="true">▼</span>
      <span class="buff-label">{{ e.label }}</span>
      <span v-if="e.permanent" class="buff-lock">🔒</span>
      <span v-else-if="e.scopeLabel" class="buff-scope">{{ e.scopeLabel }}</span>
    </div>
  </div>
</template>

<style scoped>
.buff-strip {
  position: absolute;
  left: 50%;
  top: 100%;
  transform: translateX(-50%);
  margin-top: 4px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 3px;
  pointer-events: none;
  white-space: nowrap;
}
.buff-item {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 12px;
  color: #f2ecdd;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.9);
}
.buff-mark {
  width: 12px;
  height: 12px;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.6);
}
.buff-arrow {
  font-size: 10px;
  color: var(--battle-diff-plus);
}
.buff-arrow.down {
  color: var(--battle-diff-minus);
}
.buff-lock {
  font-size: 10px;
  opacity: 0.7;
}
.buff-scope {
  font-size: 10px;
  opacity: 0.65;
}
</style>
