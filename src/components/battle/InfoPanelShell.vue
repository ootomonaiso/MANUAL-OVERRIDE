<script setup lang="ts">
/**
 * ヘルプ（遊び方）・INFO（ステータス/敵/スキル詳細）で共通の「左にセクション一覧、
 * 右に選んだ内容」という2ペイン構成のレイアウト殻。中身（右ペインの内容）は
 * 呼び出し側がスロットで差し込む。以前は小さなアイコン⇄帯のポップアップ（ヘルプ）や
 * 単一キャラのみのモーダル（INFO）だったが、情報量が増えて手狭になったため、
 * 大きな1枚のパネルへ作り直した際の共通部品。
 */
import { reactive } from 'vue'

export interface InfoNavItem {
  id: string
  label: string
}

export interface InfoNavSection extends InfoNavItem {
  /** true ならクリックでは選択せず、開閉だけするグループ見出し */
  isGroup?: boolean
  children?: InfoNavItem[]
}

const props = defineProps<{
  title: string
  sections: InfoNavSection[]
  activeId: string | null
  /** グループ見出しのうち、初期状態で開いておきたいもの */
  defaultOpenGroups?: string[]
}>()

const emit = defineEmits<{
  (e: 'update:activeId', id: string): void
  (e: 'close'): void
}>()

const openGroups = reactive(new Set(props.defaultOpenGroups ?? []))

function isGroupOpen(id: string): boolean {
  return openGroups.has(id)
}
function toggleGroup(id: string): void {
  if (openGroups.has(id)) openGroups.delete(id)
  else openGroups.add(id)
}

/** 子を持つグループは、子のどれかが選択中なら自動的に開いた状態で見せる */
function groupIsOpen(section: InfoNavSection): boolean {
  if (isGroupOpen(section.id)) return true
  return section.children?.some(c => c.id === props.activeId) ?? false
}
</script>

<template>
  <div class="info-shell-overlay" @click.self="emit('close')" @contextmenu.prevent="emit('close')">
    <div class="info-shell-card">
      <div class="info-shell-header">
        <span class="info-shell-title">{{ title }}</span>
        <button type="button" class="info-shell-close" @click="emit('close')">×</button>
      </div>
      <div class="info-shell-body">
        <nav class="info-shell-nav">
          <template v-for="s in sections" :key="s.id">
            <button
              v-if="!s.isGroup"
              type="button"
              class="nav-item"
              :class="{ active: activeId === s.id }"
              @click="emit('update:activeId', s.id)"
            >{{ s.label }}</button>
            <div v-else class="nav-group">
              <button type="button" class="nav-group-title" @click="toggleGroup(s.id)">
                <span>{{ s.label }}</span>
                <span class="nav-group-arrow">{{ groupIsOpen(s) ? '▾' : '▸' }}</span>
              </button>
              <div v-if="groupIsOpen(s)" class="nav-group-children">
                <button
                  v-for="c in s.children"
                  :key="c.id"
                  type="button"
                  class="nav-item child"
                  :class="{ active: activeId === c.id }"
                  @click="emit('update:activeId', c.id)"
                >{{ c.label }}</button>
              </div>
            </div>
          </template>
        </nav>
        <div class="info-shell-content">
          <slot :active-id="activeId" />
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
/*
 * position: fixed にしているのは意図的。呼び出し元（HelpGuide.vue の右上アイコンなど）は
 * それ自身が position:absolute かつ幅・高さを持たない小さな要素であることがあり、
 * その場合 position:absolute; inset:0 の containing block はビューポートではなく
 * その小さな要素（例: 34×34pxのアイコンボタン）に縮んでしまい、パネル全体がアイコンの
 * 近くに小さく崩れて表示・見切れる不具合になっていた（実機で確認）。fixed であれば
 * transform 等を持たない祖先を挟んでもビューポート基準で中央表示される。
 */
.info-shell-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 50;
}
.info-shell-card {
  width: 94%;
  max-width: min(90vw, 920px);
  height: 84vh;
  max-height: 720px;
  display: flex;
  flex-direction: column;
  background: color-mix(in srgb, var(--battle-panel) 97%, transparent);
  border: 2px solid var(--battle-frame-border);
  border-radius: var(--radius-md);
  color: var(--battle-text);
  font-family: var(--genre-font, var(--font-main));
  box-shadow: 0 12px 40px rgba(0, 0, 0, 0.55);
}
.info-shell-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 18px;
  border-bottom: 1px solid var(--battle-frame-border);
  flex-shrink: 0;
}
.info-shell-title {
  font-size: 17px;
  font-weight: 700;
}
.info-shell-close {
  background: none;
  border: none;
  color: inherit;
  font-size: 20px;
  cursor: pointer;
  line-height: 1;
}
.info-shell-body {
  flex: 1;
  display: flex;
  min-height: 0;
}
.info-shell-nav {
  width: 220px;
  flex-shrink: 0;
  overflow-y: auto;
  padding: 10px;
  border-right: 1px solid var(--battle-frame-border);
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.nav-item {
  text-align: left;
  padding: 7px 10px;
  background: none;
  border: none;
  border-radius: var(--radius-sm);
  color: var(--battle-text);
  font: inherit;
  font-size: 13px;
  cursor: pointer;
}
.nav-item:hover {
  background: color-mix(in srgb, var(--battle-accent) 16%, transparent);
}
.nav-item.active {
  background: color-mix(in srgb, var(--battle-accent) 30%, transparent);
  font-weight: 700;
}
.nav-item.child {
  padding-left: 20px;
  font-size: 12px;
}
.nav-group-title {
  width: 100%;
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 7px 10px;
  background: none;
  border: none;
  color: var(--battle-text);
  font: inherit;
  font-size: 12px;
  opacity: 0.85;
  letter-spacing: 0.5px;
  cursor: pointer;
}
.nav-group-arrow {
  opacity: 0.6;
}
.nav-group-children {
  display: flex;
  flex-direction: column;
  gap: 2px;
}
.info-shell-content {
  flex: 1;
  min-width: 0;
  overflow-y: auto;
  padding: 18px 22px;
}
</style>
