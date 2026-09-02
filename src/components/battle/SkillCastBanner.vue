<script setup lang="ts">
/**
 * 行動が解決される前に、誰が何を使うのかを一瞬だけ大きく出す札。
 * プレイヤー・敵のどちらの手番でも同じ形式で出す（行動順が入れ替わっても手応えを揃えるため）。
 */
import { computed } from 'vue'
import type { Element } from '../../domain/battle/types'

const props = defineProps<{
  visible: boolean
  /** 同じスキルを連続で使ったときもアニメーションを撃ち直すためのキー */
  seq: number
  actorLabel: string
  skillLabel: string
  element: Element | null
  isPlayer: boolean
}>()

const ELEMENT_COLOR: Record<Element, string> = {
  physical: 'var(--battle-element-physical)',
  magical: 'var(--battle-element-magical)',
  special: 'var(--battle-element-special)',
}

const accent = computed(() => props.element ? ELEMENT_COLOR[props.element] : 'var(--battle-accent)')
</script>

<template>
  <Transition name="banner">
    <div
      v-if="visible && skillLabel"
      :key="seq"
      class="skill-cast-banner"
      :class="{ player: isPlayer, enemy: !isPlayer }"
      :style="{ '--banner-accent': accent }"
    >
      <span class="banner-actor">{{ actorLabel }}</span>
      <span class="banner-pill">
        <span class="banner-mark" />{{ skillLabel }}
      </span>
    </div>
  </Transition>
</template>

<style scoped>
.skill-cast-banner {
  position: absolute;
  /* 敵と自キャラの間。敵のHPバーや予告を隠さない高さ */
  top: 58%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  pointer-events: none;
  z-index: 20;
  white-space: nowrap;
}
.banner-actor {
  font-size: 12px;
  letter-spacing: 2px;
  color: #f2ecdd;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.9);
}
.banner-pill {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 7px 40px;
  background: #f6e3cf;
  border-bottom: 4px solid var(--banner-accent);
  border-radius: 999px;
  color: #4a2a1e;
  font-size: 24px;
  font-weight: 700;
  letter-spacing: 4px;
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.5);
}
.banner-mark {
  width: 14px;
  height: 14px;
  background: var(--banner-accent);
  transform: rotate(45deg);
}
.banner-enter-active {
  transition: opacity 120ms ease-out, transform 240ms cubic-bezier(0.15, 1.3, 0.4, 1);
}
.banner-leave-active {
  transition: opacity 180ms ease-in, transform 180ms ease-in;
}
.skill-cast-banner.player.banner-enter-from {
  opacity: 0;
  transform: translate(-50%, -50%) translateX(-60px);
}
.skill-cast-banner.enemy.banner-enter-from {
  opacity: 0;
  transform: translate(-50%, -50%) translateX(60px);
}
.banner-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(1.08);
}
</style>
