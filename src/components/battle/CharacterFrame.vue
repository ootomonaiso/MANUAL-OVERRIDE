<script setup lang="ts">
import { computed } from 'vue'
import PixelSprite from './PixelSprite.vue'
import type { DamagePopup, FlashKind } from '../../composables/useBattlePresentation'

const props = withDefaults(defineProps<{
  label: string
  hp: number
  maxHp: number
  shield: number
  alive: boolean
  spriteId: string
  /** 'enemy' は奥（上段）、'player' は手前（下段）。攻撃モーションの向きが変わる */
  side: 'enemy' | 'player'
  attacking?: boolean
  flash?: FlashKind | null
  popups?: DamagePopup[]
  isBoss?: boolean
  defeated?: boolean
}>(), { attacking: false, flash: null, popups: () => [], isBoss: false, defeated: false })

const emit = defineEmits<{
  (e: 'open-detail'): void
}>()

const hpRatio = computed(() => props.maxHp > 0 ? Math.max(0, Math.min(1, props.hp / props.maxHp)) : 0)

/** 被弾は赤、シールドで受けたときは青、回復は緑のシルエットで一瞬だけ塗りつぶす */
const TINT: Record<FlashKind, string> = {
  damage: '#ff4a3a',
  shield: '#63b8ff',
  heal: '#6ee07a',
}
const tint = computed(() => props.flash ? TINT[props.flash] : null)

const frame = computed(() => props.attacking ? 'attack' : 'idle')
</script>

<template>
  <div class="char-unit" :class="[side, { defeated: defeated || !alive, 'is-boss': isBoss }]">
    <div class="popup-layer">
      <TransitionGroup name="popup">
        <div
          v-for="p in popups"
          :key="p.key"
          class="damage-popup"
          :class="{ label: p.isLabel }"
          :style="{ color: p.color }"
        >{{ p.text }}</div>
      </TransitionGroup>
    </div>

    <div class="sprite-box" :class="{ attacking, flashing: flash !== null }">
      <PixelSprite :sprite-id="spriteId" :frame="frame" :tint="tint" />
    </div>

    <button class="char-frame" type="button" @click="emit('open-detail')">
      <div class="char-label">{{ label }}</div>
      <div class="hp-bar-track">
        <div class="hp-bar-fill" :style="{ width: `${hpRatio * 100}%` }" />
        <div v-if="shield > 0" class="shield-badge">🛡{{ Math.floor(shield) }}</div>
      </div>
      <div class="hp-numbers">{{ Math.max(0, Math.floor(hp)) }} / {{ Math.floor(maxHp) }}</div>
    </button>
  </div>
</template>

<style scoped>
.char-unit {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}
.char-unit.defeated {
  opacity: 0.28;
  filter: grayscale(1);
}
.sprite-box {
  position: relative;
  width: 96px;
  height: 104px;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  filter: drop-shadow(0 4px 6px rgba(0, 0, 0, 0.45));
  transition: transform 180ms ease-out;
}
.char-unit.player .sprite-box {
  width: 124px;
  height: 140px;
}
.char-unit.is-boss .sprite-box {
  width: 168px;
  height: 176px;
}
/* 足元の影。これが無いとキャラクターが地面から浮いて見える */
.sprite-box::after {
  content: '';
  position: absolute;
  bottom: -3px;
  left: 50%;
  width: 62%;
  height: 9px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.5), transparent 72%);
  pointer-events: none;
}
/* 攻撃時は相手側へ踏み込む。敵は手前（下）へ、プレイヤーは奥（上）へ動かす */
.char-unit.enemy .sprite-box.attacking {
  transform: translateY(10px) scale(1.1);
}
.char-unit.player .sprite-box.attacking {
  transform: translateY(-12px) scale(1.12);
}
.sprite-box.flashing {
  animation: hit-shake 180ms steps(3, end);
}
@keyframes hit-shake {
  0% { margin-left: 0; }
  33% { margin-left: -6px; }
  66% { margin-left: 6px; }
  100% { margin-left: 0; }
}

.popup-layer {
  position: absolute;
  bottom: 100%;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  gap: 1px;
  pointer-events: none;
  z-index: 3;
  white-space: nowrap;
}
.damage-popup {
  font-size: 18px;
  font-weight: 800;
  line-height: 1.1;
  text-shadow:
    0 0 4px rgba(0, 0, 0, 0.9),
    1px 1px 0 rgba(0, 0, 0, 0.9);
}
.damage-popup.label {
  font-size: 12px;
  letter-spacing: 1.5px;
}
.popup-enter-active {
  transition: opacity 140ms ease-out, transform 260ms cubic-bezier(0.2, 1.4, 0.4, 1);
}
.popup-leave-active {
  transition: opacity 260ms ease-in, transform 260ms ease-in;
}
.popup-enter-from {
  opacity: 0;
  transform: translateY(14px) scale(0.7);
}
.popup-leave-to {
  opacity: 0;
  transform: translateY(-16px);
}

.char-frame {
  display: flex;
  flex-direction: column;
  gap: 3px;
  background: color-mix(in srgb, var(--battle-panel, #14121c) 62%, transparent);
  border: 1px solid var(--battle-frame-border, rgba(255, 255, 255, 0.22));
  border-radius: var(--radius-sm);
  padding: 3px 6px;
  cursor: pointer;
  font-family: var(--genre-font, var(--font-main));
  color: var(--battle-text, #f2ecdd);
  min-width: 104px;
}
.char-frame:hover {
  border-color: var(--battle-accent, #e0c46a);
}
.char-unit.is-boss .char-label {
  color: var(--battle-boss, #ff8f6a);
  font-weight: 700;
}
.char-label {
  font-size: 11px;
  text-align: center;
}
.hp-bar-track {
  position: relative;
  height: 8px;
  background: rgba(0, 0, 0, 0.55);
  border: 1px solid var(--battle-frame-border, rgba(255, 255, 255, 0.22));
  border-radius: var(--radius-sm);
  overflow: hidden;
}
.hp-bar-fill {
  height: 100%;
  background: linear-gradient(180deg, #7ee08a, #3f9e52);
  transition: width var(--transition-med);
}
.shield-badge {
  position: absolute;
  top: -3px;
  right: 2px;
  font-size: 9px;
  color: var(--battle-category-aegis);
}
.hp-numbers {
  font-size: 9px;
  text-align: center;
  opacity: 0.85;
}
</style>
