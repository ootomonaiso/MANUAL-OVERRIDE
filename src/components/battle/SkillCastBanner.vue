<script setup lang="ts">
/**
 * 行動が解決される前に、誰が何を使うのかを一瞬だけ大きく出す帯。
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
      <span class="banner-skill">{{ skillLabel }}</span>
    </div>
  </Transition>
</template>

<style scoped>
.skill-cast-banner {
  position: absolute;
  /* 戦場の上端に出す。中央に置くと敵を隠してしまい、何に当たったのか見えなくなる */
  top: 8%;
  left: 50%;
  transform: translate(-50%, -50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
  padding: 8px 26px;
  border-top: 2px solid var(--banner-accent);
  border-bottom: 2px solid var(--banner-accent);
  background: linear-gradient(90deg, transparent, rgba(0, 0, 0, 0.78) 18%, rgba(0, 0, 0, 0.78) 82%, transparent);
  color: var(--battle-text, #f2ecdd);
  pointer-events: none;
  z-index: 20;
  white-space: nowrap;
}
.banner-actor {
  font-size: 10px;
  letter-spacing: 2px;
  opacity: 0.8;
}
.banner-skill {
  font-size: 22px;
  font-weight: 800;
  letter-spacing: 3px;
  color: var(--banner-accent);
  text-shadow: 0 0 12px color-mix(in srgb, var(--banner-accent) 60%, transparent);
}
.banner-enter-active {
  transition: opacity 120ms ease-out, transform 220ms cubic-bezier(0.15, 1.3, 0.4, 1);
}
.banner-leave-active {
  transition: opacity 180ms ease-in, transform 180ms ease-in;
}
.skill-cast-banner.player.banner-enter-from {
  opacity: 0;
  transform: translate(-50%, -50%) translateX(-40px);
}
.skill-cast-banner.enemy.banner-enter-from {
  opacity: 0;
  transform: translate(-50%, -50%) translateX(40px);
}
.banner-leave-to {
  opacity: 0;
  transform: translate(-50%, -50%) scale(1.06);
}
</style>
