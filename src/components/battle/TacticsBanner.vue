<script setup lang="ts">
/**
 * 「今はこちらが手を決める番だ」ことを画面全体で示す斜めの帯。
 * 右上と左下の対角に置き、キャラクターと情報の邪魔にならない隅だけを使う。
 */
defineProps<{
  visible: boolean
  text: string
}>()
</script>

<template>
  <Transition name="tactics">
    <div v-if="visible" class="tactics-banner" aria-hidden="true">
      <div class="tactics-stripe top"><span>{{ text }}</span></div>
      <div class="tactics-stripe bottom"><span>{{ text }}</span></div>
    </div>
  </Transition>
</template>

<style scoped>
.tactics-banner {
  position: absolute;
  inset: 0;
  pointer-events: none;
  z-index: 12;
  overflow: hidden;
}
.tactics-stripe {
  position: absolute;
  width: 60%;
  padding: 5px 0;
  background: rgba(214, 44, 44, 0.9);
  border-top: 3px solid #ffdede;
  border-bottom: 3px solid #6e0f0f;
  text-align: center;
  color: #fff;
  font-size: 22px;
  font-weight: 800;
  font-style: italic;
  letter-spacing: 3px;
  text-shadow: 2px 2px 0 rgba(0, 0, 0, 0.5);
  white-space: nowrap;
  overflow: hidden;
}
.tactics-stripe.top {
  top: 6%;
  right: -14%;
  transform: rotate(-24deg);
}
.tactics-stripe.bottom {
  bottom: 8%;
  left: -14%;
  transform: rotate(-24deg);
}
.tactics-enter-active {
  transition: opacity 220ms ease-out;
}
.tactics-leave-active {
  transition: opacity 160ms ease-in;
}
.tactics-enter-from,
.tactics-leave-to {
  opacity: 0;
}
</style>
