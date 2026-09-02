<script setup lang="ts">
/**
 * 戦闘に立つ1体分の表示。ドット絵の上にHPバーと予告を重ねる。
 * バーを枠として脇に置かず身体に重ねるのは、画面の主役をキャラクターにするため。
 */
import { computed, ref, watch } from 'vue'
import PixelSprite from './PixelSprite.vue'
import type { DamagePopup, FlashKind } from '../../composables/useBattlePresentation'

const props = withDefaults(defineProps<{
  label: string
  hp: number
  maxHp: number
  shield: number
  alive: boolean
  spriteId: string
  /** 'enemy' は奥、'player' は手前。攻撃モーションの向きと情報の並びが変わる */
  side: 'enemy' | 'player'
  spriteHeight: number
  attacking?: boolean
  flash?: FlashKind | null
  popups?: DamagePopup[]
  isBoss?: boolean
  /** 敵のみ: 次に使う技と、その被害の見込み */
  nextSkillLabel?: string | null
  nextDamageLabel?: string | null
  /** 対象選択中に光らせる */
  targetable?: boolean
}>(), {
  attacking: false, flash: null, popups: () => [], isBoss: false,
  nextSkillLabel: null, nextDamageLabel: null, targetable: false,
})

const emit = defineEmits<{
  (e: 'open-detail'): void
}>()

const hpRatio = computed(() => props.maxHp > 0 ? Math.max(0, Math.min(1, props.hp / props.maxHp)) : 0)
const shieldRatio = computed(() => props.maxHp > 0 ? Math.max(0, Math.min(1, props.shield / props.maxHp)) : 0)

/** 被弾は赤、シールドで受けたときは青、回復は緑のシルエットで一瞬だけ塗りつぶす */
const TINT: Record<FlashKind, string> = {
  damage: '#ff4a3a',
  shield: '#63b8ff',
  heal: '#6ee07a',
}
const tint = computed(() => props.flash ? TINT[props.flash] : null)
const frame = computed(() => props.attacking ? 'attack' : 'idle')

/**
 * 着弾の飛散。フラッシュが立つたびに撒き直す。
 * 角度は8方向の固定値で、CSS変数として各粒へ渡す（乱数だと毎回描き直しになる）。
 */
const BURST_DIRECTIONS = [
  [0, -1], [0.7, -0.7], [1, 0], [0.7, 0.7],
  [0, 1], [-0.7, 0.7], [-1, 0], [-0.7, -0.7],
] as const

const burstKey = ref(0)
const burstColor = ref<string>('#ffffff')
watch(() => props.flash, (kind) => {
  if (!kind) return
  burstColor.value = TINT[kind]
  burstKey.value++
})
</script>

<template>
  <div
    class="char-unit"
    :class="[side, { defeated: !alive, 'is-boss': isBoss, targetable }]"
    @click="emit('open-detail')"
  >
    <div class="sprite-box" :class="{ attacking, flashing: flash !== null }">
      <PixelSprite :sprite-id="spriteId" :frame="frame" :tint="tint" :target-height="spriteHeight" />
      <div v-if="flash" :key="burstKey" class="hit-burst">
        <span
          v-for="(d, i) in BURST_DIRECTIONS"
          :key="i"
          class="burst-dot"
          :style="{ '--dx': d[0], '--dy': d[1], background: burstColor }"
        />
      </div>
    </div>

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

    <div v-if="alive" class="unit-gauge">
      <template v-if="side === 'enemy'">
        <div class="next-head">Next</div>
        <div class="next-skill">
          <span class="next-mark" />{{ nextSkillLabel ?? '様子を見ている' }}
        </div>
        <div v-if="nextDamageLabel" class="next-damage">{{ nextDamageLabel }}</div>
      </template>

      <div class="hp-row">
        <span v-if="side === 'player'" class="hp-caption">HP</span>
        <div class="hp-track">
          <div class="hp-fill" :style="{ width: `${hpRatio * 100}%` }" />
          <div v-if="shield > 0" class="shield-fill" :style="{ width: `${Math.min(1, shieldRatio) * 100}%` }" />
        </div>
        <span class="hp-num">{{ Math.max(0, Math.floor(hp)) }}/{{ Math.floor(maxHp) }}</span>
      </div>
      <div class="unit-name">{{ label }}</div>
    </div>
  </div>
</template>

<style scoped>
.char-unit {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  cursor: pointer;
}
.char-unit.defeated {
  opacity: 0.22;
  filter: grayscale(1);
}
.char-unit.targetable .sprite-box {
  animation: target-pulse 0.8s ease-in-out infinite alternate;
}
@keyframes target-pulse {
  from { filter: drop-shadow(0 0 0 rgba(255, 210, 120, 0)); }
  to { filter: drop-shadow(0 0 10px rgba(255, 210, 120, 0.9)); }
}

