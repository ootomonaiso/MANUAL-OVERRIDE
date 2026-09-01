<script setup lang="ts">
/**
 * 効果解決（ロジック）とエフェクト再生（演出）を分離する方針（05-skills.md）に従い、
 * useBattleState.effectQueue に積まれたリクエストを引き取って表示するだけの純粋な演出層。
 *
 * 簡略化: 各キャラクター位置に浮かせるのではなく、画面下のログ風トーストとして表示する
 * （キャラクターのDOM座標追跡は本実装では行っていない）。
 */
import { ref, watch } from 'vue'
import type { EffectRequest } from '../../domain/battle/types'
import { BATTLE_EFFECTS } from '../../data/battleContent'
import { BATTLE } from '../../data/tunables'

const props = defineProps<{
  queueLength: number
  consume: () => EffectRequest | undefined
  labelFor: (id: string | undefined) => string
}>()

interface Toast { key: number; text: string; color: string }
const toasts = ref<Toast[]>([])
let seq = 0

watch(() => props.queueLength, () => { drain() })

function drain(): void {
  let index = 0
  let req = props.consume()
  while (req) {
    scheduleToast(req, index * BATTLE.multiHitIntervalMs)
    index++
    req = props.consume()
  }
}

function scheduleToast(req: EffectRequest, delayMs: number): void {
  setTimeout(() => {
    const def = BATTLE_EFFECTS.get(req.effectId)
    const duration = def?.durationMs ?? 300
    const color = def?.visual.color ?? 'var(--battle-number)'
    const text = req.payload?.text ?? def?.label ?? req.effectId
    const who = props.labelFor(req.combatantId)
    const key = seq++
    toasts.value.push({ key, text: who ? `${who}: ${text}` : text, color })
    setTimeout(() => { toasts.value = toasts.value.filter(t => t.key !== key) }, duration + 500)
  }, delayMs)
}
</script>

<template>
  <div class="effect-layer">
    <TransitionGroup name="toast" tag="div" class="toast-stack">
      <div v-for="t in toasts" :key="t.key" class="toast" :style="{ color: t.color }">
        {{ t.text }}
      </div>
    </TransitionGroup>
  </div>
</template>

<style scoped>
.effect-layer {
  position: absolute;
  left: 0;
  right: 0;
  bottom: 8px;
  display: flex;
  justify-content: center;
  pointer-events: none;
  z-index: 25;
}
.toast-stack {
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  gap: 2px;
}
.toast {
  font-size: 12px;
  font-weight: 700;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.8);
}
.toast-enter-active, .toast-leave-active {
  transition: opacity 0.3s ease, transform 0.3s ease;
}
.toast-enter-from {
  opacity: 0;
  transform: translateY(6px);
}
.toast-leave-to {
  opacity: 0;
  transform: translateY(-10px);
}
</style>
