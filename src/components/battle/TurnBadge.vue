<script setup lang="ts">
/** 画面左上の進行表示。斜めに切り落とした帯で、画面の角に食い込ませる。 */
defineProps<{
  turnNumber: number
  battleNumber: number
  actorLabel: string
}>()
</script>

<template>
  <div class="turn-badge">
    <div class="turn-caption">TURN</div>
    <div class="turn-value">{{ turnNumber }}</div>
    <div class="turn-sub">第{{ battleNumber }}戦 / {{ actorLabel }}</div>
  </div>
</template>

<style scoped>
.turn-badge {
  position: absolute;
  top: 0;
  left: 0;
  z-index: 18;
  padding: 6px 40px 16px 14px;
  background: rgba(52, 42, 34, 0.92);
  /* 右下を斜めに落として、角から生えた帯に見せる */
  clip-path: polygon(0 0, 100% 0, calc(100% - 34px) 100%, 0 100%);
  color: #f2ecdd;
  pointer-events: none;
  line-height: 1.05;
}
.turn-caption {
  font-size: 12px;
  letter-spacing: 4px;
  opacity: 0.85;
}
.turn-value {
  font-size: 30px;
  font-weight: 800;
  letter-spacing: 2px;
}
.turn-sub {
  margin-top: 2px;
  font-size: 10px;
  opacity: 0.65;
  letter-spacing: 1px;
}
</style>
