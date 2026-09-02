<script setup lang="ts">
/** 手番で最初に出す行動の大分類。吹き出し型にして「キャラが考えている」体にする。 */
export interface CommandEntry {
  id: string
  label: string
  disabled?: boolean
}

defineProps<{
  entries: CommandEntry[]
  activeId: string | null
}>()

const emit = defineEmits<{
  (e: 'select', id: string): void
  (e: 'hover', id: string | null): void
}>()
</script>

<template>
  <div class="command-menu">
    <div class="command-title">COMMAND</div>
    <div class="command-box">
      <div class="command-body">
        <button
        v-for="entry in entries"
        :key="entry.id"
        type="button"
        class="command-item"
        :class="{ active: entry.id === activeId }"
        :disabled="entry.disabled"
        @click="emit('select', entry.id)"
        @mouseenter="emit('hover', entry.id)"
        @mouseleave="emit('hover', null)"
        >{{ entry.label }}</button>
      </div>
    </div>
  </div>
</template>

<style scoped>
.command-menu {
  position: relative;
  width: 210px;
  color: #4a2a1e;
  /* BATTLE の一覧から戻ってきた際に、意思決定へ戻った手応えを出す入場アニメーション。
     @keyframes menu-pop-in は BattleScreen.vue の説明コメント参照 */
  animation: menu-pop-in 220ms cubic-bezier(0.2, 1, 0.3, 1);
}
@keyframes menu-pop-in {
  from { opacity: 0; transform: translateX(-18px) scale(0.95); }
  to { opacity: 1; transform: translateX(0) scale(1); }
}
/* 切り抜きは中身だけに掛ける。見出しまで clip すると文字が欠ける */
.command-box {
  padding: 14px 14px 16px;
  background: #f6e3cf;
  border: 3px solid #d9564b;
  /* 左下を尖らせて吹き出しにする */
  clip-path: polygon(0 0, 100% 0, 100% 86%, 14% 86%, 0 100%, 0 86%);
  box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45);
}
.command-title {
  position: absolute;
  top: -14px;
  left: 6px;
  z-index: 2;
  font-size: 22px;
  font-weight: 800;
  font-style: italic;
  letter-spacing: 2px;
  color: #d9564b;
  text-shadow:
    2px 0 0 #fff, -2px 0 0 #fff, 0 2px 0 #fff, 0 -2px 0 #fff,
    3px 3px 0 rgba(0, 0, 0, 0.25);
}
.command-body {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin-top: 8px;
  padding-bottom: 14px;
}
.command-item {
  padding: 5px 10px;
  background: transparent;
  border: none;
  text-align: center;
  font: inherit;
  font-size: 19px;
  letter-spacing: 3px;
  color: #4a2a1e;
  cursor: pointer;
}
.command-item:hover:not(:disabled),
.command-item.active {
  background: #f0a878;
  color: #2e170f;
}
.command-item:disabled {
  opacity: 0.35;
  cursor: not-allowed;
}
</style>
