<script setup lang="ts">
/**
 * 戦闘に立つ1体分の表示。
 *
 * HP・予告はキャラクターの**外**（頭上・足元）に置き、ドット絵の身体には重ねない
 * （身体の上に文字を乗せると、参考にした画面同様に読みにくくなるため）。
 * next-chip（頭上）→ sprite-stage（本体）→ hp-pill（足元）を通常のフローで縦に積むだけで、
 * 絶対配置の座標合わせを避けて重なりを構造的に防いでいる。
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
  nextMarkColor?: string
  /** 対象選択中に光らせる */
  targetable?: boolean
  /** 待機モーションの位相をずらすための種。並んだ敵が同じ動きで揺れて見えないようにする */
  idleSeed?: number
}>(), {
  attacking: false, flash: null, popups: () => [], isBoss: false,
  nextSkillLabel: null, nextDamageLabel: null, nextMarkColor: 'var(--battle-element-physical)',
  targetable: false, idleSeed: 0,
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

const idleStyle = computed(() => ({ '--idle-delay': `${-(props.idleSeed * 0.55)}s` }))

/**
 * 着弾の飛散とリング。フラッシュが立つたびに撒き直す。
 * 角度は固定値で、CSS変数として各粒へ渡す（乱数だと毎回描き直しになる）。
 */
const BURST_DIRECTIONS = [
  [0, -1], [0.5, -0.87], [0.87, -0.5], [1, 0],
  [0.87, 0.5], [0.5, 0.87], [0, 1], [-0.5, 0.87],
  [-0.87, 0.5], [-1, 0], [-0.87, -0.5], [-0.5, -0.87],
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
    <div v-if="side === 'enemy' && alive" class="next-chip">
      <div class="next-head">NEXT</div>
      <div class="next-skill">
        <span class="next-mark" :style="{ background: nextMarkColor }" />{{ nextSkillLabel ?? '様子を見ている' }}
      </div>
      <div v-if="nextDamageLabel" class="next-damage">{{ nextDamageLabel }}</div>
    </div>

    <div class="sprite-stage">
      <div class="idle-aura" aria-hidden="true" />
      <div class="sprite-box" :class="{ attacking, flashing: flash !== null }" :style="idleStyle">
        <PixelSprite :sprite-id="spriteId" :frame="frame" :tint="tint" :target-height="spriteHeight" />
        <template v-if="flash">
          <div :key="`ring-${burstKey}`" class="hit-ring" :style="{ '--ring-color': burstColor }" />
          <div :key="`burst-${burstKey}`" class="hit-burst">
            <span
              v-for="(d, i) in BURST_DIRECTIONS"
              :key="i"
              class="burst-dot"
              :class="{ big: i % 3 === 0 }"
              :style="{ '--dx': d[0], '--dy': d[1], background: burstColor }"
            />
          </div>
        </template>
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
    </div>

    <div v-if="alive" class="hp-pill">
      <span class="hp-name">{{ label }}</span>
      <div class="hp-track">
        <div class="hp-fill" :style="{ width: `${hpRatio * 100}%` }" />
        <div v-if="shield > 0" class="shield-fill" :style="{ width: `${Math.min(1, shieldRatio) * 100}%` }" />
      </div>
      <span class="hp-num">{{ Math.max(0, Math.floor(hp)) }}/{{ Math.floor(maxHp) }}</span>
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
  to { filter: drop-shadow(0 0 12px rgba(255, 210, 120, 0.95)); }
}

/* ── 本体（余白付きの箱にして、頭上・足元の要素と絶対配置で衝突しないようにする） ── */
.sprite-stage {
  position: relative;
  display: flex;
  align-items: flex-end;
  justify-content: center;
}
.sprite-box {
  position: relative;
  z-index: 1;
  display: flex;
  align-items: flex-end;
  justify-content: center;
  filter: drop-shadow(0 6px 8px rgba(0, 0, 0, 0.55));
  animation: idle-bob var(--idle-dur, 2.6s) ease-in-out infinite;
  animation-delay: var(--idle-delay, 0s);
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
  z-index: -1;
}
@keyframes idle-bob {
  0%, 100% { transform: translateY(0) scale(1, 1); }
  50% { transform: translateY(-4px) scale(1.015, 0.985); }
}
.char-unit.enemy .sprite-box { --idle-dur: 2.3s; }
.char-unit.player .sprite-box { --idle-dur: 2.8s; }

/* 生きている気配を足す常時グロー。攻撃・被弾の演出を邪魔しないよう本体の下に敷く */
.idle-aura {
  position: absolute;
  left: 50%;
  top: 58%;
  width: 68%;
  aspect-ratio: 1;
  transform: translate(-50%, -50%);
  border-radius: 50%;
  background: radial-gradient(circle, color-mix(in srgb, var(--battle-accent) 55%, transparent) 0%, transparent 72%);
  filter: blur(7px);
  opacity: 0.3;
  animation: aura-pulse 3.6s ease-in-out infinite;
  pointer-events: none;
  z-index: 0;
}
.char-unit.is-boss .idle-aura {
  width: 78%;
  opacity: 0.46;
  filter: blur(10px);
  background: radial-gradient(circle, color-mix(in srgb, var(--battle-boss) 60%, transparent) 0%, transparent 74%);
}
@keyframes aura-pulse {
  0%, 100% { transform: translate(-50%, -50%) scale(0.92); opacity: 0.24; }
  50% { transform: translate(-50%, -50%) scale(1.06); opacity: 0.42; }
}

/* 生気のゆらぎ。ドット絵自体は差し替えずに、明るさを僅かに脈動させて艶を出す */
.sprite-box :deep(.pixel-sprite) {
  animation: sprite-glow 3.2s ease-in-out infinite;
  animation-delay: var(--idle-delay, 0s);
}
@keyframes sprite-glow {
  0%, 100% { filter: brightness(1) saturate(1); }
  50% { filter: brightness(1.09) saturate(1.18); }
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
  animation: hit-shake 220ms steps(5, end);
}
@keyframes hit-shake {
  0% { margin-left: 0; }
  20% { margin-left: -12px; }
  40% { margin-left: 9px; }
  60% { margin-left: -6px; }
  80% { margin-left: 3px; }
  100% { margin-left: 0; }
}
.sprite-box.flashing :deep(.pixel-sprite) {
  animation: impact-flicker 220ms steps(2, end);
}
@keyframes impact-flicker {
  0% { filter: brightness(1); }
  35% { filter: brightness(2.4) saturate(0.4); }
  70% { filter: brightness(0.7); }
  100% { filter: brightness(1); }
}

/* ── 着弾のリングと飛散 ─────────────────────────────────── */
.hit-ring {
  position: absolute;
  left: 50%;
  top: 45%;
  width: 20px;
  height: 20px;
  margin: -10px 0 0 -10px;
  border-radius: 50%;
  border: 3px solid var(--ring-color, #fff);
  z-index: 2;
  pointer-events: none;
  animation: ring-expand 380ms ease-out forwards;
}
@keyframes ring-expand {
  0% { transform: scale(0.3); opacity: 0.9; }
  100% { transform: scale(4.2); opacity: 0; }
}
.hit-burst {
  position: absolute;
  left: 50%;
  top: 45%;
  width: 0;
  height: 0;
  pointer-events: none;
  z-index: 2;
}
.burst-dot {
  position: absolute;
  width: 9px;
  height: 9px;
  margin: -4.5px 0 0 -4.5px;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.5);
  animation: burst-fly 340ms cubic-bezier(0.15, 0.8, 0.3, 1) forwards;
}
.burst-dot.big {
  width: 14px;
  height: 14px;
  margin: -7px 0 0 -7px;
}
@keyframes burst-fly {
  0% { transform: translate(0, 0) scale(1.5); opacity: 1; }
  70% { opacity: 1; }
  100% { transform: translate(calc(var(--dx) * 78px), calc(var(--dy) * 78px - 14px)) scale(0.2); opacity: 0; }
}

.popup-layer {
  position: absolute;
  left: 50%;
  bottom: 100%;
  transform: translateX(-50%);
  display: flex;
  flex-direction: column-reverse;
  align-items: center;
  gap: 2px;
  padding-bottom: 6px;
  pointer-events: none;
  z-index: 6;
  white-space: nowrap;
}
.damage-popup {
  font-size: 36px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -1px;
  -webkit-text-stroke: 3px rgba(0, 0, 0, 0.85);
  paint-order: stroke fill;
}
.damage-popup.label {
  font-size: 19px;
  letter-spacing: 2px;
  -webkit-text-stroke: 2px rgba(0, 0, 0, 0.85);
}

/* ── 頭上の予告チップ ───────────────────────────────────── */
.next-chip {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 1px;
  margin-bottom: 6px;
  padding: 4px 14px 5px;
  background: color-mix(in srgb, var(--battle-panel) 82%, transparent);
  border: 1px solid var(--battle-frame-border);
  border-radius: 999px;
  text-shadow: 0 2px 4px rgba(0, 0, 0, 0.85);
}
.next-head {
  font-size: 10px;
  letter-spacing: 2px;
  color: #ffe9a8;
  opacity: 0.85;
}
.next-skill {
  display: flex;
  align-items: center;
  gap: 5px;
  font-size: 15px;
  font-weight: 700;
  color: #fff;
  white-space: nowrap;
}
.next-mark {
  width: 9px;
  height: 9px;
  box-shadow: 0 0 0 2px rgba(0, 0, 0, 0.6);
}
.next-damage {
  font-size: 11px;
  color: #ffd0a0;
}

/* ── 足元のHPプレート ───────────────────────────────────── */
.hp-pill {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: 8px;
  padding: 4px 10px;
  background: color-mix(in srgb, var(--battle-panel) 80%, transparent);
  border: 1px solid var(--battle-frame-border);
  border-radius: 999px;
  min-width: 176px;
}
.hp-name {
  font-size: 11px;
  color: #ffe9a8;
  white-space: nowrap;
}
.hp-track {
  position: relative;
  flex: 1;
  height: 7px;
  background: rgba(0, 0, 0, 0.7);
  box-shadow: 0 0 0 1px rgba(255, 255, 255, 0.12);
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
  font-size: 11px;
  color: #fff;
  letter-spacing: -0.5px;
  white-space: nowrap;
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
