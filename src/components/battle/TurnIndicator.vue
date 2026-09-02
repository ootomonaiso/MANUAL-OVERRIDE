<script setup lang="ts">
/** 画面右上の進行表示。何戦目の何ターン目で、いま誰の手番かを常に見せる。 */
defineProps<{
  battleNumber: number
  turnNumber: number
  actorLabel: string
  isPlayerTurn: boolean
  backgroundLabel: string
}>()
</script>

<template>
  <div class="turn-indicator">
    <div class="turn-line">
      <span class="turn-battle">第{{ battleNumber }}戦</span>
      <span class="turn-count">ターン {{ turnNumber }}</span>
    </div>
    <div class="turn-actor" :class="{ player: isPlayerTurn }">{{ actorLabel }}</div>
    <div v-if="backgroundLabel" class="turn-place">{{ backgroundLabel }}</div>
  </div>
</template>

<style scoped>
.turn-indicator {
  position: absolute;
  top: 8px;
  right: 10px;
  z-index: 18;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 1px;
  padding: 5px 10px;
  border: 1px solid var(--battle-frame-border);
  border-radius: var(--radius-sm);
  background: color-mix(in srgb, var(--battle-panel) 78%, transparent);
  color: var(--battle-text);
  font-family: var(--genre-font, var(--font-main));
  pointer-events: none;
}
.turn-line {
  display: flex;
  align-items: baseline;
  gap: 8px;
}
.turn-battle {
  font-size: 10px;
  opacity: 0.75;
}
.turn-count {
  font-size: 15px;
  font-weight: 700;
  letter-spacing: 1px;
  color: var(--battle-accent);
}
.turn-actor {
  font-size: 10px;
  opacity: 0.85;
}
.turn-actor.player {
  color: var(--battle-accent);
  font-weight: 700;
  opacity: 1;
}
.turn-place {
  font-size: 9px;
  opacity: 0.5;
}
</style>