.sprite-box {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  filter: drop-shadow(0 6px 8px rgba(0, 0, 0, 0.55));
  transition: transform 140ms ease-out;
}
/* 足元の影。これが無いとキャラクターが地面から浮いて見える */
.sprite-box::after {
  content: '';
  position: absolute;
  bottom: -4px;
  left: 50%;
  width: 60%;
  height: 10px;
  transform: translateX(-50%);
  border-radius: 50%;
  background: radial-gradient(ellipse at center, rgba(0, 0, 0, 0.55), transparent 72%);
  pointer-events: none;
}
/* 攻撃時は相手側へ踏み込む。敵は手前（下）へ、プレイヤーは奥（上）へ */
.char-unit.enemy .sprite-box.attacking {
  animation: lunge-down 420ms ease-out;
}
.char-unit.player .sprite-box.attacking {
  animation: lunge-up 420ms ease-out;
}
@keyframes lunge-down {
  0% { transform: translateY(0) scale(1); }
  35% { transform: translateY(22px) scale(1.08); }
  100% { transform: translateY(6px) scale(1.04); }
}
@keyframes lunge-up {
  0% { transform: translateY(0) scale(1); }
  35% { transform: translateY(-24px) scale(1.08); }
  100% { transform: translateY(-8px) scale(1.04); }
}
.sprite-box.flashing {
  animation: hit-shake 200ms steps(4, end);
}
@keyframes hit-shake {
  0% { margin-left: 0; }
  25% { margin-left: -9px; }
  50% { margin-left: 7px; }
  75% { margin-left: -4px; }
  100% { margin-left: 0; }
}

/* ── 着弾の飛散 ─────────────────────────────────────── */
.hit-burst {
  position: absolute;
  left: 50%;
  top: 45%;
  width: 0;
  height: 0;
  pointer-events: none;
  z-index: 5;
}
.burst-dot {
  position: absolute;
  width: 10px;
  height: 10px;
  margin: -5px 0 0 -5px;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.5);
  animation: burst-fly 260ms steps(5, end) forwards;
}
@keyframes burst-fly {
  0% { transform: translate(0, 0) scale(1.4); opacity: 1; }
  100% { transform: translate(calc(var(--dx) * 60px), calc(var(--dy) * 60px)) scale(0.4); opacity: 0; }
}

.popup-layer {
  position: absolute;
  bottom: 62%;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  gap: 2px;
  pointer-events: none;
  z-index: 6;
  white-space: nowrap;
}
.damage-popup {
  font-size: 34px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -1px;
  -webkit-text-stroke: 3px rgba(0, 0, 0, 0.85);
  paint-order: stroke fill;
}
.damage-popup.label {
  font-size: 18px;
  letter-spacing: 2px;
  -webkit-text-stroke: 2px rgba(0, 0, 0, 0.85);
}

/* ── 身体に重ねる情報 ───────────────────────────────── */
.unit-gauge {
  position: absolute;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  pointer-events: none;
  z-index: 4;
  width: 240px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.95), 0 0 2px rgba(0, 0, 0, 0.95);
}
.char-unit.enemy .unit-gauge {
  bottom: 20%;
}
/* 自キャラは画面外へ見切れているうえ、画面下端には「説明書を投げる」ボタンがある。
   どちらとも重ならない高さへ上げる */
.char-unit.player .unit-gauge {
  bottom: 34%;
}
.next-head {
  font-size: 12px;
  letter-spacing: 2px;
  color: #ffe9a8;
  opacity: 0.9;
}
.next-skill {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 19px;
  font-weight: 700;
  color: #fff;
}
.next-mark {
  width: 11px;
  height: 11px;
  background: var(--battle-element-physical);
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.6);
}
.next-damage {
  font-size: 13px;
  color: #ffd0a0;
}
.hp-row {
  display: flex;
  align-items: center;
  gap: 5px;
  width: 100%;
  margin-top: 2px;
}
.hp-caption {
  font-size: 11px;
  letter-spacing: 1px;
  color: #ffe9a8;
}
.hp-track {
  position: relative;
  flex: 1;
  height: 7px;
  background: rgba(0, 0, 0, 0.7);
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.75);
  overflow: hidden;
}
.hp-fill {
  height: 100%;
  background: linear-gradient(180deg, #ffd07a 0%, #e88a2a 55%, #b4550f 100%);
  transition: width 320ms ease-out;
}
.shield-fill {
  position: absolute;
  top: 0;
  left: 0;
  height: 100%;
  background: repeating-linear-gradient(90deg, #63b8ff 0 3px, #2f7fd0 3px 6px);
  opacity: 0.85;
}
.hp-num {
  font-size: 13px;
  color: #fff;
  letter-spacing: -0.5px;
  min-width: 96px;
  text-align: right;
}
.unit-name {
  align-self: flex-start;
  font-size: 12px;
  color: #ffe9a8;
  opacity: 0.85;
}

.popup-enter-active {
  transition: opacity 120ms ease-out, transform 300ms cubic-bezier(0.2, 1.5, 0.4, 1);
}
.popup-leave-active {
  transition: opacity 300ms ease-in, transform 300ms ease-in;
}
.popup-enter-from {
  opacity: 0;
  transform: translateY(18px) scale(0.6);
}
.popup-leave-to {
  opacity: 0;
  transform: translateY(-22px);
}
</style>
