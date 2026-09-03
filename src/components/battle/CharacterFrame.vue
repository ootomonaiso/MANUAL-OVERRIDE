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
import GlossaryTerm from './GlossaryTerm.vue'
import type { DamagePopup, FlashKind } from '../../composables/useBattlePresentation'

export interface AffinityPreview {
  /** 特性由来の弱点・耐性（computeAffinityStage） */
  affinity: 'weak' | 'resist' | null
  /** DEF/REFの偏りから見た構造的な相性（弱点・耐性とは別の指標） */
  effect: 'super' | 'poor' | null
}

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
  /** クリティカル（スーパークリティカル含む）で被弾した瞬間だけ true。演出を派手にする */
  critical?: boolean
  popups?: DamagePopup[]
  isBoss?: boolean
  /** 敵のみ: 次に使う技と、その被害の見込み */
  nextSkillLabel?: string | null
  nextDamageLabel?: string | null
  nextMarkColor?: string
  /** 敵のみ: COMMANDで技をホバー中の相性プレビュー（弱点/耐性・抜群/微妙） */
  affinityPreview?: AffinityPreview | null
  /** 敵のみ: 今かかっているバフ/デバフ（呪詛弾のDEF低下など）。プレイヤー側は BuffStrip に集約する */
  statusEffects?: { label: string; isBuff: boolean; scopeLabel: string }[]
  /** 対象選択中に光らせる */
  targetable?: boolean
  /** 待機モーションの位相をずらすための種。並んだ敵が同じ動きで揺れて見えないようにする */
  idleSeed?: number
}>(), {
  attacking: false, flash: null, critical: false, popups: () => [], isBoss: false,
  nextSkillLabel: null, nextDamageLabel: null, nextMarkColor: 'var(--battle-element-physical)',
  affinityPreview: null, statusEffects: () => [], targetable: false, idleSeed: 0,
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
 * ヒットの見た目を強めてほしいというフィードバックを受け、既定の12方向から
 * 24方向へ倍増した（等間隔の角度を計算式で生成し、値を書き並べる手間を避ける）。
 */
const BURST_DOT_COUNT = 24
const BURST_DIRECTIONS = Array.from({ length: BURST_DOT_COUNT }, (_, i) => {
  const angle = (i / BURST_DOT_COUNT) * Math.PI * 2
  return [Math.sin(angle), -Math.cos(angle)] as const
})

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
    <div v-if="side === 'enemy' && alive" class="head-stack">
      <!--
        affinity-chip は position:absolute で next-chip の「左」に浮かせている。
        当初は next-chip の上に積んでいたが、頭上スペースは画面上端ぎりぎりまで
        使っており、1行だけでも実機で数px はみ出て見切れることを
        getBoundingClientRect で確認した（2行になるボス戦等ではさらに悪化する）。
        縦へ積むと head-stack 全体の高さが伸びて画面上端を突き破ってしまうため、
        next-chip と同じ高さの範囲に収まる「横」へ逃がしている。
      -->
      <div
        v-if="affinityPreview?.affinity || affinityPreview?.effect"
        class="affinity-chip"
      >
        <!--
          弱点/耐性（特性由来）と抜群/微妙（DEF/REFの偏り由来）は別の指標なのに
          見た目がほぼ同じバッジだったため区別しづらいというフィードバックを受け、
          行を分けたうえで前者は丸バッジ・後者は菱形バッジと形自体を変えている。
        -->
        <div v-if="affinityPreview?.affinity" class="affinity-row">
          <GlossaryTerm v-if="affinityPreview.affinity === 'weak'" term-id="weak" class="affinity-tag pill weak">▲弱点</GlossaryTerm>
          <GlossaryTerm v-else term-id="resist" class="affinity-tag pill resist">▼耐性</GlossaryTerm>
        </div>
        <div v-if="affinityPreview?.effect" class="affinity-row">
          <GlossaryTerm v-if="affinityPreview.effect === 'super'" term-id="super_effective" class="affinity-tag diamond super"><span>◆抜群</span></GlossaryTerm>
          <GlossaryTerm v-else term-id="poor_effective" class="affinity-tag diamond poor"><span>◇微妙</span></GlossaryTerm>
        </div>
      </div>

      <div class="next-chip">
        <div class="next-head">NEXT</div>
        <div class="next-skill">
          <span class="next-mark" :style="{ background: nextMarkColor }" />{{ nextSkillLabel ?? '何もしていない' }}
        </div>
        <div v-if="nextDamageLabel" class="next-damage">{{ nextDamageLabel }}</div>
      </div>
    </div>

    <div class="sprite-stage">
      <div class="idle-aura" aria-hidden="true" />
      <div class="sprite-box" :class="{ attacking, flashing: flash !== null }" :style="idleStyle">
        <PixelSprite :sprite-id="spriteId" :frame="frame" :tint="tint" :target-height="spriteHeight" />
        <template v-if="flash">
          <div
            :key="`ring-${burstKey}`"
            class="hit-ring"
            :class="{ critical }"
            :style="{ '--ring-color': burstColor }"
          />
          <div v-if="critical" :key="`crit-ring-${burstKey}`" class="crit-ring" />
          <div :key="`burst-${burstKey}`" class="hit-burst" :class="{ critical }">
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
      <span v-if="shield > 0" class="hp-shield-num">+{{ Math.floor(shield) }}</span>
    </div>

    <div v-if="alive && statusEffects.length > 0" class="status-row">
      <span
        v-for="s in statusEffects"
        :key="s.label"
        class="status-chip"
        :class="{ buff: s.isBuff, debuff: !s.isBuff }"
      >{{ s.isBuff ? '▲' : '▼' }}{{ s.label }}<span class="status-scope">{{ s.scopeLabel }}</span></span>
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
/* クリティカル時はリングを一回り大きく、より長く見せる */
.hit-ring.critical {
  border-width: 4px;
  animation-name: ring-expand-critical;
  animation-duration: 460ms;
}
@keyframes ring-expand-critical {
  0% { transform: scale(0.3); opacity: 1; }
  100% { transform: scale(6); opacity: 0; }
}
/* クリティカル専用: 金色のリングをもう1本、逆位相で重ねて派手さを足す */
.crit-ring {
  position: absolute;
  left: 50%;
  top: 45%;
  width: 20px;
  height: 20px;
  margin: -10px 0 0 -10px;
  border-radius: 50%;
  border: 3px solid #ffd23a;
  z-index: 2;
  pointer-events: none;
  animation: crit-ring-expand 520ms ease-out forwards;
}
@keyframes crit-ring-expand {
  0% { transform: scale(0.2); opacity: 1; }
  100% { transform: scale(7.5); opacity: 0; }
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
/* クリティカル時は飛散量そのもの（距離・粒サイズ）を一回り増やす */
.hit-burst.critical .burst-dot {
  width: 12px;
  height: 12px;
  margin: -6px 0 0 -6px;
  animation-name: burst-fly-critical;
  animation-duration: 460ms;
}
.hit-burst.critical .burst-dot.big {
  width: 18px;
  height: 18px;
  margin: -9px 0 0 -9px;
}
@keyframes burst-fly {
  0% { transform: translate(0, 0) scale(1.5); opacity: 1; }
  70% { opacity: 1; }
  100% { transform: translate(calc(var(--dx) * 90px), calc(var(--dy) * 90px - 16px)) scale(0.2); opacity: 0; }
}
@keyframes burst-fly-critical {
  0% { transform: translate(0, 0) scale(1.8); opacity: 1; }
  70% { opacity: 1; }
  100% { transform: translate(calc(var(--dx) * 130px), calc(var(--dy) * 130px - 22px)) scale(0.2); opacity: 0; }
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
  /* .char-unit / .sprite-stage はどちらも z-index を持たないため、この値は
     .battle-field 直下（SkillCastBanner の z-index:20 と同じ階層）で比較される。
     ダメージ表記は解決フェーズ中もバナーが残っている間ずっと出ているため、
     バナーより確実に手前へ出す（そうしないと自キャラの数字がバナーの裏に隠れる）。 */
  z-index: 22;
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

/* ── 相性プレビュー（COMMANDで技をホバー中のみ出る） ───────── */
/* .head-stack の通常フローには乗せず、next-chip の上に絶対配置で浮かせる。
   でないとホバーのたびに頭上スペース全体の高さが変わり、画面上端に近い
   敵の頭上要素が見切れてしまう（next-chip 側の説明コメントも参照） */
.affinity-chip {
  position: absolute;
  right: 100%;
  top: 50%;
  transform: translateY(-50%);
  margin-right: 6px;
  display: flex;
  flex-direction: column;
  align-items: flex-end;
  gap: 2px;
  white-space: nowrap;
}
.affinity-row {
  display: flex;
  gap: 3px;
}
.affinity-tag {
  padding: 1px 6px;
  font-size: 9px;
  font-weight: 700;
  letter-spacing: 0.5px;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
  white-space: nowrap;
}
/* 弱点/耐性（特性由来）は丸いバッジ */
.affinity-tag.pill {
  border-radius: 999px;
}
/* 抜群/微妙（DEF・REFの偏り由来）は角を落とした菱形風にして、見た目でも別指標だと分かるようにする */
.affinity-tag.diamond {
  border-radius: 3px;
  transform: skewX(-12deg);
}
.affinity-tag.diamond :deep(span) {
  display: inline-block;
  transform: skewX(12deg);
}
.affinity-tag.weak { background: color-mix(in srgb, var(--battle-diff-minus) 75%, transparent); }
.affinity-tag.resist { background: color-mix(in srgb, var(--battle-element-magical) 65%, transparent); }
.affinity-tag.super { background: color-mix(in srgb, var(--battle-diff-plus) 70%, transparent); color: #1a2e1a; }
.affinity-tag.poor { background: color-mix(in srgb, var(--battle-diff-muted) 70%, transparent); color: #2a2a2a; }

/* ── 頭上の予告チップ ───────────────────────────────────── */
.head-stack {
  position: relative;
}
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
/* シールドの残量を、色つきの数字で明示する（帯だけでは何ポイント残っているか読み取れないため） */
.hp-shield-num {
  font-size: 11px;
  font-weight: 700;
  color: var(--battle-category-aegis);
  letter-spacing: -0.5px;
  white-space: nowrap;
}

/* ── 敵にかかっているバフ/デバフ（頭上ではなく足元の下、HPプレートの下に積む） ── */
.status-row {
  display: flex;
  flex-wrap: wrap;
  justify-content: center;
  gap: 3px;
  margin-top: 4px;
  max-width: 200px;
}
.status-chip {
  display: flex;
  align-items: baseline;
  gap: 3px;
  padding: 1px 6px;
  font-size: 9px;
  font-weight: 700;
  border-radius: 999px;
  color: #fff;
  text-shadow: 0 1px 3px rgba(0, 0, 0, 0.85);
  white-space: nowrap;
}
.status-chip.buff { background: color-mix(in srgb, var(--battle-diff-plus) 70%, transparent); }
.status-chip.debuff { background: color-mix(in srgb, var(--battle-diff-minus) 70%, transparent); }
.status-scope {
  font-size: 8px;
  font-weight: 400;
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
